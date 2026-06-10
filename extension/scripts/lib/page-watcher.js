const Context = Object.freeze({
    GENERAL: 'general',
    ACTIVITY: 'activity',
    TEACHER: 'teacher',
    CLASSES: 'classes',
    GALLERY: 'gallery',
    ACTIVITIES: 'activities',
    PRINTER: 'printer'
})

window.currentPage = Context.GENERAL

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
            if (window.currentPage !== context) return
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
    console.log(`Moved to context of :${window.currentPage}, now updating all matching elements!`)
    for (let contextID of Object.keys(elementListeners)) {
        if (window.currentPage !== contextID) continue
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
let classesRegex = /^https:\/\/www\.tinkercad\.com\/dashboard\/classes(\?.*)?$/gm
let activitiesRegex = /^https:\/\/www\.tinkercad\.com\/classrooms\/.+\/activities(\?.*)?$/gm

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
                    window.currentPage = Context.ACTIVITY
                } else if (url.match(classesRegex)) {
                    window.currentPage = Context.CLASSES
                } else if (url.match(activitiesRegex)) {
                    window.currentPage = Context.ACTIVITIES
                } else {
                    window.currentPage = Context.GENERAL
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

if (typeof window !== 'undefined') {
    window.Context = Context;
    window.awaitResult = awaitResult;
    window.onElementLoad = onElementLoad;
    window.onElementsLoad = onElementsLoad;
    window.updateActiveListeners = updateActiveListeners;
    window.getCurrentURL = getCurrentURL;
}
