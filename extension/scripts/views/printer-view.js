let printerViewEnable = () => {
    let prevPage = window.currentPage
    return enableView("printer", (container) => {
        window.currentPage = Context.PRINTER
        // Adopt the scoped design system; clear enableView's inline #fff so
        // the stylesheet canvas color applies.
        container.classList.add("tca-view", "tca-printer")
        container.style.background = ""

        let allItems = []          // {id, name, student, className, thumb}
        let selected = new Set()   // selected design ids
        let cardById = new Map()   // id -> card element
        let SIZES = [180, 260, 360]
        let sizeIdx = 0
        let groupByClass = true
        let loading = true

        let el = tcaEl
        let svgIcon = tcaIcon
        let linkBtn = (text, onClick) => {
            let b = el("button", "tca-link-btn", text)
            b.type = "button"
            b.onclick = onClick
            return b
        }

        // ── Top bar: navigation, title, view options ────────────────
        let topbar = el("div", "tca-topbar")
        let backBtn = el("button", "tca-btn tca-btn--ghost")
        backBtn.type = "button"
        backBtn.appendChild(svgIcon(TCA_ICONS.back))
        backBtn.appendChild(document.createTextNode("Back"))
        backBtn.onclick = () => {
            window.currentPage = prevPage
            disableView("printer")
        }
        let countPill = el("span", "tca-pill", "Loading…")
        let groupSwitch = el("button", "tca-switch is-on")
        groupSwitch.type = "button"
        groupSwitch.setAttribute("aria-pressed", "true")
        groupSwitch.appendChild(el("span", null, "Group by class"))
        groupSwitch.appendChild(el("span", "tca-switch-track"))
        groupSwitch.onclick = () => {
            groupByClass = !groupByClass
            groupSwitch.classList.toggle("is-on", groupByClass)
            groupSwitch.setAttribute("aria-pressed", String(groupByClass))
            renderGrid()
        }
        let seg = el("div", "tca-seg")
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
        topbar.append(
            backBtn,
            el("span", "tca-vsep"),
            el("span", "tca-title", "Print Manager"),
            countPill,
            el("span", "tca-spacer"),
            groupSwitch,
            seg
        )

        // ── Toolbar: filters + bulk select ──────────────────────────
        let toolbar = el("div", "tca-toolbar")
        let filterInput = el("input", "tca-input tca-input--search")
        filterInput.type = "search"
        filterInput.placeholder = "Filter by student / class…"
        let nameFilterInput = el("input", "tca-input tca-input--search")
        nameFilterInput.type = "search"
        nameFilterInput.placeholder = "Filter by project name…"
        let dateSelect = el("select", "tca-select")
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
        let selectShownBtn = el("button", "tca-btn", "Select shown")
        selectShownBtn.type = "button"
        selectShownBtn.title = "Select every project that matches the current filters"
        selectShownBtn.onclick = () => setSelection(visibleItems(), true)
        toolbar.append(filterInput, nameFilterInput, dateSelect, el("span", "tca-spacer"), selectShownBtn)

        // ── Scrollable card grid ────────────────────────────────────
        let grid = el("div", "tca-grid tca-scroll")

        // ── Floating selection bar (appears when something is selected)
        let fab = el("div", "tca-fab")
        let fabCount = el("span", "tca-fab-count", "0 selected")
        let fabSep = () => el("span", "tca-fab-sep")
        let fabBtn = (label, onClick, tip) => {
            let b = el("button", "tca-fab-btn", label)
            b.type = "button"
            if (tip) b.title = tip
            b.onclick = onClick
            return b
        }
        let fabClear = el("button", "tca-fab-btn tca-fab-clear")
        fabClear.type = "button"
        fabClear.title = "Clear selection"
        fabClear.appendChild(svgIcon(TCA_ICONS.x))
        fabClear.onclick = () => clearAll()
        fab.append(
            fabCount,
            fabSep(),
            fabBtn("Download STL", () => bulk("stl")),
            fabBtn("Download OBJ", () => bulk("obj")),
            fabSep(),
            fabBtn("Print report", () => printReport(), "Verification cards grouped by class"),
            fabBtn("Print per student", () => printReportPerStudent(), "One section per student"),
            fabSep(),
            fabClear
        )

        container.append(topbar, toolbar, grid, fab)

        let updateSelCount = () => {
            fabCount.textContent = `${selected.size} selected`
            fab.classList.toggle("is-visible", selected.size > 0)
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
            card.classList.toggle("is-selected", isSel)
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

        let formatDate = (mtime) => {
            if (!mtime) return "N/A"
            try {
                let ms = toMillis(mtime)
                return new Date(ms).toLocaleDateString("pl-PL")
            } catch (e) {
                return "N/A"
            }
        }

        let makeCard = (it) => {
            let card = el("div", "tca-card")
            card.style.width = `${SIZES[sizeIdx]}px`
            applySelStyle(card, selected.has(it.id))
            card.title = `${it.student || "?"} — ${it.name || ""}`

            let check = el("span", "tca-check")
            check.innerHTML = TCA_ICONS.check

            let thumbWrap = el("div", "tca-thumb")
            if (it.thumb) {
                let im = document.createElement("img")
                im.src = it.thumb
                im.alt = ""
                im.onerror = () => {
                    refreshThumbnail(it.id, it.clazzId, im, () => {
                        im.remove()
                        thumbWrap.appendChild(svgIcon(TCA_ICONS.cube))
                    })
                }
                thumbWrap.appendChild(im)
            } else {
                thumbWrap.appendChild(svgIcon(TCA_ICONS.cube))
            }

            let body = el("div", "tca-card-body")
            let foot = el("div", "tca-card-foot")
            foot.append(
                el("span", "tca-card-class", it.className || ""),
                el("span", "tca-card-date", it.mtime ? formatDate(it.mtime) : "")
            )
            body.append(
                el("div", "tca-card-student", it.student || "(unknown)"),
                el("div", "tca-card-project", it.name || "(untitled)"),
                foot
            )

            card.append(check, thumbWrap, body)
            card.onclick = () => toggle(it.id, card)
            return card
        }

        let renderSkeleton = () => {
            countPill.textContent = "Loading…"
            let row = el("div", "tca-row")
            for (let k = 0; k < 10; k++) {
                let c = el("div", "tca-skel-card")
                c.style.width = `${SIZES[sizeIdx]}px`
                let body = el("div", "tca-skel-body")
                body.append(el("div", "tca-skel-line"), el("div", "tca-skel-line tca-skel-line--short"))
                c.append(el("div", "tca-skel-thumb"), body)
                row.appendChild(c)
            }
            grid.appendChild(row)
        }

        let renderEmpty = (title, hint, withReset) => {
            let box = el("div", "tca-empty")
            box.appendChild(svgIcon(TCA_ICONS.cube))
            box.appendChild(el("h3", null, title))
            box.appendChild(el("p", null, hint))
            if (withReset) {
                box.appendChild(linkBtn("Reset filters", () => {
                    filterInput.value = ""
                    nameFilterInput.value = ""
                    dateSelect.value = "all"
                    renderGrid()
                }))
            }
            grid.appendChild(box)
        }

        let renderGrid = () => {
            grid.innerHTML = ""
            cardById.clear()
            if (loading) {
                renderSkeleton()
                return
            }
            if (!allItems.length) {
                countPill.textContent = "0 projects"
                renderEmpty("No projects found", "Projects appear here once your classes have synced.", false)
                return
            }
            let items = visibleItems()
            countPill.textContent = `${items.length} of ${allItems.length} shown`
            if (!items.length) {
                renderEmpty("No matching projects", "Try different search terms or another date range.", true)
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
                    let section = el("section", "tca-section")
                    let head = el("div", "tca-section-head")
                    head.append(
                        el("span", "tca-section-title", g.label),
                        el("span", "tca-pill tca-section-count", String(g.items.length)),
                        el("span", "tca-section-line"),
                        linkBtn("Select all", () => setSelection(g.items, true)),
                        linkBtn("Deselect", () => setSelection(g.items, false))
                    )
                    let row = el("div", "tca-row")
                    g.items.forEach((it) => {
                        let c = makeCard(it)
                        row.appendChild(c)
                        cardById.set(it.id, c)
                    })
                    section.append(head, row)
                    grid.appendChild(section)
                })
            } else {
                let row = el("div", "tca-row")
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

        // ── Wiring + initial load ───────────────────────────────────
        filterInput.addEventListener("input", () => renderGrid())
        nameFilterInput.addEventListener("input", () => renderGrid())
        dateSelect.addEventListener("change", () => renderGrid())
        updateSelCount()

        renderGrid() // shows the loading skeleton until data arrives
        updateStorage(() => getGalleryProjects((items) => {
            allItems = items || []
            loading = false
            renderGrid()
        }))
    }, () => {
    })
}

if (typeof window !== 'undefined') {
    window.printerViewEnable = printerViewEnable;
}
