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
        let cardChips = new Map()  // id -> status chip control
        let cardWeights = new Map() // id -> weight chip refresh fn
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
        let statusSelect = el("select", "tca-select")
        ;[["any", "Status: any"]]
            .concat(TCA_STATUS_TAGS.map((st) => [st.tag, `Status: ${st.label}`]))
            .concat([["none", "Status: none"]])
            .forEach(([v, t]) => {
                let o = document.createElement("option")
                o.value = v
                o.textContent = t
                statusSelect.appendChild(o)
            })
        statusSelect.value = "any"
        let selectShownBtn = el("button", "tca-btn", "Select shown")
        selectShownBtn.type = "button"
        selectShownBtn.title = "Select every project that matches the current filters"
        selectShownBtn.onclick = () => setSelection(visibleItems(), true)
        toolbar.append(filterInput, nameFilterInput, dateSelect, statusSelect, el("span", "tca-spacer"), selectShownBtn)

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

        // "Status ▾" — bulk-toggle workflow tags on the selection.
        let statusWrap = el("span", "tca-fab-status")
        let statusMenu = el("div", "tca-fab-menu")
        let statusMenuOpen = false
        let onDocDown = (e) => {
            if (!statusWrap.contains(e.target)) closeStatusMenu()
        }
        let closeStatusMenu = () => {
            statusMenuOpen = false
            statusMenu.classList.remove("is-open")
            document.removeEventListener("mousedown", onDocDown, true)
        }
        let openStatusMenu = () => {
            statusMenuOpen = true
            rebuildStatusMenu()
            statusMenu.classList.add("is-open")
            document.addEventListener("mousedown", onDocDown, true)
        }
        let rebuildStatusMenu = () => {
            statusMenu.innerHTML = ""
            let chosen = allItems.filter((it) => selected.has(it.id))
            statusMenu.appendChild(el("div", "tca-fab-mi-cap", "Status"))
            TCA_STATUS_TAGS.forEach((st) => {
                let have = chosen.filter((it) => tcaParseTags(it.tags).has(st.tag)).length
                let allHave = chosen.length > 0 && have === chosen.length
                let mi = el("button", "tca-fab-mi")
                mi.type = "button"
                let dot = el("span", "tca-fab-mi-dot")
                dot.style.background = st.color
                mi.append(dot, el("span", null, st.label), el("span", "tca-fab-mi-count", `${have}/${chosen.length}`))
                mi.title = allHave ? `Remove "${st.label}" from all selected` : `Mark all selected as "${st.label}"`
                mi.onclick = () => {
                    closeStatusMenu()
                    bulkStatus(st, chosen, allHave)
                }
                statusMenu.appendChild(mi)
            })
            statusMenu.appendChild(el("div", "tca-fab-menu-sep"))
            statusMenu.appendChild(el("div", "tca-fab-mi-cap", "Print weight"))
            TCA_WEIGHT_TAGS.forEach((wt) => {
                let have = chosen.filter((it) => tcaWeightOf(it.tags) === wt.tag).length
                let mi = el("button", "tca-fab-mi")
                mi.type = "button"
                let dot = el("span", "tca-fab-mi-dot")
                dot.style.background = "#5b6472"
                mi.append(dot, el("span", null, wt.label), el("span", "tca-fab-mi-count", `${have}/${chosen.length}`))
                mi.title = `Set for all selected: ${wt.title || wt.label}`
                mi.onclick = () => {
                    closeStatusMenu()
                    bulkWeight(wt.tag, chosen)
                }
                statusMenu.appendChild(mi)
            })
            let clearMi = el("button", "tca-fab-mi")
            clearMi.type = "button"
            let clearDot = el("span", "tca-fab-mi-dot")
            clearDot.style.background = "transparent"
            clearDot.style.border = "1px solid rgba(255,255,255,.4)"
            let withW = chosen.filter((it) => tcaWeightOf(it.tags)).length
            clearMi.append(clearDot, el("span", null, "No weight"), el("span", "tca-fab-mi-count", `${withW}/${chosen.length}`))
            clearMi.title = "Remove the weight tag from all selected"
            clearMi.onclick = () => {
                closeStatusMenu()
                bulkWeight(null, chosen)
            }
            statusMenu.appendChild(clearMi)
        }
        let bulkWeight = (weightTag, chosen) => {
            let targets = chosen.filter((it) => tcaWeightOf(it.tags) !== weightTag)
            if (!targets.length) return
            showNotice(`${weightTag ? `Setting weight "${weightTag}"` : "Clearing weight"} — ${targets.length} project(s)…`)
            let failed = 0
            let k = 0
            let next = () => {
                if (k >= targets.length) {
                    showNotice(failed ? `Weight update finished with ${failed} error(s)` : `Updated ${targets.length} project(s)`, failed ? "error" : "ok")
                    targets.forEach((it) => {
                        let wf = cardWeights.get(it.id)
                        if (wf) wf()
                    })
                    return
                }
                let it = targets[k++]
                let set = tcaParseTags(it.tags)
                TCA_WEIGHT_TAGS.forEach((w) => set.delete(w.tag))
                if (weightTag) set.add(weightTag)
                tcaPatchProjectMeta(it, {tags: tcaSerializeTags(set)}, () => next(), () => {
                    failed++
                    next()
                })
            }
            next()
        }
        let bulkStatus = (st, chosen, removeAll) => {
            let targets = chosen.filter((it) => tcaParseTags(it.tags).has(st.tag) === removeAll)
            if (!targets.length) return
            showNotice(`${removeAll ? "Removing" : "Adding"} "${st.label}" — ${targets.length} project(s)…`)
            let failed = 0
            let k = 0
            let next = () => {
                if (k >= targets.length) {
                    showNotice(failed ? `Status update finished with ${failed} error(s)` : `Updated ${targets.length} project(s)`, failed ? "error" : "ok")
                    targets.forEach((it) => {
                        let ctl = cardChips.get(it.id)
                        if (ctl) ctl.set(it.tags)
                    })
                    return
                }
                let it = targets[k++]
                let set = tcaParseTags(it.tags)
                if (removeAll) set.delete(st.tag)
                else set.add(st.tag)
                tcaPatchProjectMeta(it, {tags: tcaSerializeTags(set)}, () => next(), () => {
                    failed++
                    next()
                })
            }
            next()
        }
        statusWrap.append(
            fabBtn("Status ▾", () => statusMenuOpen ? closeStatusMenu() : openStatusMenu(), "Set workflow status for the selected projects"),
            statusMenu
        )

        fab.append(
            fabCount,
            fabSep(),
            fabBtn("Download STL", () => bulk("stl")),
            fabBtn("Download OBJ", () => bulk("obj")),
            fabSep(),
            statusWrap,
            fabSep(),
            fabBtn("Print report", () => printReport(), "Verification cards grouped by class"),
            fabBtn("Print per student", () => printReportPerStudent(), "One section per student"),
            fabSep(),
            fabClear
        )

        // ── Description & tags editor (modal) ───────────────────────
        let editor = el("div", "tca-modal")
        let editorCard = el("div", "tca-modal-card")
        editor.appendChild(editorCard)
        editor.onclick = (e) => {
            if (e.target === editor) closeEditor()
        }
        let editorItemId = null
        let closeEditor = () => {
            editorItemId = null
            editor.classList.remove("is-open")
        }
        let openEditor = (it) => {
            editorItemId = it.id
            editorCard.innerHTML = ""
            let localTags = tcaParseTags(it.tags)
            let dirty = false

            let head = el("div", "tca-modal-head")
            let titleLink = el("a", "tca-modal-title", it.name || "(untitled)")
            titleLink.href = designPageUrl(it.id)
            titleLink.target = "_blank"
            titleLink.rel = "noopener"
            titleLink.title = "Open the project page in a new tab"
            let xBtn = el("button", "tca-btn tca-btn--ghost tca-modal-x")
            xBtn.type = "button"
            xBtn.title = "Close"
            xBtn.appendChild(svgIcon(TCA_ICONS.x))
            xBtn.onclick = () => closeEditor()
            head.append(titleLink, el("span", "tca-spacer"), xBtn)
            let sub = el("div", "tca-modal-sub", [it.student, it.className].filter(Boolean).join(" · "))
            let metaBits = []
            if (it.btime) metaBits.push(`Created ${formatDate(it.btime)}`)
            if (it.mtime) metaBits.push(`modified ${formatDate(it.mtime)}`)
            let createdMs = toMillis(it.btime)
            let modifiedMs = toMillis(it.mtime)
            let worked = (createdMs != null && modifiedMs != null) ? humanizeSpan(modifiedMs - createdMs) : null
            if (worked) metaBits.push(`~${worked} of work`)
            let meta = el("div", "tca-modal-meta", metaBits.join(" · "))
            if (!metaBits.length) meta.style.display = "none"

            let statusField = el("div", "tca-field")
            statusField.appendChild(el("span", "tca-field-label", "Status"))
            let chipsCtl = tcaStatusChips({
                tags: it.tags,
                onToggle: (st, ctl) => {
                    dirty = true
                    if (localTags.has(st.tag)) localTags.delete(st.tag)
                    else localTags.add(st.tag)
                    ctl.set(tcaSerializeTags(localTags))
                }
            })
            statusField.appendChild(chipsCtl.el)

            let weightField = el("div", "tca-field")
            weightField.appendChild(el("span", "tca-field-label", "Print weight"))
            let localWeight = tcaWeightOf(it.tags)
            let weightCtl = tcaWeightChips({
                weight: localWeight,
                onSelect: (wt, ctl) => {
                    dirty = true
                    localWeight = localWeight === wt.tag ? null : wt.tag
                    ctl.set(localWeight)
                }
            })
            weightField.appendChild(weightCtl.el)

            let descField = el("div", "tca-field")
            descField.appendChild(el("span", "tca-field-label", "Description"))
            let descInput = el("textarea", "tca-input tca-textarea")
            descInput.placeholder = "Print notes, dimensions, filament…"
            descInput.value = it.printDescription || ""
            descInput.addEventListener("input", () => dirty = true)
            descField.appendChild(descInput)

            let tagsField = el("div", "tca-field")
            tagsField.appendChild(el("span", "tca-field-label", "Other tags (comma separated)"))
            let tagsInput = el("input", "tca-input")
            tagsInput.type = "text"
            tagsInput.placeholder = "e.g. competition, large-print"
            tagsInput.value = tcaOtherTags(it.tags).join(", ")
            tagsInput.addEventListener("input", () => dirty = true)
            tagsField.appendChild(tagsInput)

            let foot = el("div", "tca-modal-foot")
            let cancelBtn = el("button", "tca-btn", "Cancel")
            cancelBtn.type = "button"
            cancelBtn.onclick = () => closeEditor()
            let saveBtn = el("button", "tca-btn tca-btn--primary", "Save")
            saveBtn.type = "button"
            saveBtn.onclick = () => {
                let known = new Set([...TCA_STATUS_TAGS.map((s) => s.tag), ...TCA_WEIGHT_TAGS.map((w) => w.tag)])
                let others = tagsInput.value.split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .filter((t) => !known.has(t.toLowerCase()))
                let ordered = TCA_STATUS_TAGS.filter((s) => localTags.has(s.tag)).map((s) => s.tag)
                if (localWeight) ordered.push(localWeight)
                let tagsStr = tcaSerializeTags([...ordered, ...others])
                saveBtn.disabled = true
                saveBtn.textContent = "Saving…"
                tcaPatchProjectMeta(it, {tags: tagsStr, printDescription: descInput.value}, () => {
                    closeEditor()
                    let ctl = cardChips.get(it.id)
                    if (ctl) ctl.set(it.tags)
                    let wf = cardWeights.get(it.id)
                    if (wf) wf()
                }, () => {
                    saveBtn.disabled = false
                    saveBtn.textContent = "Save"
                })
            }
            foot.append(cancelBtn, saveBtn)

            editorCard.append(head, sub, meta, statusField, weightField, descField, tagsField, foot)
            editor.classList.add("is-open")

            // Background refresh: tags may have changed in TinkerCAD's own
            // dialog since the last sync. Don't stomp on user edits.
            tcApi.design(it.id).then((d) => {
                if (!d) return
                let freshTags = d.asm_tags != null ? d.asm_tags : it.tags
                let freshDesc = d.asm_description != null ? d.asm_description : it.printDescription
                it.tags = freshTags
                it.printDescription = freshDesc
                if (it.clazzId) tcaUpdateStoredProject(it.clazzId, it.id, {tags: freshTags, printDescription: freshDesc})
                let cardCtl = cardChips.get(it.id)
                if (cardCtl) cardCtl.set(freshTags)
                let cardW = cardWeights.get(it.id)
                if (cardW) cardW()
                if (!dirty && editorItemId === it.id) {
                    localTags = tcaParseTags(freshTags)
                    chipsCtl.set(freshTags)
                    localWeight = tcaWeightOf(freshTags)
                    weightCtl.set(localWeight)
                    descInput.value = freshDesc || ""
                    tagsInput.value = tcaOtherTags(freshTags).join(", ")
                }
            }).catch(() => {})
        }

        container.append(topbar, toolbar, grid, fab, editor)

        let updateSelCount = () => {
            fabCount.textContent = `${selected.size} selected`
            fab.classList.toggle("is-visible", selected.size > 0)
        }
        let visibleItems = () => {
            let ft = filterInput.value.trim().toLowerCase()
            let nft = nameFilterInput.value.trim().toLowerCase()
            let range = dateSelect.value
            let sf = statusSelect.value
            return allItems.filter((it) => {
                if (!inDateRange(toMillis(it.mtime), range)) return false
                if (ft && !`${it.student} ${it.className} ${it.name}`.toLowerCase().includes(ft)) return false
                if (nft && !`${it.name}`.toLowerCase().includes(nft)) return false
                if (sf !== "any") {
                    let set = tcaParseTags(it.tags)
                    if (sf === "none") {
                        if (TCA_STATUS_TAGS.some((st) => set.has(st.tag))) return false
                    } else if (!set.has(sf)) {
                        return false
                    }
                }
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
        // Compact card variant: "11.06", with a 2-digit year only when it
        // differs from the current one. Full dates live in the tooltip.
        let formatDateShort = (mtime) => {
            let ms = toMillis(mtime)
            if (ms == null) return ""
            let d = new Date(ms)
            let dd = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`
            return d.getFullYear() === new Date().getFullYear() ? dd : `${dd}.${String(d.getFullYear()).slice(2)}`
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
            let projLink = el("a", "tca-card-project tca-card-link", it.name || "(untitled)")
            projLink.href = designPageUrl(it.id)
            projLink.target = "_blank"
            projLink.rel = "noopener"
            projLink.title = "Open the project page in a new tab"
            projLink.onclick = (e) => e.stopPropagation()
            let classLink = el("a", "tca-card-class tca-card-link", it.className || "")
            if (it.clazzId) {
                classLink.href = classroomPageUrl(it.clazzId)
                classLink.target = "_blank"
                classLink.rel = "noopener"
                classLink.title = "Open the class page in a new tab"
                classLink.onclick = (e) => e.stopPropagation()
            }
            // Date + work span on their own line, so a long class name can
            // never squeeze them out of view.
            let createdMs = toMillis(it.btime)
            let modifiedMs = toMillis(it.mtime)
            let worked = (createdMs != null && modifiedMs != null) ? humanizeSpan(modifiedMs - createdMs) : null
            let dateEl = el("div", "tca-card-date",
                it.mtime ? (worked ? `${formatDateShort(it.mtime)} · ${worked}` : formatDateShort(it.mtime)) : "")
            if (createdMs != null) {
                dateEl.title = `Created ${formatDate(it.btime)} · last modified ${formatDate(it.mtime)} · ~${worked || "<1 h"} of work`
            }
            let chipsCtl = tcaLiveStatusChips(it, {compact: true})
            cardChips.set(it.id, chipsCtl)
            let weightEl = el("span", "tca-weight-chip")
            weightEl.title = "Print weight (edit via the pencil)"
            let refreshWeight = () => {
                let w = tcaWeightOf(it.tags)
                let def = w && TCA_WEIGHT_TAGS.find((x) => x.tag === w)
                weightEl.textContent = def ? def.label : ""
                weightEl.style.display = w ? "" : "none"
            }
            refreshWeight()
            cardWeights.set(it.id, refreshWeight)
            let statusRow = el("div", "tca-card-status")
            statusRow.append(chipsCtl.el, weightEl)
            body.append(
                el("div", "tca-card-student", it.student || "(unknown)"),
                projLink,
                classLink,
                dateEl,
                statusRow
            )

            let editBtn = el("button", "tca-edit")
            editBtn.type = "button"
            editBtn.title = "Edit description & tags"
            editBtn.innerHTML = TCA_ICONS.pencil
            editBtn.onclick = (e) => {
                e.stopPropagation()
                openEditor(it)
            }

            card.append(check, editBtn, thumbWrap, body)
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
                    statusSelect.value = "any"
                    renderGrid()
                }))
            }
            grid.appendChild(box)
        }

        let renderGrid = () => {
            grid.innerHTML = ""
            cardById.clear()
            cardChips.clear()
            cardWeights.clear()
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
                let groups = new Map() // key -> {label, clazzId, items}
                items.forEach((it) => {
                    let key = it.clazzId || it.className || "?"
                    if (!groups.has(key)) groups.set(key, {label: it.className || "(unknown class)", clazzId: it.clazzId, items: []})
                    groups.get(key).items.push(it)
                })
                groups.forEach((g) => {
                    let section = el("section", "tca-section")
                    let head = el("div", "tca-section-head")
                    let titleEl
                    if (g.clazzId) {
                        titleEl = el("a", "tca-section-title tca-card-link", g.label)
                        titleEl.href = classroomPageUrl(g.clazzId)
                        titleEl.target = "_blank"
                        titleEl.rel = "noopener"
                        titleEl.title = "Open the class page in a new tab"
                    } else {
                        titleEl = el("span", "tca-section-title", g.label)
                    }
                    head.append(
                        titleEl,
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
                filename: `${downloadFolder(it.className || "TinkerCAD")}/${withWeightSuffix(downloadFileBase(it.student, it.name), it.tags)}.${downloadExt(format)}`
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
        statusSelect.addEventListener("change", () => renderGrid())
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
