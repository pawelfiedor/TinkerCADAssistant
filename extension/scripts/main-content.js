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
    let copyFrom = document.createElement("textarea");
    copyFrom.textContent = text;
    document.body.appendChild(copyFrom);
    copyFrom.select();
    document.execCommand('copy');
    copyFrom.blur();
    document.body.removeChild(copyFrom);
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
    chrome.storage.sync.get(["storage"], (data) => {
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
    chrome.storage.sync.get(["storage"], (data) => {
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
    chrome.storage.sync.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else store = data.storage
        {
            store[id] = value
        }

        chrome.storage.sync.set({storage: store}, (data) => {
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
            let counter = 0
            for (const project of Object.values(projects)) {
                // if (project.name === ogProjectName || project.name === `Copy of ${ogProjectName}`) {
                //     counter++
                //     continue
                //TODO: ADD BACK Skipping of bad named stuffs
                // }

                download({
                    id: project.id.replace(" ", ""), downloadName: project.downloadName.replace(/ /g, '')
                }, directoryName, format, () => {
                    counter++
                    if (counter >= projects.length) {
                        alert("Downloads finished!")
                    }
                })
            }
        })

    })
}

let downloadAllButton = (format, directoryName, items) => {
    return bigButton(`Download ${format}s`, () => {
        let counter = 0
        for (const project of Object.values(items)) {
            // if (project.name === ogProjectName || project.name === `Copy of ${ogProjectName}`) {
            //     counter++
            //     continue
            //TODO: ADD BACK Skipping of bad named stuffs
            // }

            download({
                id: project.id.replace(" ", ""), downloadName: project.downloadName.replace(/ /g, '')
            }, directoryName, format, () => {
                counter++
                if (counter >= projects.length) {
                    alert("Downloads finished!")
                }
            })
        }
    })
}


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
let awaitResult = (condition, onComplete, delay = 1000) => {

    setTimeout(() => {
        let state = condition()
        if (!state) {
            return awaitResult(condition, onComplete, delay)
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
let getCurrentURL = (onComplete, delay = 100) => {
    awaitResult(() => {
        let item = document.querySelector("#urlchecker")
        if (!item) {
            sendCommand(["url"], (url) => {
                setCurrentURL(url)
            })
            return false
        }
        if (item.textContent !== undefined && item.textContent !== null) return true
    }, () => {
        onComplete(document.querySelector("#urlchecker").textContent)
    }, delay)


}
/**
 * Set the current url the page is at
 * @param url The url that the page is at.
 */
let setCurrentURL = (url) => {
    let item = document.querySelector("#urlchecker")
    if (!item) {
        let newItem = document.createElement("p")
        newItem.style.display = "none"
        newItem.textContent = url
        newItem.id = "urlchecker"

        document.body.appendChild(newItem)
    } else {
        item.textContent = url
    }

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
let onURLChange = () => {
    setTimeout(() => {
        sendCommand(["url"], (url) => {

            getCurrentURL((newURL) => {
                if ((url !== newURL && url !== null && url !== undefined) || first) {
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
                        setCurrentURL(url)
                        updateActiveListeners()
                        first = false
                    }

                }
            })

        })
        onURLChange()
    }, 1000)
}
onURLChange()


let frame
/**
 * Returns the current frame that provides as with new information that we can scrape in the background.
 * NOTE: Please be warry! if you are scraping a few sites that have the same selectors make sure to blank out the url each run see example in collect.
 * @returns {Element}
 */
let getFrame = (url) => {
    let queryFrame = document.querySelector("#queryFrame")
    if (queryFrame) {
        if (frame.src !== url) frame.src = url
        return queryFrame
    }
    frame = document.createElement("iframe")
    frame.id = "queryFrame"
    frame.style.display = "none"
    frame.src = url
    document.body.appendChild(frame)

    return frame
}
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
 * Send a command to the service worker
 * @param command Command to run
 * @param onComplete Response from command.
 */
let sendCommand = (command, onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.runtime.sendMessage({value: command.join("(SPLIT)")}, (response) => {
        onComplete(response)

    });
}

/**
 * Download a project
 * @param project Download object, see example objects for example.
 * @param directoryName Name of directory that the items will be downloaded to
 * @param format Format to download the items as (STL SVG etc)
 * @param onComplete Callback run once download complete.
 */
let download = (project, directoryName, format, onComplete) => {
    sendCommand(["download", project.id, project.downloadName, directoryName, format], onComplete)
}


/**
 * Collect all of a type and manipulate that data in a certain manner.
 * This is based on an iframe.
 */
let currentCollection = null
/**
 * Collect and manipulate data from a page
 * @param url URL to grab data from
 * @param awaitSelector Wait for this selector to be on page before beginning.
 * @param generalSelector Use this selector to grab all the items with it.
 * @param map Run this mapping function to manipulate the data
 * @param onComplete Lambada function called once the collection is complete with the results.
 * @param secondary Secondary actions that can be run to collect all the needed info
 */
let collect = (url, awaitSelector, generalSelector, map, onComplete, secondary = null) => {

    if (!currentCollection) {
        currentCollection = url
        awaitResult(() => {
            return getFrame(url).contentDocument.querySelector(awaitSelector) !== null
        }, () => {

            let frame = getFrame(url).contentDocument
            let mapped = []
            for (let item of frame.querySelectorAll(generalSelector)) {
                mapped.push(map(item))
            }

            getFrame("")
            if (secondary) {
                onComplete(mapped, secondary(frame))
            } else {
                onComplete(mapped)
            }
            currentCollection = null
        })

        return
    }

    awaitResult(() => {
        return currentCollection === null
    }, () => {
        collect(url, awaitSelector, generalSelector, map, onComplete)
    })
}

/**
 * Collect and manipulate data from a page.
 * @param url URL to grab data from
 * @param selector Wait for and collect data from this selector.
 * @param map Run this mapping function to manipulate the data
 * @param onComplete Lambada function called once the collection is complete with the results.
 */
let collectOne = (url, selector, map, onComplete) => {
    if (!currentCollection) {
        currentCollection = url

        awaitResult(() => {
            return getFrame(url).contentDocument.querySelector(selector) !== null
        }, () => {

            let frame = getFrame(url).contentDocument
            getFrame("")
            onComplete(map(frame.querySelector(selector)))
            currentCollection = null
        }, 300)

        return
    }

    awaitResult(() => {
        return currentCollection === null
    }, () => {
        collectOne(url, selector, map, onComplete)
    }, 300)
}
let basicCollectOne = (url, map, onComplete) => {
    if (!currentCollection) {
        currentCollection = url

        let frame = getFrame(url).contentDocument
        onComplete(map(frame))
        getFrame("")
        currentCollection = null

        return
    }

    awaitResult(() => {
        return currentCollection === null
    }, () => {
        basicCollectOne(url, map, onComplete)
    }, 300)
}


/**
 * UAS Based action that stores the basic list of classes.
 * NOTE: Please use this function before any other UAS operations since this builds the foundation for everything.
 * @param onComplete Run once the data has been collected.
 */
let sasGeneralClasses = (onComplete = () => {
}) => collect("https://www.tinkercad.com/dashboard/classes", ".classes-list", ".classes-list", (item) => {
    return {
        name: item.querySelector(".class-name").querySelector("p").textContent,
        id: item.querySelector(".event-handler").id.replace("Checkbox", "")
    }
}, (clazzes) => {

    let i = 0
    for (let clazz of clazzes) {
        modify(clazz.id, (data) => {
            data.name = clazz.name
            data.id = clazz.id

        }, () => {
            if (++i >= clazzes.length) onComplete()
        })
    }


})


/**
 * UAS Based action to store the activities of a class
 * @param clazzID ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasClassActivitiesOf = (clazzID, onComplete = () => {
}, force = false) => {
    get(clazzID, (data) => {


        if (data.activities && !force) {
            onComplete()
            console.log("All activities are up to date!")
            return
        }

        collect(`https://www.tinkercad.com/classrooms/${clazzID}/activities`, ".class-project-card-wrapper", ".class-project-card-wrapper", (item) => {


            return {
                id: item.id.replace("ActivityCard", ""), name: item.querySelector("p").textContent
            }
        }, (results) => {

            modify(clazzID, (clazz) => {
                if (!clazz.activities) clazz.activities = {}
                for (let result of results) {
                    if (!clazz.activities[result.id]) clazz.activities[result.id] = result
                }
            }, onComplete)
            console.log(`Filling in activities for class of ${clazzID}`)
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
        if (data.activities[activity].projects && /*data.activities[activity].ogFiles &&*/ !force) {
            onComplete()
            console.log("All activities are up to date!")
            return
        }

        collect(`https://www.tinkercad.com/classrooms/${clazz}/activities/${activity}`, ".project-students-assets", ".thing-box", (item) => {
            let author = (/.+(\w{11}).+/gm).exec(item.querySelector(".author-information").querySelector("a").href)[1]
            let projectID = item.querySelector("a").href.match(projectIDRegex)[0].replace("/things/", "")
            let name = item.querySelector("h3").textContent

            return {
                id: projectID, name: name, author: author,
            }

        }, (results, secondaryResult) => {

            modify(clazz, (data) => {
                data.activities[activity].projects = {}
                data.activities[activity].ogFiles = {}
                if (secondaryResult) for (let file of secondaryResult) {
                    data.activities[activity].ogFiles[file.id] = file
                }
                for (let project of results) {
                    data.activities[activity].projects[project.id] = project
                }
            }, onComplete)
            console.log(`Filling in all of the projects of the activity of ${activity}`)
        }, (frame) => {
            let files = []
            if (!frame.querySelector(".asset-card-wrapper")) return []
            for (const ogFile of frame.querySelectorAll(".asset-card-wrapper")) {
                let item = ogFile.querySelector(".asset-card-title")
                files.push({
                    id: item.id.replace("TemplateDesignHeaderCard", ""), name: item.querySelector("p").textContent
                })
            }
            return files
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
        if (data.students && !force) {
            onComplete()
            console.log("All students are up to date!")
            return
        }
        collect(`https://www.tinkercad.com/classrooms/${id}/students`, ".table-content", ".table-content", (item) => {
            let username = item.querySelector(".nickname")
            if (!username) {
                username = "not-found"
            } else {
                username = item.querySelector(".nickname").textContent.replaceAll(" ", "")
            }
            let name = item.querySelector("a")
            if (!name) {
                name = "not-found"
            } else {
                name = item.querySelector("a").title
            }

            return {
                id: item.querySelector(".rounded-checkbox").id.replace("StudentCheckbox", ""),
                name: name,
                username: username,
                badgeCount: item.querySelector(".classroom-badge-cell").title.replace("This student has ", "").replace(" badges", "").replace(" badge", "")

            }
        }, (students, code) => {

            modify(id, (data) => {
                if (!data.students) data.students = {}
                data.code = code
                for (let student of students) {
                    data.students[student.id] = student
                }

            }, onComplete)

        }, (container) => {
            return container.querySelector("#teacherTooltipButton").textContent.replace("Class link: ", "")
        })
    })

}
let sasPrintListForProjects = (ids) => {
    let items = ids
    items.unshift("api")
    sendCommand(items, () => {
        setTimeout(() => {
            sendCommand(["api2"], () => {
                console.log("TEst")
            })
        }, 40)
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
    collectOne("https://www.tinkercad.com/dashboard", "tk-header-avatar", (data) => {
        return data.querySelector("img").src.replace("https://api-reader.tinkercad.com/api/user/", "").replace("/images/kursuH3JRXo/t40.jpg", "")
    }, (data) => {
        onRetrieve(data)

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
    chrome.storage.sync.get("user", (user) => {
        getCurrentUser((username) => {
            if (user.user !== username) {
                console.log("Attempting to rebuild storage cache!")
                chrome.storage.sync.clear(() => {
                    chrome.storage.sync.set({user: username}, () => {
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
let galleryViewEnable = (projects = null) => enableView("gallery", (container) => {
    currentPage = Context.GALLERY
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
            let document = frame.contentDocument
            if (currentPage === Context.GALLERY && document) {
                return document.querySelector("#viewcube-home-button")
            }
            return false
        }, () => {
            frame.contentDocument.querySelector("#sidebarContainer").remove()
            frame.contentDocument.querySelector(".editor__tab__subnav").remove()
            frame.contentDocument.querySelector(".editor__topnav").remove()
            frame.contentDocument.querySelector(".hud").remove()
            let canvas = frame.contentDocument.querySelector("canvas")
            canvas.style.width = "100vw"
            frame.style.height = "95vh"
        }, 300)
    }
    frame.style.width = "100vw"
    frame.style.height = "95vh"
    let i = 1

    let loop = (projects) => {
        chrome.storage.sync.get(["speed"], (data) => {
            let speed = data ? 6 - data.speed : 3
            setTimeout(() => {
                if (currentPage !== Context.GALLERY) return

                if (projects.length <= i) i = 0

                setFrame(projects[i].id, projects[i].name)
                i++

                loop(projects)

            }, speed * 10000)
        })
    }

    if (projects) {
        setFrame(projects[0].id, projects[0].name)
        loop(projects)
    } else {
        getGalleryProjects((projects) => {
            setFrame(projects[0].id, projects[0].name)
            loop(projects)
        })
    }
    container.appendChild(bigButton("Back", () => {
        disableView("gallery")
    }))


}, () => {


})
let getGalleryProjects = (onComplete) => {
    let projects = []
    let i = 0
    getKeys((keys => {
        for (const clazzID of keys) {
            get(clazzID, (clazz) => {

                let students = []
                for (const student of Object.values(clazz.students)) {
                    if (student.badgeCount !== "0" && student.badgeCount !== null && student.badgeCount !== undefined) {
                        students.push(student.id)
                    }
                }
                for (const activity of Object.values(clazz.activities)) {
                    for (const project of Object.values(activity.projects)) {
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


            let first = true
            if (clazz.activities)
                if (clazz.activities[activityID])
                    for (let project of Object.values(clazz.activities[activityID].projects)) {

                        let b = smallButton(clazz.students[project.author].name, () => {
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
                        if (!clazz.activities[activityID]) return []
                        return clazz.activities[activityID].projects
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
                        let b = smallButton(clazz.students[project.author].name, () => {
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
                chrome.storage.sync.get(["speed"], (data) => {
                    let speed = 3
                    if (data)
                        speed = 6 - data.speed


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
    onURLChange()

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
            let container = document.createElement("div")
            container.style.padding = "3px"
            container.style.display = "flex"
            container.style.alignItems = "center"
            container.style.justifyContent = "center"
            let id = item.querySelector("a").href?.match(projectIDRegex)?.[0]?.replace("/things/", "")
            if (!id) return
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
                sendCommand(["open", `https://www.tinkercad.com/things/${id}/edit`, () => {
                }])
            })
            button("STL", () => {
                download({
                    id: id.replace(" ", ""), downloadName: name.replace(/ /g, '')
                }, "tinkerAssistant", "stl", () => {
                })

            })
            button("SVG", () => {
                download({
                    id: id.replace(" ", ""), downloadName: name.replace(/ /g, '')
                }, "tinkerAssistant", "stl", () => {
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
                        let activityName = clazz.activities[activityID].name
                        let projects = clazz.activities[activityID].projects
                        let downloadItems = {}

                        let directoryName = `${clazz.name.replace(/ /g, '')}/${activityName.replace(/ /g, '')}`
                        for (let project of Object.values(projects)) {
                            downloadItems[project.id] = {
                                id: project.id, downloadName: clazz.students[project.author].name.replace(/ /g, '')
                            }

                        }
                        onComplete(directoryName, downloadItems)
                    }, true)
                }

                elem.appendChild(lazyDownloadAllButton("stl", lazyAction))
                elem.appendChild(lazyDownloadAllButton("svg", lazyAction))
            })


        })


    }, 300, Context.ACTIVITY)
    sasGeneralClasses(() => {

        console.log("Collected standard basic student data")
    })
}
main()

