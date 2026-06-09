let isActive = (message = false) => {
    if (message) console.log("Extension was reloaded, no exception thrown")
    return chrome.runtime?.id
}

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


let toggleDropdown = () => {
    document.querySelector(".dropdown").classList.toggle("open");
}

let toggleFeature = (element) => {
    let selectedText = document.getElementById("selected-features");
    let selected = document.querySelectorAll(".selected")
    let unselected = document.querySelectorAll(".unselected")

    for (let elem of selected) {
        if (element === elem) {
            elem.classList.remove("selected")
            elem.classList.add("unselected")
        }
    }

    for (let elem of unselected) {
        if (element === elem) {
            elem.classList.add("selected")
            elem.classList.remove("unselected")
        }
    }
    let newSelected = document.querySelectorAll(".selected")
    let items = ""
    let first = true
    for (const item of newSelected) {
        if (first) {
            first = false
            items = item.textContent
            continue
        }
        items = `${items}, ${item.textContent}`
    }
    selectedText.innerText = newSelected.length ? items : "Select Features ▼";
}

// for (const value of document.querySelectorAll(".feature")) {
//     value.onclick = () => {
//         toggleFeature(value)
//     }
// }
// for (const value of document.querySelectorAll(".dropdown")) {
//     value.onclick = () => {
//         toggleDropdown()
//     }
// }

let retrieveALLActivityNames = (onComplete) => {
    let titles = []
    getKeys((clazzIDs) => {

        for (const clazzID of clazzIDs) {
            get(clazzID, (clazz) => {
                for (const activity of Object.values(clazz.activities)) {
                   let toggle = true
                    for (const title of titles){
                        if (title === activity.name) {
                            console.log(`A: ${title} B: ${activity.name}`)
                            toggle = false
                            break
                        }
                    }
                    if (toggle)
                    titles.push(activity.name)


                }
                onComplete(titles)
            })
        }
    })
}

// retrieveALLActivityNames((names) => {
//     let container = document.querySelector(".selection")
//     for (const name of names) {
//         let className = document.createElement("div")
//         className.classList.add("feature", "unselected")
//         className.textContent = name
//         container.appendChild(className)
//     }
//
// })
chrome.storage.local.get(["speed"], (speed) => {
    if (!speed)
        chrome.storage.local.set({speed: 4}, () => {
            document.querySelector("#speed").value = speed.speed
        })
    else {

        document.querySelector("#speed").value = speed.speed
    }
})

let save = () => {
    chrome.storage.local.set({speed: document.querySelector("#speed").value}, () => {
    })
}
let saveButton = document.querySelector("#save-btn")
saveButton.onclick = () => {
    save()
}