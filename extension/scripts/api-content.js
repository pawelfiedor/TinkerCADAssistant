let commands = {}
let registerCommand = (command) => {
    commands[command.command] = command
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Test")
    if (message) {
        let og = message.value

        let args = og.split("(SPLIT)")
        let command = commands[args[0]]
        if (command === undefined) {
            return false
        }
        //Actually running command's action using the arguments provided with the sendResponse back
        command.action(args, sendResponse)

    }
    return false;
});


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
    chrome.storage.local.get(["prints"], (data) => {
        let store
        if (!data.prints) {
            store = {}
        } else store = data.prints
        {
            store[id] = value
        }

        chrome.storage.local.set({prints: store}, (data) => {
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
let awaitResult = (condition, onComplete, delay = 1000) => {

    setTimeout(() => {
        let state = condition()
        if (!state) {
            return awaitResult(condition, onComplete, delay)
        }

        return onComplete()

    }, delay)
}


/**
 * Collect and manipulate data from a page.
 * @param url URL to grab data from
 * @param selector Wait for and collect data from this selector.
 * @param map Run this mapping function to manipulate the data
 * @param onComplete Lambada function called once the collection is complete with the results.
 */
let currentCollection = null
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
        }, 500)

        return
    }

    awaitResult(() => {
        return currentCollection === null
    }, () => {
        collectOne(url, selector, map, onComplete)
    }, 500)
}
console.log("Hello there!")


let printList = (onComplete) => {

    let printList = []
    getKeys((clazzIDS) => {
        for (const clazzID of clazzIDS) {
            get(clazzID, (clazz) => {
                for (const activity of Object.values(clazz.activities)) {
                    for (const project of Object.values(activity.projects)) {
                        printList.push({
                            clazz: clazzID, activity: activity.id, id: project.id
                        })
                    }
                }
                onComplete(printList)
            })
        }
    })
}

let sasPrintsForIDS = (ids) => {
    for (const project of ids) {
        setTimeout(() => {
            collectOne(`https://api-reader.tinkercad.com/designs/detail/${project.id}`, "pre", (item) => {
                let json = JSON.parse(item.textContent)
                return {
                    tags: json.asm_tags,
                    description: json.asm_description
                }
            }, (item) => {
                modify(project.id, (data) => {
                    data.id = project.id
                    data.activity = project.activity
                    data.clazz = project.clazz
                    data.printInfo = item
                })
                // if (++i >= projects.length) {
                //     onDone()
                // }
            })
        }, 500)
    }
}

registerCommand({
    // project.id, project.name, directoryName, format
    command: "api2", action: (args, sendResponse) => {
        sasPrintsForIDS(args.splice(0, 1))

    }
})


let setup = (onDone) => {
    for (const item of document.querySelector("body").children) {
        if (item.id !== "queryFrame") item.remove()
    }
    document.body.textContent = ""
    let h1 = document.createElement("h1")
    h1.textContent = "TinkerCAD Assistant Collecting project information for printing list"
    document.querySelector("body").appendChild(h1)
}

setup(() => {
    console.log("Collected all!")
})