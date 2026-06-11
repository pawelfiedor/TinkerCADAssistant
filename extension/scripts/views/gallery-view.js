let galleryViewEnable = (projects = null) => {
    let prevPage = window.currentPage
    return enableView("gallery", (container) => {
        window.currentPage = Context.GALLERY
        // Adopt the scoped design system; clear enableView's inline #fff so
        // the stylesheet canvas color applies.
        container.classList.add("tca-view", "tca-gallery")
        container.style.background = ""

        let active = true
        let paused = false
        let mode = "image" // "image" | "3d"
        let list = []
        let i = 0
        let el = tcaEl

        // ── Top bar: back, slide labels, counter + transport ────────
        let topbar = el("div", "tca-topbar")
        let backBtn = el("button", "tca-btn tca-btn--ghost")
        backBtn.type = "button"
        backBtn.appendChild(tcaIcon(TCA_ICONS.back))
        backBtn.appendChild(document.createTextNode("Back"))
        backBtn.onclick = () => {
            active = false
            if (timer) clearTimeout(timer)
            window.currentPage = prevPage
            disableView("gallery")
        }
        let labels = el("div", "tca-labels")
        let title = el("div", "tca-slide-title")
        let subtitle = el("div", "tca-slide-sub")
        labels.append(title, subtitle)
        let counter = el("span", "tca-pill", "–")
        // Workflow status of the current slide — click a chip to toggle it.
        let statusCtl = tcaStatusChips({
            onToggle: (st, ctl) => {
                let p = list[i]
                if (!p) return
                ctl.setBusy(st.tag, true)
                let done = () => {
                    ctl.setBusy(st.tag, false)
                    let cur = list[i]
                    if (cur) ctl.set(cur.tags)
                }
                tcaToggleStatusTag(p, st.tag, done, done)
            }
        })

        let iconBtn = (svg, tip, onClick) => {
            let b = el("button", "tca-btn tca-btn--icon")
            b.type = "button"
            b.title = tip
            b.setAttribute("aria-label", tip)
            b.appendChild(tcaIcon(svg))
            b.onclick = onClick
            return b
        }
        let prevBtn = iconBtn(TCA_ICONS.chevronLeft, "Previous", () => goTo(i - 1, true))
        let pauseBtn = iconBtn(TCA_ICONS.pause, "Pause", () => {
            paused = !paused
            updatePauseUI()
            if (paused) freezeProgress()
            else scheduleNext()
        })
        let nextBtn = iconBtn(TCA_ICONS.chevronRight, "Next", () => goTo(i + 1, true))
        let transport = el("div", "tca-transport")
        transport.append(prevBtn, pauseBtn, nextBtn)

        let seg = el("div", "tca-seg")
        let setMode = (m) => {
            if (mode === m) return
            mode = m
            modeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.mode === m))
            stage.classList.toggle("is-3d", m === "3d")
            render()
        }
        let modeBtns = [["image", "Image"], ["3d", "3D"]].map(([m, label]) => {
            let b = el("button", "tca-seg-btn", label)
            b.type = "button"
            b.dataset.mode = m
            b.onclick = () => setMode(m)
            seg.appendChild(b)
            return b
        })
        modeBtns[0].classList.add("is-active")

        topbar.append(backBtn, el("span", "tca-vsep"), labels, statusCtl.el, counter, transport, el("span", "tca-vsep"), seg)

        // ── Progress line (counts down to the next slide) ───────────
        let progress = el("div", "tca-progress")
        let progressFill = el("div", "tca-progress-fill")
        progress.appendChild(progressFill)

        // ── Display stage (flex:1 — no page scrollbars) ─────────────
        let stage = el("div", "tca-stage")
        let img = document.createElement("img")
        img.style.display = "none"
        let frame = document.createElement("iframe")
        frame.style.display = "none"
        let empty = el("div", "tca-empty")
        let emptyTitle = el("h3")
        let emptyHint = el("p")
        empty.append(tcaIcon(TCA_ICONS.cube), emptyTitle, emptyHint)
        empty.style.display = "none"
        let showEmpty = (text, hint = "") => {
            emptyTitle.textContent = text
            emptyHint.textContent = hint
            emptyHint.style.display = hint ? "" : "none"
            empty.style.display = "flex"
        }
        let hideEmpty = () => {
            empty.style.display = "none"
        }
        img.onerror = () => {
            let p = list[i]
            if (p) {
                refreshThumbnail(p.id, p.clazzId, img, () => {
                    img.style.display = "none"
                    showEmpty("No thumbnail", "Switch to 3D to load the live model.")
                })
            } else {
                img.style.display = "none"
                showEmpty("No thumbnail", "Switch to 3D to load the live model.")
            }
        }
        stage.append(img, frame, empty)

        container.append(topbar, progress, stage)

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
                showEmpty("No projects to show")
                counter.textContent = "–"
                title.textContent = ""
                subtitle.textContent = ""
                statusCtl.el.style.display = "none"
                return
            }
            let p = list[i]
            title.textContent = p.name || "(untitled)"
            title.style.direction = contains_heb(p.name || "") ? "rtl" : "ltr"
            subtitle.textContent = [p.student, p.className].filter(Boolean).join(" · ")
            counter.textContent = `${i + 1} / ${list.length}`
            statusCtl.el.style.display = ""
            statusCtl.set(p.tags)
            if (mode === "3d") {
                img.style.display = "none"
                hideEmpty()
                frame.style.display = "block"
                set3dFrame(p)
            } else {
                frame.style.display = "none"
                frame.src = "about:blank" // unload the heavy editor
                if (p.thumb) {
                    hideEmpty()
                    img.style.display = "block"
                    img.src = p.thumb
                    img.alt = p.name || ""
                } else {
                    img.style.display = "none"
                    showEmpty("No thumbnail", "Switch to 3D to load the live model.")
                }
            }
        }

        let updatePauseUI = () => {
            pauseBtn.innerHTML = ""
            pauseBtn.appendChild(tcaIcon(paused ? TCA_ICONS.play : TCA_ICONS.pause))
            pauseBtn.title = paused ? "Play" : "Pause"
            pauseBtn.setAttribute("aria-label", pauseBtn.title)
            pauseBtn.classList.toggle("tca-btn--primary", paused)
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
            updatePauseUI()
            if (paused) freezeProgress()
            else scheduleNext()
        }

        let begin = (items) => {
            list = items || []
            i = 0
            render()
            scheduleNext()
        }
        updatePauseUI()
        if (projects) {
            begin(projects)
        } else {
            // Opened from the classes dashboard (no list): load the whole school
            // first, then collect every project. Show a loading state meanwhile.
            title.textContent = "Loading…"
            showEmpty("Loading projects…")
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
    tags: project.tags || "",
    printDescription: project.printDescription || "",
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
