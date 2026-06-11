/**
 *  TinkerCAD assistant was developed by Ezra Golombek 2025.
 */

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
        let target = container.querySelector("#newClassButton")
        if (target) {
            target.insertAdjacentElement('afterend', elem)
        } else {
            container.appendChild(elem)
        }
    }, 500, Context.CLASSES)

    onElementLoad(".left-actions", "prints", (container) => {
        let elem = smallButton2("Print Manager", () => {
            printerViewEnable()
        })
        let target = container.querySelector("#newClassButton")
        if (target) {
            target.insertAdjacentElement('afterend', elem)
        } else {
            container.appendChild(elem)
        }
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
                resolveDownloadTarget(id, name, (folder, fileBase, proj) => {
                    download({id: id, downloadName: withWeightSuffix(fileBase, proj && proj.tags)}, folder, "stl", () => {
                    })
                })
            })
            button("OBJ", () => {
                resolveDownloadTarget(id, name, (folder, fileBase, proj) => {
                    download({id: id, downloadName: withWeightSuffix(fileBase, proj && proj.tags)}, folder, "obj", () => {
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

            item.querySelector(".thumbnail").insertAdjacentElement("beforebegin", container)

            // Inject status chips
            let clazzMatch = /\/classrooms\/(\w+)/.exec(window.location.href)
            let clazzId = clazzMatch ? clazzMatch[1] : null
            tcaLoadProjectStatus(id, (projInfo) => {
                if (!projInfo) return
                if (!projInfo.clazzId && clazzId) projInfo.clazzId = clazzId

                let statusWrapper = document.createElement("div")
                statusWrapper.className = "tca-view"
                statusWrapper.style.padding = "6px 8px"
                statusWrapper.style.display = "flex"
                statusWrapper.style.justifyContent = "center"
                statusWrapper.style.borderTop = "1px solid #e2e8f0"
                statusWrapper.style.backgroundColor = "#fafbfc"

                let chipsCtl = tcaLiveStatusChips(projInfo, {
                    compact: false
                })
                statusWrapper.appendChild(chipsCtl.el)
                item.appendChild(statusWrapper)
            })
        }, 3000, context)
    }
    easyTools(Context.GENERAL)
    easyTools(Context.ACTIVITY)

    onElementLoad("tk-assignments-list", "gallery", (container) => {
        if (container.querySelector("#tcaGalleryBtn")) return

        let toolbar = container.querySelector(".class-projects-list-toolbar")
        if (!toolbar) {
            toolbar = document.createElement("div")
            toolbar.className = "class-projects-list-toolbar"
            Object.assign(toolbar.style, {
                display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap",
                alignItems: "center", width: "100%"
            })
            container.insertAdjacentElement("afterbegin", toolbar)
        }

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
        elem.id = "tcaGalleryBtn"
        elem.style.marginLeft = "5px"

        let elemAnalytics = bigButton("Analytics", () => {
            analyticsViewEnable()
        })
        elemAnalytics.id = "tcaAnalyticsBtn"
        elemAnalytics.style.marginLeft = "5px"

        toolbar.appendChild(elem)
        toolbar.appendChild(elemAnalytics)
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
                                    tags: project.tags || "",
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
                elem.appendChild(bigButton("Export Portfolio ZIP", () => {
                    exportPortfolioZip(clazzID, activityID)
                }))
            })
        })
    }, 300, Context.ACTIVITY)

    sasGeneralClasses(() => {
        console.log("Collected standard basic student data")
    })
}

/**
 * Load the status info of a project. Searches local cache first.
 * If not found, makes an API call to Tinkercad to fetch metadata.
 */
let tcaLoadProjectStatus = (projectId, callback) => {
    getKeys((keys) => {
        if (!keys || !keys.length) {
            // No cache, call API
            tcApi.design(projectId).then((d) => {
                callback({
                    id: projectId,
                    tags: d.asm_tags || "",
                    printDescription: d.asm_description || "",
                    name: d.description || d.name || d.title || ""
                })
            }).catch(() => callback(null))
            return
        }

        let checked = 0
        let found = null
        for (let key of keys) {
            get(key, (clazz) => {
                if (found) return
                for (let act of Object.values((clazz && clazz.activities) || {})) {
                    if (act.projects && act.projects[projectId]) {
                        found = {
                            id: projectId,
                            tags: act.projects[projectId].tags || "",
                            printDescription: act.projects[projectId].printDescription || "",
                            clazzId: key,
                            name: act.projects[projectId].name || ""
                        }
                        break
                    }
                }
                checked++
                if (checked === keys.length || found) {
                    if (found) {
                        callback(found)
                    } else {
                        // Not found in cache, fetch from API
                        tcApi.design(projectId).then((d) => {
                            callback({
                                id: projectId,
                                tags: d.asm_tags || "",
                                printDescription: d.asm_description || "",
                                name: d.description || d.name || d.title || ""
                            })
                        }).catch(() => callback(null))
                    }
                }
            })
        }
    })
}

main()

if (typeof window !== 'undefined') {
    window.getCurrentClazzID = getCurrentClazzID;
    window.getCurrentActivityAndClassID = getCurrentActivityAndClassID;
    window.getCurrentClazz = getCurrentClazz;
    window.getCurrentActivity = getCurrentActivity;
    window.tcaLoadProjectStatus = tcaLoadProjectStatus;
}
