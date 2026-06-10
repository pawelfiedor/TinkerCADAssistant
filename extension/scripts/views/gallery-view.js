let galleryViewEnable = (projects = null) => {
    let prevPage = window.currentPage
    return enableView("gallery", (container) => {
        window.currentPage = Context.GALLERY
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
        img.onerror = () => {
            let p = list[i]
            if (p) {
                refreshThumbnail(p.id, p.clazzId, img, () => {
                    img.style.display = "none"
                    empty.style.display = "block"
                    empty.innerText = "No thumbnail — use the 3D button"
                })
            } else {
                img.style.display = "none"
                empty.style.display = "block"
                empty.innerText = "No thumbnail — use the 3D button"
            }
        }
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
                if (active && mode === "3d" && window.currentPage === Context.GALLERY && doc) {
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
                if (paused || !active || window.currentPage !== Context.GALLERY) return
                let ms = ((data && data.speed != null) ? 6 - Number(data.speed) : 3) * 10000
                void progressFill.offsetWidth // force reflow so the animation restarts
                progressFill.style.transition = `width ${ms}ms linear`
                progressFill.style.width = "100%"
                timer = setTimeout(() => {
                    if (paused || !active || window.currentPage !== Context.GALLERY) return
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
            window.currentPage = prevPage
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
    mtime: project.mtime || null,
    student: (((clazz && clazz.students) || {})[project.author] || {}).name || project.author || null,
    className: (clazz && clazz.name) || null,
    clazzId: (clazz && clazz.id) || null
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

if (typeof window !== 'undefined') {
    window.galleryViewEnable = galleryViewEnable;
    window.toGalleryItem = toGalleryItem;
    window.getGalleryProjects = getGalleryProjects;
}
