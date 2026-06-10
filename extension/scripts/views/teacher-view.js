let teacherViewEnable = () => enableView("teacher", (container) => {
    window.currentPage = Context.TEACHER
    let active = true

    getCurrentActivityAndClassID((clazzID, activityID) => {
        // ── Layout: header + thumbnail grid ─────────────────────────
        let header = document.createElement("div")
        header.classList.add("btn-group")
        Object.assign(header.style, {
            display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto",
            padding: "6px 12px", boxSizing: "border-box", flexWrap: "wrap",
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let heading = document.createElement("div")
        Object.assign(heading.style, {fontSize: "15px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40vw"})
        let count = document.createElement("span")
        Object.assign(count.style, {fontSize: "13px", color: "#666", marginLeft: "auto"})
        let grid = document.createElement("div")
        Object.assign(grid.style, {
            display: "flex", flexWrap: "wrap", gap: "12px", padding: "12px",
            flex: "1", minHeight: "0", overflowY: "auto", alignContent: "flex-start", boxSizing: "border-box"
        })
        container.appendChild(header)
        container.appendChild(grid)

        // ── Enlarge overlay ─────────────────────────────────────────
        let overlay = document.createElement("div")
        Object.assign(overlay.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,0.88)", display: "none",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            zIndex: "2147483646", fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let ovTitle = document.createElement("div")
        Object.assign(ovTitle.style, {color: "#fff", fontSize: "18px", fontWeight: "700", margin: "8px 0"})
        let ovImg = document.createElement("img")
        Object.assign(ovImg.style, {maxWidth: "90vw", maxHeight: "74vh", objectFit: "contain", background: "#fff", borderRadius: "6px"})
        let ovFrame = document.createElement("iframe")
        Object.assign(ovFrame.style, {width: "90vw", height: "74vh", border: "none", display: "none", background: "#fff", borderRadius: "6px"})
        let ovBar = document.createElement("div")
        Object.assign(ovBar.style, {display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap", justifyContent: "center"})
        overlay.appendChild(ovTitle)
        overlay.appendChild(ovImg)
        overlay.appendChild(ovFrame)
        overlay.appendChild(ovBar)
        container.appendChild(overlay)

        // ── State ───────────────────────────────────────────────────
        let items = []        // {id, name, student, thumb, author}
        let cardEls = []
        let sel = -1
        let ovOpen = false
        let ovMode = "image"  // "image" | "3d"
        let autoId = 0
        let autoOn = false
        let className = ""
        let activityName = ""
        let codeAdded = false
        let SIZES = [180, 260, 360] // card widths in px; first = current minimum
        let sizeIdx = 0

        let buildItems = (clazz) => {
            let act = ((clazz && clazz.activities) || {})[activityID] || {}
            return Object.values(act.projects || {}).map((p) => ({
                id: p.id,
                name: p.name,
                author: p.author,
                thumb: p.thumb || null,
                student: (((clazz && clazz.students) || {})[p.author] || {}).name || p.author
            }))
        }

        let highlight = () => {
            cardEls.forEach((c, idx) => {
                c.style.border = idx === sel ? "2px solid #4076c7" : "2px solid transparent"
            })
        }

        let renderGrid = () => {
            grid.innerHTML = ""
            cardEls = []
            count.innerText = `${items.length} project${items.length === 1 ? "" : "s"}`
            items.forEach((it, idx) => {
                let cardW = SIZES[sizeIdx]
                let card = document.createElement("div")
                Object.assign(card.style, {
                    width: `${cardW}px`, cursor: "pointer", border: "2px solid transparent",
                    borderRadius: "8px", overflow: "hidden", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
                })
                let thumbWrap = document.createElement("div")
                Object.assign(thumbWrap.style, {
                    width: "100%", height: `${Math.round(cardW * 0.75)}px`, background: "#f1f5f9", display: "flex",
                    alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: "32px"
                })
                if (it.thumb) {
                    let im = document.createElement("img")
                    Object.assign(im.style, {width: "100%", height: "100%", objectFit: "cover"})
                    im.src = it.thumb
                    im.alt = ""
                    im.onerror = () => {
                        refreshThumbnail(it.id, clazzID, im, () => {
                            im.style.display = "none"
                            thumbWrap.textContent = "🧊"
                        })
                    }
                    thumbWrap.appendChild(im)
                } else {
                    thumbWrap.textContent = "🧊"
                }
                let lbl = document.createElement("div")
                Object.assign(lbl.style, {padding: "6px 8px 0", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
                lbl.textContent = it.student
                let projEl = document.createElement("div")
                Object.assign(projEl.style, {padding: "0 8px 6px", fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
                projEl.textContent = it.name || "(untitled)"
                lbl.title = `${it.student} — ${it.name || ""}`
                card.appendChild(thumbWrap)
                card.appendChild(lbl)
                card.appendChild(projEl)
                card.onclick = () => openOverlay(idx)
                grid.appendChild(card)
                cardEls.push(card)
            })
            highlight()
        }

        let renderOverlay = () => {
            if (sel < 0 || sel >= items.length) return
            let it = items[sel]
            ovTitle.textContent = `${it.student} — ${it.name || ""}`
            ovTitle.style.direction = contains_heb(it.name || "") ? "rtl" : "ltr"
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
            overlay.style.display = "flex"
            highlight()
            renderOverlay()
        }
        let closeOverlay = () => {
            ovOpen = false
            ovFrame.src = "about:blank"
            overlay.style.display = "none"
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
        let modeBtn = bigButton("3D", () => {
            ovMode = ovMode === "3d" ? "image" : "3d"
            modeBtn.textContent = ovMode === "3d" ? "Image" : "3D"
            renderOverlay()
        })
        ovBar.appendChild(bigButton("◀", () => move(-1)))
        ovBar.appendChild(modeBtn)
        ovBar.appendChild(bigButton("STL", () => {
            let it = items[sel]
            if (!it) return
            download({id: it.id, downloadName: downloadFileBase(it.student, it.name)}, downloadFolder(className || "TinkerCAD"), "stl")
        }))
        ovBar.appendChild(bigButton("PNG", () => {
            let it = items[sel]
            if (!it) return
            if (!it.thumb) {
                alert("No thumbnail for this project")
                return
            }
            downloadBatch([{url: it.thumb, filename: `${downloadFolder(className || "TinkerCAD")}/${downloadFileBase(it.student, it.name)}.png`}])
        }))
        ovBar.appendChild(bigButton("Open in 3D ↗", () => {
            let it = items[sel]
            if (it) openTab(`https://www.tinkercad.com/things/${it.id}/edit`)
        }))
        ovBar.appendChild(bigButton("▶", () => move(1)))
        ovBar.appendChild(bigButton("Close", () => closeOverlay()))

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
            autoBtn.style.backgroundColor = autoOn ? "#4076c7" : "#fff"
            autoBtn.style.color = autoOn ? "#fff" : "#4076c7"
            autoId++
            if (autoOn) autoLoop(autoId)
        }

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

        // ── Header buttons ──────────────────────────────────────────
        header.appendChild(bigButton("Back", () => {
            active = false
            autoId++
            document.removeEventListener("keydown", onKey)
            window.currentPage = Context.ACTIVITY
            disableView("teacher")
        }))
        header.appendChild(heading)
        let autoBtn = bigButton("Auto", () => toggleAuto())
        header.appendChild(autoBtn)
        header.appendChild(bigButton("Reload", () => load()))
        // Thumbnail size selector (S = current minimum, M, L)
        let sizeBtns = []
        let setSize = (idx) => {
            sizeIdx = idx
            sizeBtns.forEach((b, k) => {
                b.style.backgroundColor = k === idx ? "#4076c7" : "#fff"
                b.style.color = k === idx ? "#fff" : "#4076c7"
            })
            renderGrid()
        }
        ;["S", "M", "L"].forEach((labelTxt, idx) => {
            let b = bigButton(labelTxt, () => setSize(idx))
            sizeBtns.push(b)
            header.appendChild(b)
        })
        header.appendChild(count)
        setSize(0)

        // ── Data load (full) + light periodic refresh ──────────────
        let rebuild = (done = () => {
        }) => {
            get(clazzID, (clazz) => {
                clazz = clazz || {}
                className = clazz.name || ""
                activityName = (((clazz.activities || {})[activityID]) || {}).name || ""
                heading.textContent = [className, activityName].filter(Boolean).join(" · ") || activityID
                if (!codeAdded && clazz.code) {
                    codeAdded = true
                    let codeBtn = bigButton(String(clazz.code), () => copyTextToClipboard(String(clazz.code).replaceAll("-", "")))
                    header.insertBefore(codeBtn, autoBtn)
                }
                let prevId = (sel >= 0 && sel < items.length) ? items[sel].id : null
                items = buildItems(clazz)
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
