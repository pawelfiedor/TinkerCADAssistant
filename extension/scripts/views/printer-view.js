let printerViewEnable = () => {
    let prevPage = window.currentPage
    return enableView("printer", (container) => {
        window.currentPage = Context.PRINTER
        let allItems = []          // {id, name, student, className, thumb}
        let selected = new Set()   // selected design ids
        let cardById = new Map()   // id -> card element
        let SIZES = [180, 260, 360]
        let sizeIdx = 0
        let groupByClass = true

        // ── Header ──────────────────────────────────────────────────
        let header = document.createElement("div")
        Object.assign(header.style, {
            display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto",
            padding: "8px 12px", boxSizing: "border-box", flexWrap: "wrap",
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        let titleEl = document.createElement("strong")
        titleEl.textContent = "Print Manager"
        titleEl.style.fontSize = "16px"
        let filterInput = document.createElement("input")
        filterInput.type = "search"
        filterInput.placeholder = "Filter by student / class…"
        Object.assign(filterInput.style, {padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", minWidth: "180px"})
        let nameFilterInput = document.createElement("input")
        nameFilterInput.type = "search"
        nameFilterInput.placeholder = "Filter by project name…"
        Object.assign(nameFilterInput.style, {padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", minWidth: "180px"})
        let dateSelect = document.createElement("select")
        Object.assign(dateSelect.style, {padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px"})
        ;[
            ["all", "Any date"],
            ["thisWeek", "Modified: this week"],
            ["lastWeek", "Modified: last week"],
            ["thisMonth", "Modified: this month"],
            ["lastMonth", "Modified: last month"],
            ["older", "Modified: older"]
        ].forEach(([v, t]) => {
            let o = document.createElement("option")
            o.value = v
            o.textContent = t
            dateSelect.appendChild(o)
        })
        dateSelect.value = "thisWeek"
        let selCount = document.createElement("span")
        Object.assign(selCount.style, {fontSize: "13px", color: "#666", marginLeft: "auto"})

        // ── Status line + grid ──────────────────────────────────────
        let status = document.createElement("div")
        Object.assign(status.style, {padding: "8px 12px", color: "#666", fontSize: "13px", flex: "0 0 auto"})
        let grid = document.createElement("div")
        Object.assign(grid.style, {
            display: "flex", flexWrap: "wrap", gap: "12px", padding: "12px",
            flex: "1", minHeight: "0", overflowY: "auto", alignContent: "flex-start", boxSizing: "border-box"
        })
        container.appendChild(header)
        container.appendChild(status)
        container.appendChild(grid)

        let updateSelCount = () => {
            selCount.textContent = `${selected.size} selected`
        }
        let visibleItems = () => {
            let ft = filterInput.value.trim().toLowerCase()
            let nft = nameFilterInput.value.trim().toLowerCase()
            let range = dateSelect.value
            return allItems.filter((it) => {
                if (!inDateRange(toMillis(it.mtime), range)) return false
                if (ft && !`${it.student} ${it.className} ${it.name}`.toLowerCase().includes(ft)) return false
                if (nft && !`${it.name}`.toLowerCase().includes(nft)) return false
                return true
            })
        }
        let applySelStyle = (card, isSel) => {
            card.style.border = isSel ? "3px solid #16a34a" : "2px solid transparent"
        }
        let toggle = (id, card) => {
            if (selected.has(id)) selected.delete(id)
            else selected.add(id)
            applySelStyle(card, selected.has(id))
            updateSelCount()
        }
        let setSelection = (items, on) => {
            items.forEach((it) => {
                if (on) selected.add(it.id)
                else selected.delete(it.id)
                let c = cardById.get(it.id)
                if (c) applySelStyle(c, on)
            })
            updateSelCount()
        }
        let makeCard = (it) => {
            let cardW = SIZES[sizeIdx]
            let card = document.createElement("div")
            Object.assign(card.style, {
                width: `${cardW}px`, cursor: "pointer", borderRadius: "8px",
                overflow: "hidden", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
            })
            applySelStyle(card, selected.has(it.id))
            let thumbWrap = document.createElement("div")
            Object.assign(thumbWrap.style, {
                width: "100%", height: `${Math.round(cardW * 0.75)}px`, background: "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: "32px"
            })
            if (it.thumb) {
                let im = document.createElement("img")
                Object.assign(im.style, {width: "100%", height: "100%", objectFit: "cover"})
                im.src = it.thumb
                im.alt = ""
                im.onerror = () => {
                    refreshThumbnail(it.id, it.clazzId, im, () => {
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
            lbl.textContent = it.student || "(unknown)"
            let projEl = document.createElement("div")
            Object.assign(projEl.style, {padding: "2px 8px 0", fontSize: "12px", color: "#1e293b", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
            projEl.textContent = it.name || "(untitled)"
            let sub = document.createElement("div")
            Object.assign(sub.style, {padding: "0 8px 6px", fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"})
            sub.textContent = it.className || ""
            lbl.title = `${it.student || "?"} — ${it.name || ""}`
            card.appendChild(thumbWrap)
            card.appendChild(lbl)
            card.appendChild(projEl)
            card.appendChild(sub)
            card.onclick = () => toggle(it.id, card)
            return card
        }
        let wrapRow = () => {
            let r = document.createElement("div")
            Object.assign(r.style, {display: "flex", flexWrap: "wrap", gap: "12px", alignContent: "flex-start"})
            return r
        }
        let groupHeaderBtn = (text, onClick) => {
            let b = document.createElement("button")
            b.textContent = text
            b.onclick = onClick
            Object.assign(b.style, {padding: "2px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", color: "#1477d1"})
            return b
        }
        let renderGrid = () => {
            grid.innerHTML = ""
            cardById.clear()
            if (!allItems.length) {
                status.textContent = "No projects found."
                return
            }
            let items = visibleItems()
            status.textContent = `${items.length} of ${allItems.length} shown`
            if (!items.length) {
                let none = document.createElement("div")
                none.style.color = "#94a3b8"
                none.textContent = "No projects match the current filters."
                grid.appendChild(none)
                return
            }
            if (groupByClass) {
                let groups = new Map() // key -> {label, items}
                items.forEach((it) => {
                    let key = it.clazzId || it.className || "?"
                    if (!groups.has(key)) groups.set(key, {label: it.className || "(unknown class)", items: []})
                    groups.get(key).items.push(it)
                })
                groups.forEach((g) => {
                    let section = document.createElement("div")
                    let head = document.createElement("div")
                    Object.assign(head.style, {display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px"})
                    let h = document.createElement("strong")
                    h.textContent = `${g.label} (${g.items.length})`
                    h.style.fontSize = "14px"
                    head.appendChild(h)
                    head.appendChild(groupHeaderBtn("Select group", () => setSelection(g.items, true)))
                    head.appendChild(groupHeaderBtn("Deselect", () => setSelection(g.items, false)))
                    let row = wrapRow()
                    g.items.forEach((it) => {
                        let c = makeCard(it)
                        row.appendChild(c)
                        cardById.set(it.id, c)
                    })
                    section.appendChild(head)
                    section.appendChild(row)
                    grid.appendChild(section)
                })
            } else {
                let row = wrapRow()
                items.forEach((it) => {
                    let c = makeCard(it)
                    row.appendChild(c)
                    cardById.set(it.id, c)
                })
                grid.appendChild(row)
            }
        }
        let clearAll = () => {
            selected.clear()
            updateSelCount()
            renderGrid()
        }
        let bulk = (format) => {
            let chosen = allItems.filter((it) => selected.has(it.id))
            if (!chosen.length) {
                alert("No projects selected")
                return
            }
            let jobs = chosen.map((it) => ({
                url: designDownloadUrl(it.id, format),
                filename: `${downloadFolder(it.className || "TinkerCAD")}/${downloadFileBase(it.student, it.name)}.${downloadExt(format)}`
            }))
            downloadBatch(jobs)
        }

        let formatDate = (mtime) => {
            if (!mtime) return "N/A"
            try {
                let ms = toMillis(mtime)
                return new Date(ms).toLocaleDateString("pl-PL")
            } catch (e) {
                return "N/A"
            }
        }

        let printReport = () => {
            let chosen = allItems.filter((it) => selected.has(it.id))
            if (!chosen.length) {
                alert("No selected projects to print")
                return
            }
            let win = window.open("", "_blank")
            if (!win) {
                alert("Please allow popups to generate the report.")
                return
            }

            // Group projects by class name
            let groups = new Map()
            chosen.forEach((it) => {
                let key = it.className || "(unknown class)"
                if (!groups.has(key)) {
                    groups.set(key, [])
                }
                groups.get(key).push(it)
            })

            let sectionsHtml = ""
            groups.forEach((items, className) => {
                let cardsHtml = items.map((it) => {
                    let dateStr = formatDate(it.mtime)
                    let imgHtml = ""
                    if (it.thumb) {
                        imgHtml = `<img src="${it.thumb}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">`
                    }
                    return `
                    <div class="card">
                        <div class="thumb-wrap">
                            ${imgHtml}
                            <span style="display: ${it.thumb ? 'none' : 'block'};">🧊</span>
                        </div>
                        <div class="info">
                            <div>
                                <h2 class="student">${escapeHtml(it.student || '(unknown)')}</h2>
                                <div class="details"><strong>Project:</strong> ${escapeHtml(it.name || '(untitled)')}</div>
                            </div>
                            <div>
                                <div class="date">Modified: ${dateStr}</div>
                                <div class="checklist">
                                    <span><span class="chk-box"></span>Printed</span>
                                    <span><span class="chk-box"></span>Verified</span>
                                    <span style="display: flex; flex-grow: 1; align-items: center;">Notes:<span class="notes-line"></span></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    `
                }).join("")

                sectionsHtml += `
                <div class="class-section">
                    <h2 class="class-header">${escapeHtml(className)} (${items.length})</h2>
                    <div class="grid">
                        ${cardsHtml}
                    </div>
                </div>
                `
            })

            let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>TinkerCAD Print Verification Report</title>
    <style>
        body {
            font-family: 'Open Sans', Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            background: #fff;
        }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #cbd5e1;
            padding-bottom: 12px;
            margin-bottom: 24px;
        }
        h1 {
            font-size: 24px;
            margin: 0;
            color: #0f172a;
        }
        .meta {
            font-size: 13px;
            color: #64748b;
            text-align: right;
        }
        .class-section {
            margin-bottom: 32px;
            page-break-inside: auto;
            break-inside: auto;
        }
        .class-header {
            font-size: 16px;
            font-weight: 700;
            color: #4076c7;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 6px;
            margin: 0 0 12px 0;
            page-break-after: avoid;
            break-after: avoid;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }
        .card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            gap: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
            background: #fff;
        }
        .thumb-wrap {
            width: 120px;
            height: 90px;
            background: #f1f5f9;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            overflow: hidden;
            flex-shrink: 0;
            border: 1px solid #e2e8f0;
        }
        .thumb-wrap img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .info {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            flex-grow: 1;
            min-width: 0;
        }
        .student {
            font-weight: 700;
            font-size: 15px;
            margin: 0 0 4px 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .details {
            font-size: 12px;
            color: #475569;
            margin: 0 0 4px 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .date {
            font-size: 11px;
            color: #94a3b8;
            margin-bottom: 8px;
        }
        .checklist {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 11px;
            font-weight: 600;
            color: #475569;
            border-top: 1px dashed #e2e8f0;
            padding-top: 6px;
        }
        .chk-box {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 1px solid #64748b;
            border-radius: 2px;
            margin-right: 4px;
            vertical-align: middle;
        }
        .notes-line {
            flex-grow: 1;
            border-bottom: 1px dotted #94a3b8;
            height: 12px;
            margin-left: 4px;
        }
        @media print {
            body {
                padding: 0;
            }
            header {
                margin-bottom: 16px;
            }
            .card {
                border: 1px solid #cbd5e1;
            }
            .card {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .class-section {
                page-break-after: always;
                break-after: page;
            }
            .class-section:last-of-type {
                page-break-after: avoid;
                break-after: avoid;
            }
        }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>TinkerCAD Print Verification Report</h1>
            <div style="font-size: 13px; color: #475569; margin-top: 4px;">Selected Groups: ${groups.size} · Total Projects: ${chosen.length}</div>
        </div>
        <div class="meta">
            <div>Date: ${new Date().toLocaleDateString("pl-PL")}</div>
            <div>Generated by TinkerCAD Assistant</div>
        </div>
    </header>
    
    ${sectionsHtml}

</body>
</html>
            `
            win.document.write(html)
            win.document.close()

            let triggerPrint = () => {
                setTimeout(() => {
                    win.print()
                }, 600)
            }
            if (win.document.readyState === "complete") {
                triggerPrint()
            } else {
                win.addEventListener('load', triggerPrint)
            }
        }

        let printReportPerStudent = () => {
            let chosen = allItems.filter((it) => selected.has(it.id))
            if (!chosen.length) {
                alert("No selected projects to print")
                return
            }
            let win = window.open("", "_blank")
            if (!win) {
                alert("Please allow popups to generate the report.")
                return
            }

            // Group projects by student (student Name + class Name)
            let studentGroups = new Map()
            chosen.forEach((it) => {
                let key = `${it.student || "(unknown)"} · ${it.className || "(unknown class)"}`
                if (!studentGroups.has(key)) {
                    studentGroups.set(key, {student: it.student, className: it.className, items: []})
                }
                studentGroups.get(key).items.push(it)
            })

            let sectionsHtml = ""
            studentGroups.forEach((groupData, key) => {
                let cardsHtml = groupData.items.map((it) => {
                    let imgHtml = ""
                    if (it.thumb) {
                        imgHtml = `<img src="${it.thumb}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">`
                    }
                    return `
                    <div class="card">
                        <div class="thumb-wrap">
                            ${imgHtml}
                            <span style="display: ${it.thumb ? 'none' : 'block'};">🧊</span>
                        </div>
                        <div class="info">
                            <h2 class="project-name">${escapeHtml(it.name || '(untitled)')}</h2>
                        </div>
                    </div>
                    `
                }).join("")

                sectionsHtml += `
                <div class="student-section student-page-break">
                    <h2 class="class-header">${escapeHtml(groupData.student || '(unknown)')} (${escapeHtml(groupData.className || '(unknown class)')})</h2>
                    <div class="grid">
                        ${cardsHtml}
                    </div>
                </div>
                `
            })

            let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>TinkerCAD Student Projects Report</title>
    <style>
        body {
            font-family: 'Open Sans', Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            background: #fff;
        }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #cbd5e1;
            padding-bottom: 12px;
            margin-bottom: 24px;
        }
        h1 {
            font-size: 24px;
            margin: 0;
            color: #0f172a;
        }
        .meta {
            font-size: 13px;
            color: #64748b;
            text-align: right;
        }
        .student-section {
            margin-bottom: 32px;
            page-break-inside: auto;
            break-inside: auto;
        }
        .class-header {
            font-size: 16px;
            font-weight: 700;
            color: #4076c7;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 6px;
            margin: 0 0 12px 0;
            page-break-after: avoid;
            break-after: avoid;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
        }
        .card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            page-break-inside: avoid;
            break-inside: avoid;
            background: #fff;
        }
        .thumb-wrap {
            width: 100%;
            height: auto;
            aspect-ratio: 4 / 3;
            background: #f1f5f9;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            overflow: hidden;
            flex-shrink: 0;
            border: 1px solid #e2e8f0;
        }
        .thumb-wrap img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .info {
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
        }
        .project-name {
            font-weight: 700;
            font-size: 13px;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #0f172a;
            text-align: center;
        }
        @media print {
            body {
                padding: 0;
            }
            header {
                margin-bottom: 16px;
            }
            .card {
                border: 1px solid #cbd5e1;
            }
            .card {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .student-page-break {
                page-break-after: always;
                break-after: page;
            }
            .student-page-break:last-of-type {
                page-break-after: avoid;
                break-after: avoid;
            }
        }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>TinkerCAD Student Projects Report</h1>
            <div style="font-size: 13px; color: #475569; margin-top: 4px;">Total Students: ${studentGroups.size} · Total Projects: ${chosen.length}</div>
        </div>
        <div class="meta">
            <div>Date: ${new Date().toLocaleDateString("pl-PL")}</div>
            <div>Generated by TinkerCAD Assistant</div>
        </div>
    </header>
    
    ${sectionsHtml}

</body>
</html>
            `
            win.document.write(html)
            win.document.close()

            let triggerPrint = () => {
                setTimeout(() => {
                    win.print()
                }, 600)
            }
            if (win.document.readyState === "complete") {
                triggerPrint()
            } else {
                win.addEventListener('load', triggerPrint)
            }
        }

        // ── Header controls ─────────────────────────────────────────
        header.appendChild(bigButton("Back", () => {
            window.currentPage = prevPage
            disableView("printer")
        }))
        header.appendChild(titleEl)
        header.appendChild(filterInput)
        header.appendChild(nameFilterInput)
        header.appendChild(dateSelect)
        let groupBtn = bigButton("Group: on", () => {
            groupByClass = !groupByClass
            groupBtn.textContent = groupByClass ? "Group: on" : "Group: off"
            renderGrid()
        })
        header.appendChild(groupBtn)
        header.appendChild(bigButton("Select shown", () => setSelection(visibleItems(), true)))
        header.appendChild(bigButton("Clear", () => {
            clearAll()
        }))
        header.appendChild(bigButton("Download STL", () => bulk("stl")))
        header.appendChild(bigButton("Download OBJ", () => bulk("obj")))
        header.appendChild(bigButton("Print Report", () => printReport()))
        header.appendChild(bigButton("Print per Student", () => printReportPerStudent()))
        let sizeBtns = []
        let setSize = (idx) => {
            sizeIdx = idx
            sizeBtns.forEach((b, k) => {
                b.style.backgroundColor = k === idx ? "#4076c7" : "#fff"
                b.style.color = k === idx ? "#fff" : "#4076c7"
            })
            renderGrid()
        }
        ;["S", "M", "L"].forEach((t, idx) => {
            let b = bigButton(t, () => setSize(idx))
            sizeBtns.push(b)
            header.appendChild(b)
        })
        sizeBtns[0].style.backgroundColor = "#4076c7"
        sizeBtns[0].style.color = "#fff"
        header.appendChild(selCount)
        filterInput.addEventListener("input", () => renderGrid())
        nameFilterInput.addEventListener("input", () => renderGrid())
        dateSelect.addEventListener("change", () => renderGrid())
        updateSelCount()

        // ── Load all classes, then render ───────────────────────────
        status.textContent = "Loading projects…"
        updateStorage(() => getGalleryProjects((items) => {
            allItems = items || []
            renderGrid()
        }))
    }, () => {
    })
}

if (typeof window !== 'undefined') {
    window.printerViewEnable = printerViewEnable;
}
