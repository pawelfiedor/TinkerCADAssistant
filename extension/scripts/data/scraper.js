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
        let projs = data && data.activities && data.activities[activity] && data.activities[activity].projects
        // Cache entries written before the btime field existed lack the key
        // entirely (vs. null = fetched but absent) — refresh those once.
        let needsBackfill = projs && Object.values(projs).some((p) => p.btime === undefined)
        if (projs && !needsBackfill && !force) {
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
                        name: design.description || design.name || design.title || `Project ${id}`,
                        author: String(design.user_id || design.userId || ""),
                        tags: design.asm_tags || null,
                        printDescription: design.asm_description || null,
                        thumb: (design.thumbnail_json && (
                            (design.thumbnail_json.detailThumb && design.thumbnail_json.detailThumb.url) ||
                            (design.thumbnail_json.filmstrip && design.thumbnail_json.filmstrip.url))) || null,
                        mtime: design.mtime || null,
                        btime: design.btime || null
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

if (typeof window !== 'undefined') {
    window.download = download;
    window.sasGeneralClasses = sasGeneralClasses;
    window.sasClassActivitiesOf = sasClassActivitiesOf;
    window.projectIDRegex = projectIDRegex;
    window.sasGetProjectsOfActivity = sasGetProjectsOfActivity;
    window.sasGetAllProjectsOfActivitiesOfClazz = sasGetAllProjectsOfActivitiesOfClazz;
    window.sasStudentsAndClassCodeOf = sasStudentsAndClassCodeOf;
    window.sasAllDataForClass = sasAllDataForClass;
    window.sasAllDataForClassActivity = sasAllDataForClassActivity;
    window.getCurrentUser = getCurrentUser;
    window.usasAllData = usasAllData;
    window.updateStorage = updateStorage;
    window.resolveDownloadTarget = resolveDownloadTarget;
}
