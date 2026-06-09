/**
 *  TinkerCAD assistant was developed by Ezra Golombek 2025.
 */

/**
 * Terms used:
 * UAS - Update and store: Refers to update the current data and store it.
 * UASR - Update and store and reload: Refers to to reload an entire of something and store it.
 */
// if (window !== window.top) {
// }
const Context = Object.freeze({
    GENERAL: 'general',
    ACTIVITY: 'activity',
    TEACHER: 'teacher',
    CLASSES: 'classes',
    GALLERY: 'gallery',
    ACTIVITIES: 'activities',
    PRINTER: 'printer'
})


/**
 * Utility function to copy text to the user's clipboard functionally :)
 * @param text The text to copy
 */

let copyTextToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    } else {
        fallbackCopy(text)
    }
}
let fallbackCopy = (text) => {
    let copyFrom = document.createElement("textarea")
    copyFrom.textContent = text
    document.body.appendChild(copyFrom)
    copyFrom.select()
    document.execCommand('copy')
    copyFrom.blur()
    document.body.removeChild(copyFrom)
}

/**
 * Strip everything that is not a letter or digit down to single spaces.
 * Keeps Polish diacritics (they are letters). Used for folder/file names.
 */
let sanitizeName = (s) => (s == null ? '' : String(s))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')

/** ISO-8601 week-year + week number for the given date. */
let isoWeek = (date = new Date()) => {
    let d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    let day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    let week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
    return {year: d.getUTCFullYear(), week}
}

/** Download folder name: "{year}W{week} {sanitized class name}". */
let downloadFolder = (className) => {
    let {year, week} = isoWeek()
    return `${year}W${String(week).padStart(2, '0')} ${sanitizeName(className)}`.trim()
}

/** Download file base name: "{username} {project name}". */
let downloadFileBase = (username, projectName) => sanitizeName(`${username || ''} ${projectName || ''}`)

/** CSG STL/SVG download URL for a design. */
let designDownloadUrl = (designId, format) => `https://csg-prd.tinkercad.com/things/${designId}/polysoup.${format}?rev=-1`

/** Best thumbnail URL from a design object or stored project (detail > filmstrip). */
let designThumbUrl = (d) => (d && d.thumbnail_json && (
    (d.thumbnail_json.detailThumb && d.thumbnail_json.detailThumb.url) ||
    (d.thumbnail_json.filmstrip && d.thumbnail_json.filmstrip.url))) || (d && d.thumb) || null

/** Floating, bottom-right container that stacks per-batch download toasts. */
let downloadToastContainer = null
let ensureToastContainer = () => {
    if (downloadToastContainer && document.body.contains(downloadToastContainer)) return downloadToastContainer
    downloadToastContainer = document.createElement("div")
    downloadToastContainer.id = "tcaDownloadToasts"
    Object.assign(downloadToastContainer.style, {
        position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
        display: "flex", flexDirection: "column", gap: "8px",
        fontFamily: "Open Sans, Helvetica, Arial, sans-serif", pointerEvents: "none"
    })
    document.body.appendChild(downloadToastContainer)
    return downloadToastContainer
}

/** Creates a live progress toast for one download batch. */
let createDownloadToast = (total) => {
    let toast = document.createElement("div")
    Object.assign(toast.style, {
        background: "#2c2c2c", color: "#fff", padding: "12px 14px", borderRadius: "10px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)", width: "260px", fontSize: "13px"
    })
    let label = document.createElement("div")
    Object.assign(label.style, {marginBottom: "8px", fontWeight: "600"})
    label.textContent = `Downloading… 0/${total}`
    let barOuter = document.createElement("div")
    Object.assign(barOuter.style, {height: "6px", borderRadius: "3px", background: "#555", overflow: "hidden"})
    let barInner = document.createElement("div")
    Object.assign(barInner.style, {height: "100%", width: "0%", background: "#4076c7", transition: "width 0.2s ease"})
    barOuter.appendChild(barInner)
    toast.appendChild(label)
    toast.appendChild(barOuter)
    ensureToastContainer().appendChild(toast)

    let setPct = (done, failed, t) => {
        let n = t || total
        barInner.style.width = `${n ? Math.round(((done + failed) / n) * 100) : 0}%`
    }
    return {
        update: (msg) => {
            setPct(msg.done, msg.failed, msg.total)
            label.textContent = `Downloading… ${msg.done + msg.failed}/${msg.total || total}` + (msg.failed ? ` (errors: ${msg.failed})` : "")
        },
        finish: (res) => {
            setPct(res.done, res.failed, res.total)
            barInner.style.width = "100%"
            if (res.failed) {
                barInner.style.background = "#c74040"
                label.textContent = `⚠ Downloaded ${res.done}/${res.total} (errors: ${res.failed})`
            } else {
                barInner.style.background = "#3fa75a"
                label.textContent = `✓ Downloaded ${res.done}/${res.total}`
            }
            setTimeout(() => {
                toast.style.transition = "opacity 0.4s ease"
                toast.style.opacity = "0"
                setTimeout(() => toast.remove(), 400)
            }, res.failed ? 6000 : 3000)
        }
    }
}

/**
 * Download queue client. Hands a batch of {url, filename} jobs to the service
 * worker, which runs them with bounded concurrency + automatic retries and
 * reports progress / completion back here, shown live in a toast.
 */
let pendingBatches = {}
let downloadBatch = (jobs, onProgress = () => {
}, onDone = () => {
}) => {
    if (!isActive() || !jobs || jobs.length === 0) {
        onDone({total: 0, done: 0, failed: 0, failures: []})
        return
    }
    let batchId = `b${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let toast = createDownloadToast(jobs.length)
    pendingBatches[batchId] = {
        onProgress: (msg) => {
            toast.update(msg)
            onProgress(msg)
        },
        onDone: (msg) => {
            toast.finish(msg)
            onDone(msg)
        }
    }
    chrome.runtime.sendMessage({type: 'TC_DOWNLOAD_BATCH', batchId, jobs})
}
chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.batchId || !pendingBatches[msg.batchId]) return
    if (msg.type === 'TC_DL_PROGRESS') pendingBatches[msg.batchId].onProgress(msg)
    if (msg.type === 'TC_DL_BATCH_DONE') {
        pendingBatches[msg.batchId].onDone(msg)
        delete pendingBatches[msg.batchId]
    }
})
let openTab = (url) => {
    if (isActive()) chrome.runtime.sendMessage({type: 'TC_OPEN_TAB', url, active: false})
}

/**
 * Resolve the download folder + file base for a single design card, using the
 * current classroom/activity in the URL.
 *  - folder:   "{year}W{week} {class name}"   (falls back to "...TinkerCAD")
 *  - fileBase: "{student name} {project name}" (falls back to just project name)
 * Loads class data on demand (cached after first time).
 */
let resolveDownloadTarget = (id, name, onReady) => {
    let activityMatch = /\/classrooms\/(\w+)\/activities\/(\w+)/.exec(window.location.href)
    if (!activityMatch) {
        let classMatch = /\/classrooms\/(\w+)/.exec(window.location.href)
        if (!classMatch) {
            onReady(downloadFolder("TinkerCAD"), sanitizeName(name), null)
            return
        }
        // Class-level designs page (/classrooms/{id}/designs) — no activity in the
        // URL. Load the whole class (students + all activity designs) and find
        // this design by id, reusing the proven proj.name path from the activity
        // page. Fall back to the single-design detail endpoint if it isn't tied
        // to a stored activity (e.g. a teacher template).
        let clazzID = classMatch[1]
        sasAllDataForClass(clazzID, () => {
            get(clazzID, (clazz) => {
                let folder = downloadFolder((clazz && clazz.name) || "TinkerCAD")
                let proj = null
                for (const act of Object.values((clazz && clazz.activities) || {})) {
                    if (act.projects && act.projects[id]) {
                        proj = act.projects[id]
                        break
                    }
                }
                if (proj) {
                    let student = (clazz.students || {})[proj.author]
                    let username = student ? student.name : proj.author
                    onReady(folder, downloadFileBase(username, proj.name), proj)
                    return
                }
                tcApi.design(id).then((d) => {
                    console.log("[tcApi.design] not in stored activities; raw detail:", d)
                    let projectName = (d && (d.description || d.name || d.title ||
                        (d.thing && (d.thing.description || d.thing.name)))) || name
                    onReady(folder, sanitizeName(projectName), {thumb: designThumbUrl(d)})
                }).catch(() => onReady(folder, sanitizeName(name), null))
            })
        }, false)
        return
    }
    let clazzID = activityMatch[1]
    let activityID = activityMatch[2]
    sasAllDataForClassActivity(clazzID, activityID, () => {
        get(clazzID, (clazz) => {
            let folder = downloadFolder((clazz && clazz.name) || "TinkerCAD")
            let projects = clazz && clazz.activities && clazz.activities[activityID] && clazz.activities[activityID].projects
            let proj = projects && projects[id]
            // The card's h3 is the author/student, not the project — prefer the
            // project name stored from the API (design.description).
            let projectName = (proj && proj.name) || name
            let username = null
            if (proj) {
                let student = (clazz.students || {})[proj.author]
                username = student ? student.name : proj.author
            }
            onReady(folder, username ? downloadFileBase(username, projectName) : sanitizeName(projectName), proj || null)
        })
    }, false)
}

/**
 * Retrieves a clazz from storage an item based on id.
 * @param id ID of the item that was stored
 * @param onComplete Action run on completion
 */
let get = (id, onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else {
            store = data.storage
        }
        onComplete(store[id])

    })
}
/**
 * Update class fully before then retrieving it
 * @param id
 * @param onComplete
 */
let sasGet = (id, onComplete) => {
    sasAllDataForClass(id, () => {
        get(id, onComplete)
    }, true)
}
let sasGetForActivity = (clazz, activity, onComplete, force = true) => {
    sasAllDataForClassActivity(clazz, activity, () => {
        get(clazz, onComplete)
    }, force)
}


/**
 * Retrieve all class IDS
 * @param onComplete Callback including all of the keys
 */
let getKeys = (onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else {
            store = data.storage
        }
        onComplete(Object.keys(store))
    })
}

/**
 * USE WITH CAUTION, or better yet use the modify function to safely modify items!
 * Set item inside storage using an Id
 * @param id ID of the item that was stored
 * @param value The value to set it to
 * @param onComplete Action run on completion
 */
let unsafeSet = (id, value, onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else store = data.storage
        {
            store[id] = value
        }

        chrome.storage.local.set({storage: store}, (data) => {
            onComplete()
        })
    })
}
/**
 * USE WITH CAUTION, or better yet use the modify function to safely modify items!
 * Modify an item inside storage using an Id
 * @param id ID of the item that was stored
 * @param map Modification to run on item
 * @param onComplete Action run on completion
 */
let unSafeModify = (id, map, onComplete) => {
    get(id, (data) => {
        let d
        if (!data) {
            d = {}
        } else {
            d = data
        }

        map(d)
        unsafeSet(id, d, onComplete)

    })
}
let queue = []
/**
 * Recursive function used in conjunction with the queue and modify system.
 * Please avoid calling this method unless you are certain you know what you are doing :)
 * @param obj
 */
let recursive = (obj) => {
    unSafeModify(obj.id, obj.map, () => {
        obj.onComplete()
        queue.shift()
        if (queue.length !== 0) recursive(queue[0])
    })
}
/**
 * Modify an item safely that is inside of the database / add it if it does not exist
 * @param id ID of item that should be modified
 * @param map Modification to make on item
 * @param onComplete Run on completion
 */
let modify = (id, map, onComplete = () => {
}) => {
    queue.push({id: id, map: map, onComplete: onComplete})
    if (queue.length === 1) recursive(queue[0])
}


/**
 * Big button used by TinkerCAD
 * @param text Text that should be inside the big button
 * @param onclick Function called on click of the button
 * @returns {HTMLButtonElement} Returns a big button used in TinkerCAD
 */
let bigButton = (text, onclick) => {
    const button = document.createElement("button");
    button.textContent = text
    button.onclick = onclick
    button.classList.add("btn", "activities", "btn-white")
    button.style.height = "40px"
    button.style.overflow = "hidden"
    button.style.textOverflow = "ellipsis"
    button.style.whiteSpace = "nowrap"
    button.style.fontFamily = "Open Sans, Helvetica, Arial, sans-serif"
    button.textContent = text
    button.onclick = onclick
    return button
}
let lazyDownloadAllButton = (format, itemFunction) => {
    return bigButton(`Download ${format}s`, () => {
        itemFunction((directoryName, projects) => {
            let jobs = Object.values(projects).map((project) => ({
                url: designDownloadUrl(project.id, format),
                filename: `${directoryName}/${project.downloadName}.${format}`
            }))
            if (jobs.length === 0) {
                alert("No projects to download")
                return
            }
            downloadBatch(jobs)
        })

    })
}

/** Bulk download of project thumbnails (PNG) for an activity/class. */
let lazyDownloadAllThumbnailsButton = (itemFunction) => {
    return bigButton("Download thumbnails", () => {
        itemFunction((directoryName, projects) => {
            let jobs = Object.values(projects)
                .filter((p) => p.thumb)
                .map((p) => ({
                    url: p.thumb,
                    filename: `${directoryName}/${p.downloadName}.png`
                }))
            if (jobs.length === 0) {
                alert("No thumbnails to download")
                return
            }
            downloadBatch(jobs)
        })
    })
}

// downloadAllButton removed — superseded by lazyDownloadAllButton + the
// service-worker download queue (concurrency + automatic retries).


/**
 * Small button used by TinkerCAD
 * @param text Text that should be inside the big button
 * @param onclick Function called on click of the button
 * @returns {HTMLButtonElement} Returns a big button used in TinkerCAD
 */
let smallButton = (text, onclick) => {
    const button = document.createElement("button");
    button.textContent = text
    button.onclick = onclick
    button.classList.add("btn", "btn-primary", "tinkerButton")
    button.style.padding = "10px"
    button.style.marginTop = "5px"

    button.style.fontFamily = "Open Sans, Helvetica, Arial, sans-serif"
    button.textContent = text
    button.onclick = onclick
    return button
}
let smallButton2 = (text, onclick) => {
    const button = document.createElement("button");
    button.textContent = text
    button.onclick = onclick
    button.classList.add("button-md")
    button.style.background = "#1477d1"

    button.textContent = text
    button.onclick = onclick
    return button
}


let currentPage = Context.GENERAL
/**
 * Await for a condition to occur to then run another function.
 * @param condition A function that will determine if can complete.
 * @param onComplete The function to run once condition is met.
 * @param delay Delay in MS to wait before checking again.
 * */
let awaitResult = (condition, onComplete, delay = 1000, isCancelled = () => false) => {

    setTimeout(() => {
        if (isCancelled()) return
        let state = condition()
        if (!state) {
            return awaitResult(condition, onComplete, delay, isCancelled)
        }

        return onComplete()

    }, delay)
}


let elementListeners = {}

/**
 * Wait for an element to load into the DOM to later be manipulated.
 * @param selector Selector of item to wait for.
 * @param id ID of element that is added
 * @param onComplete Action run on completion.
 * @param delay Delay to wait between checks.
 * @param context Context that we should wait inside for.
 */
let onElementLoad = (selector, id, onComplete, delay = 300, context = Context.GENERAL) => {

    if (!elementListeners[context]) elementListeners[context] = {}
    elementListeners[context][id] = () => {
        awaitResult(() => {


            if (currentPage !== context) return

            return document.querySelector(selector) !== undefined && document.querySelector(selector) !== null
        }, () => {
            onComplete(document.querySelector(selector))
        }, delay)
    }


}

/**
 * Listen when an element in the DOM loads to later manipulate. Listens only in specific specified contexts.
 * @param generalSelector Selector of element to wait for.
 * @param id ID of what is going to be added.
 * @param action Manipulation of what was scraped.
 * @param delay Delay in MS of how long to wait between runs
 * @param context Context to run in, see [Page] for reference.
 */
let onElementsLoad = (generalSelector, id, action, delay = 300, context = Context.GENERAL) => {
    onElementLoad(generalSelector, id, () => {
        for (let item of document.querySelectorAll(generalSelector)) {
            action(item)
        }

    }, delay, context)

}
/**
 * Update which listeners should be running. (THIS DOES NOT DEACTIVATE THEM! however, they automatically shut down if they are loaded in the wrong context :))
 */

let updateActiveListeners = () => {
    console.log(`Moved to context of :${currentPage}, now updating all matching elements!`)
    for (let contextID of Object.keys(elementListeners)) {
        if (currentPage !== contextID) continue

        let context = elementListeners[contextID]

        for (let listener of Object.values(context)) {
            listener()

        }


    }
}
/**
 * Retrieve the current url the page is at
 * @param onComplete Callback called when url is found
 * @param delay Delay to wait between checks
 */
let getCurrentURL = (onComplete) => {
    onComplete(window.location.href)
}
let activityRegex = /^https:\/\/www\.tinkercad\.com\/classrooms\/.+\/activities\/.+$/gm
let tinkerCADURL = /^https:\/\/www\.tinkercad\.com.*$/gm
let classesRegex = /^https:\/\/www\.tinkercad\.com\/dashboard\/classes$/gm
let activitiesRegex = /^https:\/\/www\.tinkercad\.com\/classrooms\/.+\/activities$/gm


/**
 * This is a listener that listens to when the URL is changed!
 * Add actual logic needed here :)
 */
let first = true
let lastURL = null
let onURLChange = () => {
    setTimeout(() => {
        let url = window.location.href
        if ((url !== lastURL) || first) {
            if (url.match(tinkerCADURL)) {
                if (url.match(activityRegex)) {
                    currentPage = Context.ACTIVITY
                } else if (url.match(classesRegex)) {
                    currentPage = Context.CLASSES
                } else if (url.match(activitiesRegex)) {
                    currentPage = Context.ACTIVITIES
                } else {
                    currentPage = Context.GENERAL
                }
                lastURL = url
                updateActiveListeners()
                first = false
            }
        }
        onURLChange()
    }, 1000)
}
onURLChange()


/**
 * Utility to make sure the extension is still not reloaded to prevent the extension once reloaded not throwing exceptions :)
 * @param message Weather a message should be sent when this happens
 * @returns Returns if it is active or not.
 */
let isActive = (message = false) => {
    if (message) console.log("Extension was reloaded, no exception thrown")
    return chrome.runtime?.id

}
/**
 * Download a project
 * @param project Download object, see example objects for example.
 * @param directoryName Name of directory that the items will be downloaded to
 * @param format Format to download the items as (STL SVG etc)
 * @param onComplete Callback run once download complete.
 */
let download = (project, directoryName, format, onComplete = () => {
}) => {
    downloadBatch([{
        url: designDownloadUrl(project.id, format),
        filename: `${directoryName}/${project.downloadName}.${format}`
    }], () => {
    }, () => onComplete())
}


// iframe-based scraping (collect / collectOne / basicCollectOne) removed —
// data now comes from tcApi (REST). The visual gallery/teacher iframes that
// render a design's 3D editor live in their own view code below.


/**
 * UAS Based action that stores the basic list of classes.
 * NOTE: Please use this function before any other UAS operations since this builds the foundation for everything.
 * @param onComplete Run once the data has been collected.
 */
let sasGeneralClasses = (onComplete = () => {
}) => {
    tcApi.classes().then((groups) => {
        if (!groups || groups.length === 0) {
            onComplete()
            return
        }
        let i = 0
        for (let group of groups) {
            modify(group.id, (data) => {
                data.id = group.id
                data.name = group.name
                data.code = group.code
                data.coteacherCode = group.coteacher_code
                data.memberCount = group.number_members
            }, () => {
                if (++i >= groups.length) onComplete()
            })
        }
    }).catch((e) => {
        console.warn("[tcApi] Failed to fetch classes:", e.message)
        onComplete()
    })
}


/**
 * UAS Based action to store the activities of a class
 * @param clazzID ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasClassActivitiesOf = (clazzID, onComplete = () => {
}, force = false) => {
    get(clazzID, (data) => {

        if (data && data.activities && !force) {
            onComplete()
            console.log("All activities are up to date!")
            return
        }

        tcApi.activities(clazzID).then((results) => {
            modify(clazzID, (clazz) => {
                if (!clazz.activities) clazz.activities = {}
                for (let result of results) {
                    if (!clazz.activities[result.id]) {
                        clazz.activities[result.id] = {id: result.id, name: result.name}
                    } else {
                        clazz.activities[result.id].name = result.name
                    }
                }
            }, onComplete)
            console.log(`Filling in activities for class of ${clazzID}`)
        }).catch((e) => {
            console.warn("[tcApi] Failed to fetch activities:", e.message)
            onComplete()
        })

    })


}
document.addEventListener('keydown', (event) => {
    if (event.shiftKey) {
        for (const elem of document.querySelectorAll('.actions')) {
            elem.style.display = "initial"
        }
    }
})
document.addEventListener('keyup', (event) => {
    if (!event.shiftKey) {
        for (const elem of document.querySelectorAll('.actions')) {
            elem.style.display = "none"
        }
    }
})
// let sasGetPrinterInformation = (projectID) => {
//
//     let f = document.createElement('iframe')
//     f.src = "https://api-reader.tinkercad.com/designs/detail/cLe5l6nECEG"
//     f.id = "finder"
//     document.querySelector("body").appendChild(f)
//     console.log(f.contentWindow)
//
// }
// sasGetPrinterInformation("cLe5l6nECEG")

let projectIDRegex = /\/things\/(.{11})/gm
/**
 * UAS Based action to store the projects of an activity
 * @param clazz ID of class
 * @param activity ID of activity
 * @param onComplete Run once complete.
 * @param force Weather this action should be run overriding old data
 */
let sasGetProjectsOfActivity = (clazz, activity, onComplete = () => {
}, force = false) => {
    get(clazz, (data) => {
        if (data && data.activities && data.activities[activity] && data.activities[activity].projects && !force) {
            onComplete()
            console.log("All activities are up to date!")
            return
        }

        tcApi.designs(clazz, activity).then((designs) => {
            modify(clazz, (data) => {
                if (!data.activities) data.activities = {}
                if (!data.activities[activity]) data.activities[activity] = {id: activity}
                data.activities[activity].projects = {}
                if (!data.activities[activity].ogFiles) data.activities[activity].ogFiles = {}
                for (let design of designs) {
                    let id = design.id || design.thingId
                    if (!id) continue
                    data.activities[activity].projects[id] = {
                        id: id,
                        name: design.description || design.name || design.title || `Projekt ${id}`,
                        author: String(design.user_id || design.userId || ""),
                        tags: design.asm_tags || null,
                        printDescription: design.asm_description || null,
                        thumb: (design.thumbnail_json && (
                            (design.thumbnail_json.detailThumb && design.thumbnail_json.detailThumb.url) ||
                            (design.thumbnail_json.filmstrip && design.thumbnail_json.filmstrip.url))) || null,
                        mtime: design.mtime || null
                    }
                }
            }, onComplete)
            console.log(`Filling in all of the projects of the activity of ${activity}`)
        }).catch((e) => {
            console.warn("[tcApi] Failed to fetch activity designs:", e.message)
            onComplete()
        })

    })


}

/**
 * UAS Based action to store the projects of all the activities of a class
 * @param clazz ID of class
 * @param onComplete Run once complete.
 * @param force Weather this action should be run overriding old data
 */
let sasGetAllProjectsOfActivitiesOfClazz = (clazz, onComplete = () => {
}, force = false) => {
    get(clazz, (data) => {
        if (data.projects && !force) {
            onComplete()
            console.log("All students are up to date!")
            return
        }
        let i = 0
        let items = Object.values(data.activities)
        for (let activity of items) {

            sasGetProjectsOfActivity(clazz, activity.id, () => {
                if (++i >= items.length) onComplete()
            }, force)
        }
    })
}


/**
 * UAS Based action to store the students of a class
 * @param id ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasStudentsAndClassCodeOf = (id, onComplete = () => {
}, force = false) => {
    get(id, (data) => {
        if (data && data.students && !force) {
            onComplete()
            console.log("All students are up to date!")
            return
        }
        tcApi.members(id).then((members) => {
            modify(id, (data) => {
                if (!data.students) data.students = {}
                for (let m of members) {
                    let sid = String(m.user_id || m.userId || m.member_id || m.id || "")
                    if (!sid) continue
                    data.students[sid] = {
                        id: sid,
                        name: m.name || m.screen_name || m.identifier || "not-found",
                        username: m.screen_name || m.name || "not-found",
                        badgeCount: String((m.badges != null ? m.badges : (m.badge_count != null ? m.badge_count : (m.numberBadges != null ? m.numberBadges : 0))))
                    }
                }
            }, () => {
                // Join code lives on the group object, not the roster — backfill if missing.
                get(id, (cur) => {
                    if (cur && cur.code) {
                        onComplete()
                        return
                    }
                    tcApi.classById(id).then((group) => {
                        if (!group) {
                            onComplete()
                            return
                        }
                        modify(id, (d) => {
                            d.code = group.code
                            d.name = d.name || group.name
                            d.coteacherCode = group.coteacher_code
                        }, onComplete)
                    }).catch(() => onComplete())
                })
            })
        }).catch((e) => {
            console.warn("[tcApi] Failed to fetch students:", e.message)
            onComplete()
        })
    })

}
let sasPrintListForProjects = (ids) => {
    // Print metadata (asm_tags / asm_description) now arrives inline with each
    // design via tcApi.designs(); the old api/api2 iframe round-trip was removed.
    console.log("[print] inline tags via tcApi.designs — legacy api/api2 path removed", ids)
}


const UpdateItems = Object.freeze({
    STUDENTS: "students",

})


/**
 * UASR Based action to store all of a classroom's data.
 * @param id ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasAllDataForClass = (id, onComplete = () => {
}, force = false) => {
    sasStudentsAndClassCodeOf(id, () => {
        sasClassActivitiesOf(id, () => {
            sasGetAllProjectsOfActivitiesOfClazz(id, onComplete, force)
        }, force)
    }, force)
}
/**
 * UASR Based action to store all of data needed by an activity.
 * @param id ID of class
 * @param activity
 * @param onComplete Run once complete.
 * @param force
 */
let sasAllDataForClassActivity = (id, activity, onComplete = () => {
}, force = false) => {
    sasStudentsAndClassCodeOf(id, () => {
        sasClassActivitiesOf(id, () => {
            sasGetProjectsOfActivity(id, activity, onComplete, force)
        }, force)
    }, force)
}


/**
 * Returns the current user that is logged in.
 * @returns {string}
 */
let getCurrentUser = (onRetrieve) => {
    tcApi.myUserId().then((uid) => onRetrieve(uid)).catch((e) => {
        console.warn("[tcApi] Failed to fetch user:", e.message)
    })
}

/**
 * UASR Based action to store all data of all classrooms (Good for initial setup :))
 */
let usasAllData = (onComplete = () => {
}) => {
    sasGeneralClasses(() => {

        getKeys((clazzIds) => {
            let i = 0
            for (let key of clazzIds) {
                sasAllDataForClass(key, () => {
                    if (++i >= clazzIds.length) onComplete()
                })
            }
        })
    })

}
/**
 * Run general update sequence on storage.
 * Checking in general items that have never been adding them adding them.
 * This does not completely rebuild the storage.
 */
let updateStorage = () => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get("user", (user) => {
        getCurrentUser((username) => {
            if (user.user !== username) {
                console.log("Attempting to rebuild storage cache!")
                chrome.storage.local.clear(() => {
                    chrome.storage.local.set({user: username}, () => {
                        console.log(`Signed-In User changed! Rebuilding Cache`)
                        updateStorage()
                    })
                })
                return
            }
            usasAllData()


        })

    })


}
let views = {}

let enableView = (id, enable, disable) => {
    let og = document.querySelector("#main")
    og.style.display = "none"
    views[id] = {id: id, enable: enable, disable: disable}
    let container = document.createElement("div")
    container.classList.add("view")
    document.body.appendChild(container)
    enable(container)

}

let disableView = (id) => {
    let og = document.querySelector("#main")
    og.style.display = "block"

    for (let item of document.querySelectorAll(".view")) {
        console.log(`Disabled view: ${id}`)
        item.remove()
    }
    views[id].disable()
}

function contains_heb(str) {
    return (/[\u0590-\u05FF]/).test(str);
}

let printerViewEnable = () => enableView("printer", (container) => {
    currentPage = Context.PRINTER
    const printItem = () => {
        const item = document.createElement("button")
        item.textContent = "test"
        item.classList.add("testing")
        container.appendChild(item)
    }
    printItem()

}, () => {


})
let galleryViewEnable = (projects = null) => {
    let prevPage = currentPage
    return enableView("gallery", (container) => {
        currentPage = Context.GALLERY
        let active = true
        if (!projects)
            updateStorage()

        let frame = document.createElement("iframe")
        let h1 = document.createElement("h2")
        h1.style.height = "5vh"
        h1.style.width = "100vw"
        h1.style.dir = "auto"

        container.appendChild(h1)
        container.appendChild(frame)

        let setFrame = (id, name) => {
            frame.src = `https://www.tinkercad.com/things/${id}/edit`
            if (contains_heb(name)) {
                h1.style.textAlign = "right"
            } else h1.style.textAlign = "left"
            h1.innerText = name
            awaitResult(() => {
                let doc = frame.contentDocument
                if (active && currentPage === Context.GALLERY && doc) {
                    return doc.querySelector("#viewcube-home-button")
                }
                return false
            }, () => {
                let doc = frame.contentDocument
                doc.querySelector("#sidebarContainer")?.remove()
                doc.querySelector(".editor__tab__subnav")?.remove()
                doc.querySelector(".editor__topnav")?.remove()
                doc.querySelector(".hud")?.remove()
                let canvas = doc.querySelector("canvas")
                if (canvas) canvas.style.width = "100vw"
                frame.style.height = "95vh"
            }, 300, () => !active)
        }
        frame.style.width = "100vw"
        frame.style.height = "95vh"
        let i = 1

        let loop = (list) => {
            chrome.storage.local.get(["speed"], (data) => {
                let speed = (data && data.speed != null) ? 6 - Number(data.speed) : 3
                setTimeout(() => {
                    if (!active || currentPage !== Context.GALLERY) return
                    if (list.length <= i) i = 0
                    setFrame(list[i].id, list[i].name)
                    i++
                    loop(list)
                }, speed * 10000)
            })
        }

        let start = (list) => {
            if (!list || list.length === 0) {
                h1.innerText = "No projects to show"
                return
            }
            setFrame(list[0].id, list[0].name)
            loop(list)
        }

        if (projects) {
            start(projects)
        } else {
            getGalleryProjects((list) => start(list))
        }

        container.appendChild(bigButton("Back", () => {
            active = false
            currentPage = prevPage
            disableView("gallery")
        }))
    }, () => {
    })
}
let getGalleryProjects = (onComplete) => {
    let projects = []
    let i = 0
    getKeys((keys => {
        for (const clazzID of keys) {
            get(clazzID, (clazz) => {

                let students = []
                for (const student of Object.values(clazz.students || {})) {
                    if (student.badgeCount !== "0" && student.badgeCount !== null && student.badgeCount !== undefined) {
                        students.push(student.id)
                    }
                }
                for (const activity of Object.values(clazz.activities || {})) {
                    for (const project of Object.values(activity.projects || {})) {
                        if (students.includes(project.author)) {
                            projects.push(project)

                        }

                    }
                }
                //Hey there, since this whole thing is async, this needs to be done here :) Not outsideo f hte get(method) since this just has a callback and the rest continues onward :)
                if (++i >= keys.length) {
                    onComplete(projects)
                }
            })

        }

    }))

}


let teacherViewEnable = () => enableView("teacher", (container) => {
    currentPage = Context.TEACHER

    let header = document.createElement("div")
    let row = document.createElement("div")
    let firstView = true


    let frame = document.createElement("iframe")
    let studentList = document.createElement("ul")


    let previous
    let setFrame = (id, elem) => {
        frame.src = `https://www.tinkercad.com/things/${id}/edit`
        if (previous) {
            previous.style.border = "none"
        }
        elem.style.border = "2px solid #FFD700"
        previous = elem

    }

    frame.style.border = "none"
    frame.style.width = "87vw"
    frame.style.height = "92vh"
    header.style.height = "8vh"
    header.style.display = "flex"
    header.style.alignItems = "center"
    header.style.justifyContent = "center"

    // studentList.style.alignItems = "center"
    studentList.style.width = "13vw"
    studentList.style.listStyleType = "none"
    studentList.style.padding = "0"
    studentList.style.display = "inline"
    studentList.style.overflow = "hidden"
    studentList.style.overflowY = "scroll"
    studentList.style.height = "90vh"
    row.style.display = "flex"

    container.appendChild(header)
    row.appendChild(frame)
    row.appendChild(studentList)
    container.appendChild(row)


    getCurrentActivityAndClassID((clazzID, activityID) => {
        get(clazzID, (clazz) => {
            clazz = clazz || {}

            let first = true
            if (clazz.activities)
                if (clazz.activities[activityID])
                    for (let project of Object.values(clazz.activities[activityID].projects || {})) {

                        let b = smallButton(((clazz.students || {})[project.author] || {}).name || project.author, () => {
                            setFrame(project.id, b)
                        })
                        if (first) {
                            setFrame(project.id, b)
                            first = false
                        }
                        b.id = project.id
                        b.classList.add("selection")
                        b.style.width = "13vw"

                        studentList.appendChild(b)

                    }
            let updateSelection = (onComplete) => {
                get(clazzID, (clazz) => {


                    let getProjects = () => {
                        if (!clazz.activities || !clazz.activities[activityID]) return {}
                        return clazz.activities[activityID].projects || {}
                    }
                    let projectIDS = () => {
                        let ids = []
                        for (const project of Object.values(getProjects())) {
                            ids.push(project.id)
                        }
                        return ids
                    }


                    let alreadyActive = []
                    let ids = projectIDS()
                    for (const elem of document.querySelectorAll(".selection")) {
                        if (!ids.includes(elem.id)) {
                            elem.remove()
                        } else {
                            alreadyActive.push(elem.id)
                        }
                    }

                    for (const project of Object.values(getProjects())) {

                        if (alreadyActive.includes(project.id)) {
                            continue
                        }
                        let b = smallButton(((clazz.students || {})[project.author] || {}).name || project.author, () => {
                            setFrame(project.id, b)
                        })
                        b.id = project.id
                        b.classList.add("selection")
                        b.style.width = "13vw"
                        studentList.appendChild(b)

                    }
                    onComplete()
                })
            }

            let update = (onComplete) => {
                if (firstView) {
                    fullReload(onComplete)
                    firstView = false
                } else {
                    sasGetProjectsOfActivity(clazzID, activityID, () => {
                        updateSelection(onComplete)
                    }, true)
                }


            }
            let fullReload = (onComplete = () => {
            }) => {
                sasGetForActivity(clazzID, activityID, () => {
                    updateSelection(() => {
                        console.log("Full reload done!")
                        onComplete()
                    })
                })
            }
            //ID Used in case a user clicks multiple times on the auto button :)
            let autoPlayID = 0

            let autPlayLoop = (id) => {
                chrome.storage.local.get(["speed"], (data) => {
                    let speed = 3
                    if (data && data.speed != null)
                        speed = 6 - Number(data.speed)


                    setTimeout(() => {
                        if (autoPlayID === id && currentPage === Context.TEACHER) {
                            let items = document.querySelectorAll(".selection")
                            let next = false
                            let i = 0
                            for (const item of items) {
                                if (++i >= items.length) {
                                    setFrame(items[0].id, items[0])
                                }
                                if (next) {
                                    setFrame(item.id, item)
                                    break
                                }
                                if (item === previous) {
                                    next = true
                                }
                            }
                            autPlayLoop(id)
                        }
                    }, speed * 10000)
                })
            }

            function isOdd(num) {
                return num % 2;
            }

            let autoButton = bigButton("Auto", () => {

                if (isOdd(++autoPlayID)) {
                    autoButton.style.backgroundColor = "#4076c7"
                    autoButton.style.color = "#fff"
                    autPlayLoop(autoPlayID)
                } else {
                    autoButton.style.backgroundColor = "#fff"
                    autoButton.style.color = "#4076c7"
                }


            })


            let loop = () => {

                setTimeout(() => {
                    update(() => {
                        if (currentPage === Context.TEACHER) {
                            console.log("Little update run!")
                            loop()
                        } else {
                            console.log("Update loop stopped!")
                        }
                    })

                }, 5000)
            }
            loop()


            /**
             * Visual placement of items.
             */
            header.classList.add("btn-group")
            header.style.display = "flex"
            header.style.padding = "1%"
            header.appendChild(bigButton("Back", () => {
                disableView("teacher")
                currentPage = Context.ACTIVITY
            }))

            let applyHeader = (newClazz) => {
                header.appendChild(bigButton(newClazz.code, () => copyTextToClipboard(newClazz.code.replaceAll("-", ""))))
                header.appendChild(autoButton)

                header.appendChild(bigButton("Reload", () => {
                    fullReload()
                }))
            }
            if (!clazz.code) {
                sasStudentsAndClassCodeOf(clazzID, () => {
                    get(clazzID, (newClazz) => {
                        applyHeader(newClazz)
                    })
                })
            } else {
                applyHeader(clazz)
            }


        })
    })


}, () => {
})


/**
 * finds the id of the class that is currently on screen in
 * @param onFound Callback called in including id of the class
 */
let getCurrentClazzID = (onFound) => {
    getCurrentURL((data) => {
        let clazzRegex = /(https:\/\/www\.tinkercad\.com\/classrooms\/)(\w+)\/?(.+)*\/(\w+)/gm
        let v = clazzRegex.exec(data)
        onFound(v[2])

    }, 100)
}

/**
 * finds the id of the activity that is currently on screen in
 * @param onFound
 */
let getCurrentActivityAndClassID = (onFound) => {
    let clazzRegex = /(https:\/\/www\.tinkercad\.com\/classrooms\/)(\w+)\/?(.+)*\/(\w+)/gm

    getCurrentURL((data) => {
        let d = clazzRegex.exec(data)
        onFound(d[2], d[4])
    }, 100)
}
let getCurrentClazz = (onFound) => {
    getCurrentClazzID((clazzId) => {
        get(clazzId, (clazz) => {
            onFound(clazz)
        })
    })
}
let getCurrentActivity = (onFound) => {
    getCurrentActivityAndClassID((clazzID, activityID) => {
        get(clazzID, (clazz) => {
            onFound(clazz.activities[activityID])
        })
    })
}


let main = () => {

    /**
     * Implementation of TinkerCAD assistant actual look and feel from here on :)
     */
    onElementLoad(".left-actions", "gallery", (container) => {
        let elem = smallButton2("Gallery", () => {
            galleryViewEnable()
        })
        container.querySelector("#newClassButton").insertAdjacentElement('afterend', elem)

    }, 500, Context.CLASSES)

    onElementLoad(".left-actions", "prints", (container) => {
        let elem = smallButton2("Print Manager", () => {
            printerViewEnable()
            sasPrintListForProjects(["1", "ac"])
        })
        container.querySelector("#newClassButton").insertAdjacentElement('afterend', elem)

    }, 500, Context.CLASSES)

    let easyTools = (context) => {
        onElementsLoad(".thing-box", "border", (item) => {
            if (item.dataset.tcaButtons === "1") return
            let container = document.createElement("div")
            container.style.padding = "3px"
            container.style.display = "flex"
            container.style.alignItems = "center"
            container.style.justifyContent = "center"
            let id = item.querySelector("a").href?.match(projectIDRegex)?.[0]?.replace("/things/", "")
            if (!id) return
            item.dataset.tcaButtons = "1"
            let name = item.querySelector("h3").textContent

            let button = (text, onClick) => {
                let b = smallButton(text, onClick)
                b.style.padding = "4px"
                b.style.margin = "3px"
                b.style.fontSize = "14px"
                b.classList.add("actions")
                b.style.display = "none"
                container.appendChild(b)
            }

            button("Tinker this", () => {
                openTab(`https://www.tinkercad.com/things/${id}/edit`)
            })
            button("STL", () => {
                resolveDownloadTarget(id, name, (folder, fileBase) => {
                    download({id: id, downloadName: fileBase}, folder, "stl", () => {
                    })
                })
            })
            button("SVG", () => {
                resolveDownloadTarget(id, name, (folder, fileBase) => {
                    download({id: id, downloadName: fileBase}, folder, "svg", () => {
                    })
                })
            })
            button("PNG", () => {
                resolveDownloadTarget(id, name, (folder, fileBase, proj) => {
                    let url = (proj && proj.thumb) || item.querySelector(".thumbnail img")?.src
                    if (!url) {
                        alert("No thumbnail for this project")
                        return
                    }
                    downloadBatch([{url: url, filename: `${folder}/${fileBase}.png`}])
                })
            })
            // container.style.border = "2px solid #FFD700"

            item.querySelector(".thumbnail").insertAdjacentElement("beforebegin", container)

        }, 3000, context)

    }
    easyTools(Context.GENERAL)
    easyTools(Context.ACTIVITY)

    onElementLoad(".class-projects-list-toolbar", "gallery", (container) => {
        let elem = bigButton("Gallery", () => {
            getCurrentClazz((clazz) => {
                let projects = []
                for (const activities of Object.values(clazz.activities)) {
                    for (const project of Object.values(activities.projects)) {
                        projects.push(project)
                    }
                }
                galleryViewEnable(projects)
            })


        })
        let header = document.querySelector(".class-projects-list-toolbar")
        header.style.display = "flex"
        elem.style.marginLeft = "5px"
        header.appendChild(elem)


    }, 500, Context.ACTIVITIES)

    onElementsLoad(".project-toolbar-top", "downloadButtons", (item) => {
        let elem = item.querySelector(".btn-group")
        elem.appendChild(bigButton("Teacher view", () => {
            teacherViewEnable()
        }))

        elem.appendChild(bigButton("Gallery", () => {
            getCurrentActivity((activity) => {
                galleryViewEnable(Object.values(activity.projects))
            })
        }))

        getCurrentActivityAndClassID((clazzID, activityID) => {
            get(clazzID, (clazz) => {
                let lazyAction = (onComplete) => {
                    sasAllDataForClassActivity(clazzID, activityID, () => {
                        // Re-read fresh data — `clazz` captured above is a stale
                        // snapshot that predates the activity/project load.
                        get(clazzID, (fresh) => {
                            let activity = fresh && fresh.activities && fresh.activities[activityID]
                            let projects = (activity && activity.projects) || {}
                            let downloadItems = {}

                            let directoryName = downloadFolder((fresh && fresh.name) || "TinkerCAD")
                            for (let project of Object.values(projects)) {
                                let student = fresh.students ? fresh.students[project.author] : null
                                let username = student ? student.name : project.author
                                downloadItems[project.id] = {
                                    id: project.id,
                                    downloadName: downloadFileBase(username, project.name),
                                    thumb: project.thumb || null
                                }
                            }
                            onComplete(directoryName, downloadItems)
                        })
                    }, true)
                }

                elem.appendChild(lazyDownloadAllButton("stl", lazyAction))
                elem.appendChild(lazyDownloadAllButton("svg", lazyAction))
                elem.appendChild(lazyDownloadAllThumbnailsButton(lazyAction))
            })


        })


    }, 300, Context.ACTIVITY)
    sasGeneralClasses(() => {

        console.log("Collected standard basic student data")
    })
}
main()

