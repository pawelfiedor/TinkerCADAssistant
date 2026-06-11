let teacherViewEnable = () => enableView("teacher", (container) => {
    window.currentPage = Context.TEACHER
    let active = true

    getCurrentActivityAndClassID((clazzID, activityID) => {
        // Adopt the scoped design system; clear enableView's inline #fff so
        // the stylesheet canvas color applies.
        container.classList.add("tca-view", "tca-teacher")
        container.style.background = ""
        let el = tcaEl

        // ── Layout: top bar + thumbnail grid ────────────────────────
        let topbar = el("div", "tca-topbar")
        let backBtn = el("button", "tca-btn tca-btn--ghost")
        backBtn.type = "button"
        backBtn.appendChild(tcaIcon(TCA_ICONS.back))
        backBtn.appendChild(document.createTextNode("Back"))
        let labels = el("div", "tca-labels")
        let heading = el("div", "tca-slide-title")
        let subheading = el("div", "tca-slide-sub")
        labels.append(heading, subheading)
        let count = el("span", "tca-pill", "Loading…")

        let autoSwitch = el("button", "tca-switch")
        autoSwitch.type = "button"
        autoSwitch.setAttribute("aria-pressed", "false")
        autoSwitch.title = "Cycle through projects automatically (Space)"
        autoSwitch.appendChild(el("span", null, "Auto-play"))
        autoSwitch.appendChild(el("span", "tca-switch-track"))

        let reloadBtn = el("button", "tca-btn", "Reload")
        reloadBtn.type = "button"
        reloadBtn.title = "Fetch the latest projects"

        let seg = el("div", "tca-seg")
        let SIZES = [180, 260, 360] // card widths in px; first = current minimum
        let sizeIdx = 0
        let setSize = (idx) => {
            sizeIdx = idx
            sizeBtns.forEach((b, k) => b.classList.toggle("is-active", k === idx))
            renderGrid()
        }
        let sizeBtns = [["S", "Small cards"], ["M", "Medium cards"], ["L", "Large cards"]].map(([t, tip], idx) => {
            let b = el("button", "tca-seg-btn", t)
            b.type = "button"
            b.title = tip
            b.onclick = () => setSize(idx)
            seg.appendChild(b)
            return b
        })
        sizeBtns[0].classList.add("is-active")

        topbar.append(backBtn, el("span", "tca-vsep"), labels, count, el("span", "tca-spacer"), autoSwitch, reloadBtn, seg)

        let grid = el("div", "tca-grid tca-scroll")
        container.append(topbar, grid)

        let renderMessage = (titleText, hint) => {
            grid.innerHTML = ""
            cardEls = []
            cardChips = []
            let box = el("div", "tca-empty")
            box.appendChild(tcaIcon(TCA_ICONS.cube))
            box.appendChild(el("h3", null, titleText))
            if (hint) box.appendChild(el("p", null, hint))
            grid.appendChild(box)
        }

        // ── Enlarge overlay (lightbox) ──────────────────────────────
        let overlay = el("div", "tca-ov")
        let ovTitle = el("div", "tca-ov-title")
        let ovImg = document.createElement("img")
        let ovFrame = document.createElement("iframe")
        ovFrame.style.display = "none"
        // Workflow status of the enlarged project — chips toggle + PATCH.
        let ovStatus = tcaStatusChips({
            onToggle: (st, ctl) => {
                let it = items[sel]
                if (!it) return
                ctl.setBusy(st.tag, true)
                let done = () => {
                    ctl.setBusy(st.tag, false)
                    let cur = items[sel]
                    if (cur) ctl.set(cur.tags)
                    refreshCardStatuses()
                }
                tcaToggleStatusTag(it, st.tag, done, done)
            }
        })
        let ovBar = el("div", "tca-ov-bar")
        overlay.append(ovTitle, ovImg, ovFrame, ovStatus.el, ovBar)
        container.appendChild(overlay)

        // ── State ───────────────────────────────────────────────────
        let items = []        // {id, name, student, thumb, author}
        let cardEls = []
        let cardChips = []    // status chip controls, parallel to cardEls
        let sel = -1
        let ovOpen = false
        let ovMode = "image"  // "image" | "3d"
        let autoId = 0
        let autoOn = false
        let className = ""
        let activityName = ""
        let codeAdded = false

        let buildItems = (clazz) => {
            let act = ((clazz && clazz.activities) || {})[activityID] || {}
            return Object.values(act.projects || {}).map((p) => ({
                id: p.id,
                name: p.name,
                author: p.author,
                thumb: p.thumb || null,
                tags: p.tags || "",
                printDescription: p.printDescription || "",
                clazzId: clazzID,
                student: (((clazz && clazz.students) || {})[p.author] || {}).name || p.author
            }))
        }

        let highlight = () => {
            cardEls.forEach((c, idx) => {
                c.classList.toggle("is-selected", idx === sel)
            })
        }

        let refreshCardStatuses = () => {
            cardChips.forEach((ctl, idx) => {
                if (items[idx]) ctl.set(items[idx].tags)
            })
        }

        let renderGrid = () => {
            if (!items.length) {
                renderMessage("No projects yet", "Student projects appear here as they sync.")
                return
            }
            grid.innerHTML = ""
            cardEls = []
            cardChips = []
            let row = el("div", "tca-row")
            items.forEach((it, idx) => {
                let card = el("div", "tca-card")
                card.style.width = `${SIZES[sizeIdx]}px`
                card.title = `${it.student} — ${it.name || ""}`
                let thumbWrap = el("div", "tca-thumb")
                if (it.thumb) {
                    let im = document.createElement("img")
                    im.src = it.thumb
                    im.alt = ""
                    im.onerror = () => {
                        refreshThumbnail(it.id, clazzID, im, () => {
                            im.remove()
                            thumbWrap.appendChild(tcaIcon(TCA_ICONS.cube))
                        })
                    }
                    thumbWrap.appendChild(im)
                } else {
                    thumbWrap.appendChild(tcaIcon(TCA_ICONS.cube))
                }
                let chipsCtl = tcaLiveStatusChips(it, {compact: true})
                cardChips.push(chipsCtl)
                let body = el("div", "tca-card-body")
                body.append(
                    el("div", "tca-card-student", it.student),
                    el("div", "tca-card-project", it.name || "(untitled)"),
                    chipsCtl.el
                )
                card.append(thumbWrap, body)
                card.onclick = () => openOverlay(idx)
                row.appendChild(card)
                cardEls.push(card)
            })
            grid.appendChild(row)
            highlight()
        }

        let renderOverlay = () => {
            if (sel < 0 || sel >= items.length) return
            let it = items[sel]
            ovTitle.textContent = `${it.student} — ${it.name || ""}`
            ovTitle.style.direction = contains_heb(it.name || "") ? "rtl" : "ltr"
            ovStatus.set(it.tags)
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
            overlay.classList.add("is-open")
            highlight()
            renderOverlay()
        }
        let closeOverlay = () => {
            ovOpen = false
            ovFrame.src = "about:blank"
            overlay.classList.remove("is-open")
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
        let ovBtn = (label, onClick, tip) => {
            let b = el("button", "tca-fab-btn", label)
            b.type = "button"
            if (tip) b.title = tip
            b.onclick = onClick
            return b
        }
        let ovIconBtn = (svg, tip, onClick) => {
            let b = el("button", "tca-fab-btn tca-fab-clear")
            b.type = "button"
            b.title = tip
            b.setAttribute("aria-label", tip)
            b.appendChild(tcaIcon(svg))
            b.onclick = onClick
            return b
        }
        let ovSep = () => el("span", "tca-fab-sep")
        let modeBtn = ovBtn("3D", () => {
            ovMode = ovMode === "3d" ? "image" : "3d"
            modeBtn.textContent = ovMode === "3d" ? "Image" : "3D"
            renderOverlay()
        }, "Toggle between the thumbnail and the live 3D model")
        ovBar.append(
            ovIconBtn(TCA_ICONS.chevronLeft, "Previous", () => move(-1)),
            modeBtn,
            ovSep(),
            ovBtn("STL", () => {
                let it = items[sel]
                if (!it) return
                download({id: it.id, downloadName: downloadFileBase(it.student, it.name)}, downloadFolder(className || "TinkerCAD"), "stl")
            }, "Download this design as STL"),
            ovBtn("PNG", () => {
                let it = items[sel]
                if (!it) return
                if (!it.thumb) {
                    alert("No thumbnail for this project")
                    return
                }
                downloadBatch([{url: it.thumb, filename: `${downloadFolder(className || "TinkerCAD")}/${downloadFileBase(it.student, it.name)}.png`}])
            }, "Download the thumbnail as PNG"),
            ovBtn("Open in 3D ↗", () => {
                let it = items[sel]
                if (it) openTab(`https://www.tinkercad.com/things/${it.id}/edit`)
            }, "Open the design in a new editor tab"),
            ovSep(),
            ovIconBtn(TCA_ICONS.chevronRight, "Next", () => move(1)),
            ovIconBtn(TCA_ICONS.x, "Close (Esc)", () => closeOverlay())
        )

        // ── Auto-play (cycles the enlarged overlay) ─────────────────
        let autoLoop = (id) => {
            chrome.storage.local.get(["speed"], (data) => {
                let speed = (data && data.speed != null) ? 6 - Number(data.speed) : 3
                setTimeout(() => {
                    if (!active || window.currentPage !== Context.TEACHER || autoId !== id) return
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
            autoSwitch.classList.toggle("is-on", autoOn)
            autoSwitch.setAttribute("aria-pressed", String(autoOn))
            autoId++
            if (autoOn) autoLoop(autoId)
        }
        autoSwitch.onclick = () => toggleAuto()

        // ── Keyboard: ←/→ navigate, Space toggles Auto, Esc closes ──
        let onKey = (e) => {
            if (!active || window.currentPage !== Context.TEACHER) return
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

        backBtn.onclick = () => {
            active = false
            autoId++
            document.removeEventListener("keydown", onKey)
            window.currentPage = Context.ACTIVITY
            disableView("teacher")
        }
        reloadBtn.onclick = () => load()

        renderMessage("Loading projects…")

        // ── Data load (full) + light periodic refresh ──────────────
        let rebuild = (done = () => {
        }) => {
            get(clazzID, (clazz) => {
                clazz = clazz || {}
                className = clazz.name || ""
                activityName = (((clazz.activities || {})[activityID]) || {}).name || ""
                heading.textContent = activityName || activityID
                subheading.textContent = className
                if (!codeAdded && clazz.code) {
                    codeAdded = true
                    let codeBtn = el("button", "tca-btn", String(clazz.code))
                    codeBtn.type = "button"
                    codeBtn.title = "Copy the class join code"
                    codeBtn.onclick = () => copyTextToClipboard(String(clazz.code).replaceAll("-", ""))
                    topbar.insertBefore(codeBtn, autoSwitch)
                }
                let prevId = (sel >= 0 && sel < items.length) ? items[sel].id : null
                items = buildItems(clazz)
                count.textContent = `${items.length} project${items.length === 1 ? "" : "s"}`
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
                if (!active || window.currentPage !== Context.TEACHER) return
                refresh()
                pollLoop()
            }, 30000)
        }

        load()
        pollLoop()
    })
}, () => {
})

if (typeof window !== 'undefined') {
    window.teacherViewEnable = teacherViewEnable;
}
