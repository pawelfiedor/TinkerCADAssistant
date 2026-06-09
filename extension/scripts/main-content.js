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

/** CSG STL/OBJ download URL for a design. */
let designDownloadUrl = (designId, format) => `https://csg-prd.tinkercad.com/things/${designId}/polysoup.${format}?rev=-1`

/** File extension for a download format. OBJ is served as a .zip (obj + mtl). */
let downloadExt = (format) => format === "obj" ? "zip" : format

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

/** Small transient toast for status / error messages (reuses the toast stack). */
let showNotice = (text, kind = "info") => {
    let colors = {info: "#2c2c2c", error: "#c74040", ok: "#3fa75a"}
    let n = document.createElement("div")
    Object.assign(n.style, {
        background: colors[kind] || colors.info, color: "#fff", padding: "12px 14px",
        borderRadius: "10px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: "320px",
        fontSize: "13px", fontFamily: "Open Sans, Helvetica, Arial, sans-serif", pointerEvents: "none"
    })
    n.textContent = text
    ensureToastContainer().appendChild(n)
    setTimeout(() => {
        n.style.transition = "opacity 0.4s ease"
        n.style.opacity = "0"
        setTimeout(() => n.remove(), 400)
    }, 6000)
}

/** Centralised API-error handler: logs, and shows a one-off notice on expired session. */
let sessionNoticeShown = false
let tcApiError = (e, what) => {
    console.warn(`[tcApi] Failed to fetch ${what}:`, e && e.message)
    if (e && (e.status === 401 || e.status === 403) && !sessionNoticeShown) {
        sessionNoticeShown = true
        showNotice("TinkerCAD session expired — reload the page and sign in again.", "error")
        setTimeout(() => {
            sessionNoticeShown = false
        }, 30000)
    }
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
                filename: `${directoryName}/${project.downloadName}.${downloadExt(format)}`
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
 * @param format Format to download the items as (STL OBJ etc)
 * @param onComplete Callback run once download complete.
 */
let download = (project, directoryName, format, onComplete = () => {
}) => {
    downloadBatch([{
        url: designDownloadUrl(project.id, format),
        filename: `${directoryName}/${project.downloadName}.${downloadExt(format)}`
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
        tcApiError(e, "classes")
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
            tcApiError(e, "activities")
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
            tcApiError(e, "activity designs")
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
            tcApiError(e, "students")
            onComplete()
        })
    })

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
        tcApiError(e, "user")
    })
}

/**
 * UASR Based action to store all data of all classrooms (Good for initial setup :))
 */
let usasAllData = (onComplete = () => {
}) => {
    sasGeneralClasses(() => {

        getKeys((clazzIds) => {
            if (!clazzIds.length) {
                onComplete()
                return
            }
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
let updateStorage = (onComplete = () => {
}) => {
    if (!isActive()) {
        onComplete()
        return
    }
    chrome.storage.local.get("user", (user) => {
        getCurrentUser((username) => {
            if (user.user !== username) {
                console.log("Attempting to rebuild storage cache!")
                chrome.storage.local.clear(() => {
                    chrome.storage.local.set({user: username}, () => {
                        console.log(`Signed-In User changed! Rebuilding Cache`)
                        updateStorage(onComplete)
                    })
                })
                return
            }
            usasAllData(onComplete)


        })

    })


}
let views = {}

let enableView = (id, enable, disable) => {
    // The view is a fixed full-screen overlay, so hiding #main is optional;
    // guard it because some pages (e.g. /dashboard/classes) have no #main.
    let og = document.querySelector("#main")
    if (og) og.style.display = "none"
    views[id] = {id: id, enable: enable, disable: disable}
    let container = document.createElement("div")
    container.classList.add("view")
    Object.assign(container.style, {
        position: "fixed", inset: "0", zIndex: "2147483640",
        display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff"
    })
    document.body.appendChild(container)
    enable(container)

}

let disableView = (id) => {
    let og = document.querySelector("#main")
    if (og) og.style.display = "block"

    for (let item of document.querySelectorAll(".view")) {
        console.log(`Disabled view: ${id}`)
        item.remove()
    }
    views[id].disable()
}

function contains_heb(str) {
    return (/[\u0590-\u05FF]/).test(str);
}

let printerViewEnable = () => {
    let prevPage = currentPage
    return enableView("printer", (container) => {
        currentPage = Context.PRINTER
        let allItems = []          // {id, name, student, className, thumb}
        let selected = new Set()   // selected design ids
        let cardById = new Map()   // id -> card element
        let SIZES = [180, 260, 360]
        let sizeIdx = 0

        // ── Header ──────────────────────────────────────────────────
        let header = document.createElement("div")
        Object.assign(header.style, {
            display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto",
            padding: "8px 12px", boxSizing: "border-box", flexWrap: "wrap",
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let titleEl = document.createElement("strong")
        titleEl.textContent = "Print Manager"
        titleEl.style.fontSize = "16px"
        let filterInput = document.createElement("input")
        filterInput.type = "search"
        filterInput.placeholder = "Filter by student / class / project…"
        Object.assign(filterInput.style, {padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", minWidth: "220px"})
        let selCount = document.createElement("span")
        Object.assign(selCount.style, {fontSize: "13px", color: "#666", marginLeft: "auto"})

        // ── Status line + grid ──────────────────────────────────────
        let status = document.createElement("div")
        Object.assign(status.style, {padding: "8px 12px", color: "#666", fontSize: "13px", flex: "0 0 auto"})
        let grid = document.createElement("div")
        Object.assign(grid.style, {
            display: "flex", flexWrap: "wrap", gap: "12px", padding: "12px",
            flex: "1", minHeight: "0", overflowY: "auto", alignContent: "flex-start", boxSizing: "border-box"
        })
        container.appendChild(header)
        container.appendChild(status)
        container.appendChild(grid)

        let updateSelCount = () => {
            selCount.textContent = `${selected.size} selected`
        }
        let filteredItems = () => {
            let ft = filterInput.value.trim().toLowerCase()
            if (!ft) return allItems
            return allItems.filter((it) => `${it.student} ${it.className} ${it.name}`.toLowerCase().includes(ft))
        }
        let applySelStyle = (card, isSel) => {
            card.style.border = isSel ? "3px solid #16a34a" : "2px solid transparent"
        }
        let toggle = (id, card) => {
            if (selected.has(id)) selected.delete(id)
            else selected.add(id)
            applySelStyle(card, selected.has(id))
            updateSelCount()
        }
        let makeCard = (it) => {
            let cardW = SIZES[sizeIdx]
            let card = document.createElement("div")
            Object.assign(card.style, {
                width: `${cardW}px`, cursor: "pointer", borderRadius: "8px",
                overflow: "hidden", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
            })
            applySelStyle(card, selected.has(it.id))
            let thumbWrap = document.createElement("div")
            Object.assign(thumbWrap.style, {
                width: "100%", height: `${Math.round(cardW * 0.75)}px`, background: "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: "32px"
            })
            if (it.thumb) {
                let im = document.createElement("img")
                Object.assign(im.style, {width: "100%", height: "100%", objectFit: "cover"})
                im.src = it.thumb
                im.alt = it.name || ""
                thumbWrap.appendChild(im)
            } else {
                thumbWrap.textContent = "🧊"
            }
            let lbl = document.createElement("div")
            Object.assign(lbl.style, {padding: "6px 8px 0", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
            lbl.textContent = it.student
            let sub = document.createElement("div")
            Object.assign(sub.style, {padding: "0 8px 6px", fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
            sub.textContent = [it.className, it.name].filter(Boolean).join(" · ")
            lbl.title = `${it.student} — ${it.name || ""}`
            card.appendChild(thumbWrap)
            card.appendChild(lbl)
            card.appendChild(sub)
            card.onclick = () => toggle(it.id, card)
            return card
        }
        let renderGrid = () => {
            grid.innerHTML = ""
            cardById.clear()
            if (!allItems.length) {
                status.textContent = "No projects found."
                return
            }
            let items = filteredItems()
            status.textContent = `${allItems.length} project${allItems.length === 1 ? "" : "s"}` +
                (items.length !== allItems.length ? ` · ${items.length} shown` : "")
            items.forEach((it) => {
                let c = makeCard(it)
                grid.appendChild(c)
                cardById.set(it.id, c)
            })
        }
        let selectAllShown = (on) => {
            filteredItems().forEach((it) => {
                if (on) selected.add(it.id)
                else selected.delete(it.id)
                let c = cardById.get(it.id)
                if (c) applySelStyle(c, on)
            })
            updateSelCount()
        }
        let bulk = (format) => {
            let chosen = allItems.filter((it) => selected.has(it.id))
            if (!chosen.length) {
                alert("No projects selected")
                return
            }
            let jobs = chosen.map((it) => ({
                url: designDownloadUrl(it.id, format),
                filename: `${downloadFolder(it.className || "TinkerCAD")}/${downloadFileBase(it.student, it.name)}.${downloadExt(format)}`
            }))
            downloadBatch(jobs)
        }

        // ── Header controls ─────────────────────────────────────────
        header.appendChild(bigButton("Back", () => {
            currentPage = prevPage
            disableView("printer")
        }))
        header.appendChild(titleEl)
        header.appendChild(filterInput)
        header.appendChild(bigButton("Select all", () => selectAllShown(true)))
        header.appendChild(bigButton("Clear", () => selectAllShown(false)))
        header.appendChild(bigButton("Download STL", () => bulk("stl")))
        header.appendChild(bigButton("Download OBJ", () => bulk("obj")))
        let sizeBtns = []
        let setSize = (idx) => {
            sizeIdx = idx
            sizeBtns.forEach((b, k) => {
                b.style.backgroundColor = k === idx ? "#4076c7" : "#fff"
                b.style.color = k === idx ? "#fff" : "#4076c7"
            })
            renderGrid()
        }
        ;["S", "M", "L"].forEach((t, idx) => {
            let b = bigButton(t, () => setSize(idx))
            sizeBtns.push(b)
            header.appendChild(b)
        })
        sizeBtns[0].style.backgroundColor = "#4076c7"
        sizeBtns[0].style.color = "#fff"
        header.appendChild(selCount)
        filterInput.addEventListener("input", () => renderGrid())
        updateSelCount()

        // ── Load all classes, then render ───────────────────────────
        status.textContent = "Loading projects…"
        updateStorage(() => getGalleryProjects((items) => {
            allItems = items || []
            renderGrid()
        }))
    }, () => {
    })
}
let galleryViewEnable = (projects = null) => {
    let prevPage = currentPage
    return enableView("gallery", (container) => {
        currentPage = Context.GALLERY
        let active = true
        let paused = false
        let mode = "image" // "image" | "3d"
        let list = []
        let i = 0

        // ── Top progress bar (counts down to the next slide) ────────
        let progress = document.createElement("div")
        Object.assign(progress.style, {height: "3px", width: "100%", background: "#e2e8f0", flex: "0 0 auto"})
        let progressFill = document.createElement("div")
        Object.assign(progressFill.style, {height: "100%", width: "0%", background: "#4076c7"})
        progress.appendChild(progressFill)

        // ── Control bar ─────────────────────────────────────────────
        let bar = document.createElement("div")
        Object.assign(bar.style, {
            display: "flex", alignItems: "center", gap: "10px",
            flex: "0 0 auto", padding: "8px 12px", boxSizing: "border-box",
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let labels = document.createElement("div")
        Object.assign(labels.style, {flex: "1", minWidth: "0", overflow: "hidden"})
        let title = document.createElement("div")
        Object.assign(title.style, {fontSize: "20px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
        let subtitle = document.createElement("div")
        Object.assign(subtitle.style, {fontSize: "13px", color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
        labels.appendChild(title)
        labels.appendChild(subtitle)
        let counter = document.createElement("span")
        Object.assign(counter.style, {fontSize: "13px", color: "#666", minWidth: "60px", textAlign: "center"})

        // ── Display stage (flex:1 — no page scrollbars) ─────────────
        let stage = document.createElement("div")
        Object.assign(stage.style, {
            flex: "1", minHeight: "0", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#f4f4f4", overflow: "hidden"
        })
        let img = document.createElement("img")
        Object.assign(img.style, {maxWidth: "100%", maxHeight: "100%", objectFit: "contain"})
        let frame = document.createElement("iframe")
        Object.assign(frame.style, {width: "100%", height: "100%", border: "none", display: "none"})
        let empty = document.createElement("div")
        Object.assign(empty.style, {color: "#999", fontSize: "16px", display: "none"})
        stage.appendChild(img)
        stage.appendChild(frame)
        stage.appendChild(empty)

        container.appendChild(progress)
        container.appendChild(bar)
        container.appendChild(stage)

        let set3dFrame = (p) => {
            frame.src = `https://www.tinkercad.com/things/${p.id}/edit`
            awaitResult(() => {
                let doc = frame.contentDocument
                if (active && mode === "3d" && currentPage === Context.GALLERY && doc) {
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
                if (canvas) canvas.style.width = "100%"
            }, 300, () => !active || mode !== "3d")
        }

        let render = () => {
            if (!list.length) {
                img.style.display = "none"
                frame.style.display = "none"
                empty.style.display = "block"
                empty.innerText = "No projects to show"
                counter.innerText = ""
                title.innerText = ""
                subtitle.innerText = ""
                return
            }
            let p = list[i]
            title.innerText = p.name || "(untitled)"
            title.style.direction = contains_heb(p.name || "") ? "rtl" : "ltr"
            subtitle.innerText = [p.student, p.className].filter(Boolean).join(" · ")
            counter.innerText = `${i + 1} / ${list.length}`
            if (mode === "3d") {
                img.style.display = "none"
                empty.style.display = "none"
                frame.style.display = "block"
                set3dFrame(p)
            } else {
                frame.style.display = "none"
                frame.src = "about:blank" // unload the heavy editor
                if (p.thumb) {
                    empty.style.display = "none"
                    img.style.display = "block"
                    img.src = p.thumb
                    img.alt = p.name || ""
                } else {
                    img.style.display = "none"
                    empty.style.display = "block"
                    empty.innerText = "No thumbnail — use the 3D button"
                }
            }
        }

        let updatePauseLabel = () => {
            pauseBtn.textContent = paused ? "Play" : "Pause"
        }

        // ── Auto-advance with a visual countdown ────────────────────
        let timer = null
        let resetProgress = () => {
            progressFill.style.transition = "none"
            progressFill.style.width = "0%"
        }
        let freezeProgress = () => {
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
            let w = getComputedStyle(progressFill).width
            progressFill.style.transition = "none"
            progressFill.style.width = w
        }
        let scheduleNext = () => {
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
            resetProgress()
            if (paused || !active || list.length < 2) return
            chrome.storage.local.get(["speed"], (data) => {
                if (paused || !active || currentPage !== Context.GALLERY) return
                let ms = ((data && data.speed != null) ? 6 - Number(data.speed) : 3) * 10000
                void progressFill.offsetWidth // force reflow so the animation restarts
                progressFill.style.transition = `width ${ms}ms linear`
                progressFill.style.width = "100%"
                timer = setTimeout(() => {
                    if (paused || !active || currentPage !== Context.GALLERY) return
                    i = (i + 1) % list.length
                    render()
                    scheduleNext()
                }, ms)
            })
        }

        let goTo = (idx, manualPause) => {
            if (!list.length) return
            i = (idx % list.length + list.length) % list.length
            if (manualPause) paused = true
            render()
            updatePauseLabel()
            if (paused) freezeProgress()
            else scheduleNext()
        }

        // ── Controls ────────────────────────────────────────────────
        let pauseBtn = bigButton("Pause", () => {
            paused = !paused
            updatePauseLabel()
            if (paused) freezeProgress()
            else scheduleNext()
        })
        let modeBtn = bigButton("3D", () => {
            mode = mode === "3d" ? "image" : "3d"
            modeBtn.textContent = mode === "3d" ? "Image" : "3D"
            render()
        })

        bar.appendChild(bigButton("Back", () => {
            active = false
            if (timer) clearTimeout(timer)
            currentPage = prevPage
            disableView("gallery")
        }))
        bar.appendChild(labels)
        bar.appendChild(counter)
        bar.appendChild(bigButton("◀", () => goTo(i - 1, true)))
        bar.appendChild(pauseBtn)
        bar.appendChild(bigButton("▶", () => goTo(i + 1, true)))
        bar.appendChild(modeBtn)

        let begin = (items) => {
            list = items || []
            i = 0
            render()
            scheduleNext()
        }
        if (projects) {
            begin(projects)
        } else {
            // Opened from the classes dashboard (no list): load the whole school
            // first, then collect every project. Show a loading state meanwhile.
            title.innerText = "Loading…"
            empty.style.display = "block"
            empty.innerText = "Loading projects…"
            updateStorage(() => getGalleryProjects(begin))
        }
    }, () => {
    })
}
/** Shape a stored project into a gallery item with student + class labels. */
let toGalleryItem = (project, clazz) => ({
    id: project.id,
    name: project.name,
    thumb: project.thumb || null,
    student: (((clazz && clazz.students) || {})[project.author] || {}).name || null,
    className: (clazz && clazz.name) || null
})

let getGalleryProjects = (onComplete) => {
    let items = []
    let i = 0
    getKeys((keys) => {
        if (!keys.length) {
            onComplete([])
            return
        }
        for (const clazzID of keys) {
            get(clazzID, (clazz) => {
                for (const activity of Object.values((clazz && clazz.activities) || {})) {
                    for (const project of Object.values(activity.projects || {})) {
                        items.push(toGalleryItem(project, clazz))
                    }
                }
                // Async: must finish inside the get() callback, not outside it.
                if (++i >= keys.length) {
                    onComplete(items)
                }
            })
        }
    })
}


let teacherViewEnable = () => enableView("teacher", (container) => {
    currentPage = Context.TEACHER
    let active = true

    getCurrentActivityAndClassID((clazzID, activityID) => {
        // ── Layout: header + thumbnail grid ─────────────────────────
        let header = document.createElement("div")
        header.classList.add("btn-group")
        Object.assign(header.style, {
            display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto",
            padding: "6px 12px", boxSizing: "border-box", flexWrap: "wrap",
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let heading = document.createElement("div")
        Object.assign(heading.style, {fontSize: "15px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40vw"})
        let count = document.createElement("span")
        Object.assign(count.style, {fontSize: "13px", color: "#666", marginLeft: "auto"})
        let grid = document.createElement("div")
        Object.assign(grid.style, {
            display: "flex", flexWrap: "wrap", gap: "12px", padding: "12px",
            flex: "1", minHeight: "0", overflowY: "auto", alignContent: "flex-start", boxSizing: "border-box"
        })
        container.appendChild(header)
        container.appendChild(grid)

        // ── Enlarge overlay ─────────────────────────────────────────
        let overlay = document.createElement("div")
        Object.assign(overlay.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,0.88)", display: "none",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            zIndex: "2147483646", fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let ovTitle = document.createElement("div")
        Object.assign(ovTitle.style, {color: "#fff", fontSize: "18px", fontWeight: "700", margin: "8px 0"})
        let ovImg = document.createElement("img")
        Object.assign(ovImg.style, {maxWidth: "90vw", maxHeight: "74vh", objectFit: "contain", background: "#fff", borderRadius: "6px"})
        let ovFrame = document.createElement("iframe")
        Object.assign(ovFrame.style, {width: "90vw", height: "74vh", border: "none", display: "none", background: "#fff", borderRadius: "6px"})
        let ovBar = document.createElement("div")
        Object.assign(ovBar.style, {display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap", justifyContent: "center"})
        overlay.appendChild(ovTitle)
        overlay.appendChild(ovImg)
        overlay.appendChild(ovFrame)
        overlay.appendChild(ovBar)
        container.appendChild(overlay)

        // ── State ───────────────────────────────────────────────────
        let items = []        // {id, name, student, thumb, author}
        let cardEls = []
        let sel = -1
        let ovOpen = false
        let ovMode = "image"  // "image" | "3d"
        let autoId = 0
        let autoOn = false
        let className = ""
        let activityName = ""
        let codeAdded = false
        let SIZES = [180, 260, 360] // card widths in px; first = current minimum
        let sizeIdx = 0

        let buildItems = (clazz) => {
            let act = ((clazz && clazz.activities) || {})[activityID] || {}
            return Object.values(act.projects || {}).map((p) => ({
                id: p.id,
                name: p.name,
                author: p.author,
                thumb: p.thumb || null,
                student: (((clazz && clazz.students) || {})[p.author] || {}).name || p.author
            }))
        }

        let highlight = () => {
            cardEls.forEach((c, idx) => {
                c.style.border = idx === sel ? "2px solid #4076c7" : "2px solid transparent"
            })
        }

        let renderGrid = () => {
            grid.innerHTML = ""
            cardEls = []
            count.innerText = `${items.length} project${items.length === 1 ? "" : "s"}`
            items.forEach((it, idx) => {
                let cardW = SIZES[sizeIdx]
                let card = document.createElement("div")
                Object.assign(card.style, {
                    width: `${cardW}px`, cursor: "pointer", border: "2px solid transparent",
                    borderRadius: "8px", overflow: "hidden", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
                })
                let thumbWrap = document.createElement("div")
                Object.assign(thumbWrap.style, {
                    width: "100%", height: `${Math.round(cardW * 0.75)}px`, background: "#f1f5f9", display: "flex",
                    alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: "32px"
                })
                if (it.thumb) {
                    let im = document.createElement("img")
                    Object.assign(im.style, {width: "100%", height: "100%", objectFit: "cover"})
                    im.src = it.thumb
                    im.alt = it.name || ""
                    thumbWrap.appendChild(im)
                } else {
                    thumbWrap.textContent = "🧊"
                }
                let lbl = document.createElement("div")
                Object.assign(lbl.style, {padding: "6px 8px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
                lbl.textContent = it.student
                lbl.title = `${it.student} — ${it.name || ""}`
                card.appendChild(thumbWrap)
                card.appendChild(lbl)
                card.onclick = () => openOverlay(idx)
                grid.appendChild(card)
                cardEls.push(card)
            })
            highlight()
        }

        let renderOverlay = () => {
            if (sel < 0 || sel >= items.length) return
            let it = items[sel]
            ovTitle.textContent = `${it.student} — ${it.name || ""}`
            ovTitle.style.direction = contains_heb(it.name || "") ? "rtl" : "ltr"
            if (ovMode === "3d") {
                ovImg.style.display = "none"
                ovFrame.style.display = "block"
                ovFrame.src = `https://www.tinkercad.com/things/${it.id}/edit`
                awaitResult(() => {
                    let doc = ovFrame.contentDocument
                    if (active && ovOpen && ovMode === "3d" && doc) return doc.querySelector("#viewcube-home-button")
                    return false
                }, () => {
                    let doc = ovFrame.contentDocument
                    doc.querySelector("#sidebarContainer")?.remove()
                    doc.querySelector(".editor__tab__subnav")?.remove()
                    doc.querySelector(".editor__topnav")?.remove()
                    doc.querySelector(".hud")?.remove()
                }, 300, () => !active || !ovOpen || ovMode !== "3d")
            } else {
                ovFrame.style.display = "none"
                ovFrame.src = "about:blank"
                ovImg.style.display = "block"
                ovImg.src = it.thumb || ""
                ovImg.alt = it.name || ""
            }
        }

        let openOverlay = (idx) => {
            if (!items.length) return
            sel = (idx % items.length + items.length) % items.length
            ovOpen = true
            ovMode = "image"
            modeBtn.textContent = "3D"
            overlay.style.display = "flex"
            highlight()
            renderOverlay()
        }
        let closeOverlay = () => {
            ovOpen = false
            ovFrame.src = "about:blank"
            overlay.style.display = "none"
        }
        let move = (delta) => {
            if (!items.length) return
            if (!ovOpen) {
                openOverlay(0)
                return
            }
            sel = (sel + delta + items.length) % items.length
            ovMode = "image"
            modeBtn.textContent = "3D"
            highlight()
            renderOverlay()
        }

        // ── Overlay controls ────────────────────────────────────────
        let modeBtn = bigButton("3D", () => {
            ovMode = ovMode === "3d" ? "image" : "3d"
            modeBtn.textContent = ovMode === "3d" ? "Image" : "3D"
            renderOverlay()
        })
        ovBar.appendChild(bigButton("◀", () => move(-1)))
        ovBar.appendChild(modeBtn)
        ovBar.appendChild(bigButton("STL", () => {
            let it = items[sel]
            if (!it) return
            download({id: it.id, downloadName: downloadFileBase(it.student, it.name)}, downloadFolder(className || "TinkerCAD"), "stl")
        }))
        ovBar.appendChild(bigButton("PNG", () => {
            let it = items[sel]
            if (!it) return
            if (!it.thumb) {
                alert("No thumbnail for this project")
                return
            }
            downloadBatch([{url: it.thumb, filename: `${downloadFolder(className || "TinkerCAD")}/${downloadFileBase(it.student, it.name)}.png`}])
        }))
        ovBar.appendChild(bigButton("Open in 3D ↗", () => {
            let it = items[sel]
            if (it) openTab(`https://www.tinkercad.com/things/${it.id}/edit`)
        }))
        ovBar.appendChild(bigButton("▶", () => move(1)))
        ovBar.appendChild(bigButton("Close", () => closeOverlay()))

        // ── Auto-play (cycles the enlarged overlay) ─────────────────
        let autoLoop = (id) => {
            chrome.storage.local.get(["speed"], (data) => {
                let speed = (data && data.speed != null) ? 6 - Number(data.speed) : 3
                setTimeout(() => {
                    if (!active || currentPage !== Context.TEACHER || autoId !== id) return
                    if (items.length) {
                        if (!ovOpen) openOverlay(0)
                        else move(1)
                    }
                    autoLoop(id)
                }, speed * 10000)
            })
        }
        let toggleAuto = () => {
            autoOn = !autoOn
            autoBtn.style.backgroundColor = autoOn ? "#4076c7" : "#fff"
            autoBtn.style.color = autoOn ? "#fff" : "#4076c7"
            autoId++
            if (autoOn) autoLoop(autoId)
        }

        // ── Keyboard: ←/→ navigate, Space toggles Auto, Esc closes ──
        let onKey = (e) => {
            if (!active || currentPage !== Context.TEACHER) return
            if (e.key === "ArrowRight") {
                move(1)
                e.preventDefault()
            } else if (e.key === "ArrowLeft") {
                move(-1)
                e.preventDefault()
            } else if (e.key === "Escape") {
                if (ovOpen) closeOverlay()
            } else if (e.code === "Space") {
                toggleAuto()
                e.preventDefault()
            }
        }
        document.addEventListener("keydown", onKey)

        // ── Header buttons ──────────────────────────────────────────
        header.appendChild(bigButton("Back", () => {
            active = false
            autoId++
            document.removeEventListener("keydown", onKey)
            currentPage = Context.ACTIVITY
            disableView("teacher")
        }))
        header.appendChild(heading)
        let autoBtn = bigButton("Auto", () => toggleAuto())
        header.appendChild(autoBtn)
        header.appendChild(bigButton("Reload", () => load()))
        // Thumbnail size selector (S = current minimum, M, L)
        let sizeBtns = []
        let setSize = (idx) => {
            sizeIdx = idx
            sizeBtns.forEach((b, k) => {
                b.style.backgroundColor = k === idx ? "#4076c7" : "#fff"
                b.style.color = k === idx ? "#fff" : "#4076c7"
            })
            renderGrid()
        }
        ;["S", "M", "L"].forEach((labelTxt, idx) => {
            let b = bigButton(labelTxt, () => setSize(idx))
            sizeBtns.push(b)
            header.appendChild(b)
        })
        header.appendChild(count)
        setSize(0)

        // ── Data load (full) + light periodic refresh ──────────────
        let rebuild = (done = () => {
        }) => {
            get(clazzID, (clazz) => {
                clazz = clazz || {}
                className = clazz.name || ""
                activityName = (((clazz.activities || {})[activityID]) || {}).name || ""
                heading.textContent = [className, activityName].filter(Boolean).join(" · ") || activityID
                if (!codeAdded && clazz.code) {
                    codeAdded = true
                    let codeBtn = bigButton(String(clazz.code), () => copyTextToClipboard(String(clazz.code).replaceAll("-", "")))
                    header.insertBefore(codeBtn, autoBtn)
                }
                let prevId = (sel >= 0 && sel < items.length) ? items[sel].id : null
                items = buildItems(clazz)
                if (prevId) {
                    let ni = items.findIndex((x) => x.id === prevId)
                    sel = ni >= 0 ? ni : (items.length ? Math.min(sel, items.length - 1) : -1)
                }
                renderGrid()
                if (ovOpen) {
                    if (sel >= 0) renderOverlay()
                    else closeOverlay()
                }
                done()
            })
        }
        let load = (done = () => {
        }) => sasAllDataForClassActivity(clazzID, activityID, () => rebuild(done), true)
        let refresh = (done = () => {
        }) => sasGetProjectsOfActivity(clazzID, activityID, () => rebuild(done), true)

        let pollLoop = () => {
            setTimeout(() => {
                if (!active || currentPage !== Context.TEACHER) return
                refresh()
                pollLoop()
            }, 30000)
        }

        load()
        pollLoop()
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
        if (!v) {
            console.warn("[tca] No classroom id in URL:", data)
            return
        }
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
        if (!d) {
            console.warn("[tca] No classroom/activity id in URL:", data)
            return
        }
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
            button("OBJ", () => {
                resolveDownloadTarget(id, name, (folder, fileBase) => {
                    download({id: id, downloadName: fileBase}, folder, "obj", () => {
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
                let items = []
                for (const activities of Object.values((clazz && clazz.activities) || {})) {
                    for (const project of Object.values(activities.projects || {})) {
                        items.push(toGalleryItem(project, clazz))
                    }
                }
                galleryViewEnable(items)
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
            getCurrentActivityAndClassID((clazzID, activityID) => {
                get(clazzID, (clazz) => {
                    let act = ((clazz && clazz.activities) || {})[activityID] || {}
                    let items = Object.values(act.projects || {}).map((p) => toGalleryItem(p, clazz))
                    galleryViewEnable(items)
                })
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
                elem.appendChild(lazyDownloadAllButton("obj", lazyAction))
                elem.appendChild(lazyDownloadAllThumbnailsButton(lazyAction))
            })


        })


    }, 300, Context.ACTIVITY)
    sasGeneralClasses(() => {

        console.log("Collected standard basic student data")
    })
}
main()

