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

if (typeof window !== 'undefined') {
    window.get = get;
    window.getKeys = getKeys;
    window.unsafeSet = unsafeSet;
    window.unSafeModify = unSafeModify;
    window.modify = modify;
    window.queue = queue;
}
