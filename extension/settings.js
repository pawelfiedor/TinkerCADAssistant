/**
 * Settings popup. Reuses the shared design system (style/views.css) and
 * the status/weight definitions from lib/status-tags.js.
 *
 * Stored keys:
 *  - speed     (1–5): Gallery / Teacher view auto-advance speed (legacy key)
 *  - tcaConfig {statusEditing, weightsEnabled, statusTags, weightTags}
 */
let storageApi = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : (() => { // dev-preview fallback: in-memory store
        let mem = {}
        return {
            get: (keys, cb) => cb({...mem}),
            set: (obj, cb) => {
                Object.assign(mem, obj)
                if (cb) cb()
            }
        }
    })()

let el = tcaEl
let app = document.querySelector("#app")

let state = {
    speed: 4,
    statusEditing: true,
    weightsEnabled: true,
    statusTags: TCA_STATUS_DEFAULTS.map((s) => ({...s})),
    weightTags: TCA_WEIGHT_DEFAULTS.map((w) => ({...w}))
}

// ── Small builders ──────────────────────────────────────────────────
let section = (title) => {
    let s = el("section", "tca-set-section")
    if (title) s.appendChild(el("h3", "tca-set-title", title))
    app.appendChild(s)
    return s
}

let switchRow = (label, descText, get, set) => {
    let row = el("div", "tca-set-row")
    let texts = el("div", "tca-set-texts")
    texts.append(el("div", "tca-set-label", label), el("div", "tca-set-desc", descText))
    let sw = el("button", "tca-switch" + (get() ? " is-on" : ""))
    sw.type = "button"
    sw.setAttribute("aria-pressed", String(get()))
    sw.appendChild(el("span", "tca-switch-track"))
    sw.onclick = () => {
        set(!get())
        sw.classList.toggle("is-on", get())
        sw.setAttribute("aria-pressed", String(get()))
    }
    row.append(texts, sw)
    return row
}

/**
 * Editable tag list. Rows live-edit the entries in `items`;
 * `spec.withColor` adds a color picker (statuses).
 */
let listEditor = (host, items, spec) => {
    let wrap = el("div", "tca-tag-list")
    let render = () => {
        wrap.innerHTML = ""
        items.forEach((item, idx) => {
            let row = el("div", "tca-tag-row")
            if (spec.withColor) {
                let color = el("input", "tca-color")
                color.type = "color"
                color.value = item.color || "#5b6472"
                color.title = "Chip color"
                color.addEventListener("input", () => item.color = color.value)
                row.appendChild(color)
            }
            let label = el("input", "tca-input")
            label.type = "text"
            label.placeholder = "Label"
            label.title = "Shown on chips and in menus"
            label.value = item.label || ""
            label.addEventListener("input", () => item.label = label.value)
            let tag = el("input", "tca-input tca-input--tag")
            tag.type = "text"
            tag.placeholder = "tag"
            tag.title = "Value written into the design's tags (asm_tags)"
            tag.value = item.tag || ""
            tag.addEventListener("input", () => item.tag = tag.value)
            let rm = el("button", "tca-link-btn", "✕")
            rm.type = "button"
            rm.title = "Remove"
            rm.onclick = () => {
                items.splice(idx, 1)
                render()
            }
            row.append(label, tag, rm)
            wrap.appendChild(row)
        })
        let add = el("button", "tca-link-btn", spec.addLabel)
        add.type = "button"
        add.onclick = () => {
            let entry = {label: "", tag: ""}
            if (spec.withColor) entry.color = "#5b6472"
            items.push(entry)
            render()
        }
        wrap.appendChild(add)
    }
    render()
    host.appendChild(wrap)
}

/**
 * Validate, sanitize and deduplicate the settings parameters.
 * Returns { data: ... } on success, or { error: "message" } on failure.
 */
let validateAndSave = (speed, statusEditing, weightsEnabled, statusTags, weightTags) => {
    let parsedSpeed = Number(speed)
    if (isNaN(parsedSpeed) || parsedSpeed < 1 || parsedSpeed > 5) {
        return { error: "Invalid speed value. Speed must be between 1 and 5." }
    }

    if (!Array.isArray(statusTags) || !Array.isArray(weightTags)) {
        return { error: "Invalid tags format. Status tags and weight presets must be arrays." }
    }

    let clean = (list) => list
        .map((e) => {
            if (!e || typeof e !== "object") return null
            let label = String(e.label || "").trim()
            let tag = tcaSanitizeTag(e.tag || label)
            let item = { tag, label }
            if (e.color) item.color = String(e.color).trim()
            return item
        })
        .filter((e) => e && e.tag)
        .map((e) => ({...e, label: e.label || e.tag}))

    let cleanStatus = clean(statusTags)
    let cleanWeight = clean(weightTags)

    let dedupe = (list) => {
        let seen = new Set()
        return list.filter((e) => !seen.has(e.tag) && seen.add(e.tag))
    }

    cleanStatus = dedupe(cleanStatus)
    cleanWeight = dedupe(cleanWeight)

    let overlap = cleanWeight.filter((w) => cleanStatus.some((s) => s.tag === w.tag))
    if (overlap.length) {
        return { error: `Tag "${overlap[0].tag}" is used as both a status and a weight — make them unique.` }
    }

    if (!cleanStatus.length || !cleanWeight.length) {
        return { error: "Each list needs at least one entry (or use Reset)." }
    }

    return {
        data: {
            speed: parsedSpeed,
            tcaConfig: {
                statusEditing: statusEditing !== false,
                weightsEnabled: weightsEnabled !== false,
                statusTags: cleanStatus,
                weightTags: cleanWeight
            }
        }
    }
}

// ── Build the page ──────────────────────────────────────────────────
let build = () => {
    app.innerHTML = ""

    let head = el("div", "tca-set-head")
    head.append(el("div", "tca-title", "TinkerCAD Assistant"), el("span", "tca-pill", "Settings"))
    app.appendChild(head)

    // Slideshow speed (legacy "speed" key)
    let sShow = section("Slideshow")
    let speedDesc = el("div", "tca-set-desc")
    let updateSpeedDesc = () => {
        speedDesc.textContent = `Gallery and Teacher view auto-advance: each project is shown for ${(6 - state.speed) * 10} s.`
    }
    updateSpeedDesc()
    let slider = el("input", "tca-range")
    slider.type = "range"
    slider.min = "1"
    slider.max = "5"
    slider.step = "1"
    slider.value = String(state.speed)
    slider.addEventListener("input", () => {
        state.speed = Number(slider.value)
        updateSpeedDesc()
    })
    let sliderRow = el("div", "tca-set-sliderrow")
    sliderRow.append(el("span", "tca-set-desc", "Slow"), slider, el("span", "tca-set-desc", "Fast"))
    sShow.append(el("div", "tca-set-label", "Auto-advance speed"), sliderRow, speedDesc)

    // Feature switches
    let sFlags = section("Print workflow")
    sFlags.appendChild(switchRow(
        "Status editing",
        "Allow toggling workflow statuses (chips on cards, in the gallery, the lightbox, the bulk Status menu and the editor). When off, statuses are still shown but read-only.",
        () => state.statusEditing,
        (v) => state.statusEditing = v
    ))
    sFlags.appendChild(switchRow(
        "Print-weight presets",
        "Show the weight controls (editor, bulk menu, card chip) and append the chosen preset to exported print files, e.g. \"Model_10g.stl\". When off, weight tags are left untouched and file names get no suffix.",
        () => state.weightsEnabled,
        (v) => state.weightsEnabled = v
    ))

    // Status tag list
    let sStatus = section("Status tags")
    sStatus.appendChild(el("div", "tca-set-desc",
        "Workflow statuses offered everywhere in the assistant. \"Tag\" is the value written into the design's tags (asm_tags) — changing it later orphans projects already tagged with the old value."))
    listEditor(sStatus, state.statusTags, {withColor: true, addLabel: "+ Add status"})

    // Weight list
    let sWeight = section("Weight presets")
    sWeight.appendChild(el("div", "tca-set-desc",
        "Mutually exclusive scale presets. The label is appended to exported file names (\"Model_10g.stl\")."))
    listEditor(sWeight, state.weightTags, {withColor: false, addLabel: "+ Add preset"})

    // Backup & Share
    let sBackup = section("Backup & Share")
    sBackup.appendChild(el("div", "tca-set-desc",
        "Export settings to a file to share with other trainers, or import settings from a file."))

    let backupRow = el("div", "tca-set-row")
    backupRow.style.gap = "8px"
    backupRow.style.marginTop = "4px"
    backupRow.style.alignItems = "center"

    let exportBtn = el("button", "tca-btn", "Export settings")
    exportBtn.type = "button"
    exportBtn.onclick = () => {
        let exportData = {
            tca_settings_export: true,
            version: 1,
            speed: state.speed,
            tcaConfig: {
                statusEditing: state.statusEditing,
                weightsEnabled: state.weightsEnabled,
                statusTags: state.statusTags,
                weightTags: state.weightTags
            }
        }
        let blob = new Blob([JSON.stringify(exportData, null, 2)], {type: "application/json"})
        let url = URL.createObjectURL(blob)
        let a = el("a")
        a.href = url
        let dateStr = new Date().toISOString().slice(0, 10)
        a.download = `tca-settings-${dateStr}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    let fileInput = el("input")
    fileInput.type = "file"
    fileInput.accept = ".json"
    fileInput.style.display = "none"
    fileInput.onchange = (e) => {
        let file = e.target.files[0]
        if (!file) return

        let reader = new FileReader()
        reader.onload = (evt) => {
            try {
                let imported = JSON.parse(evt.target.result)
                if (!imported || !imported.tca_settings_export) {
                    throw new Error("Invalid file format. Please upload a TinkerCAD Assistant settings file.")
                }

                let cfg = imported.tcaConfig || {}
                let result = validateAndSave(
                    imported.speed || state.speed,
                    cfg.statusEditing !== false,
                    cfg.weightsEnabled !== false,
                    cfg.statusTags || [],
                    cfg.weightTags || []
                )

                if (result.error) {
                    backupErrNote.textContent = result.error
                    return
                }

                // Update state and save
                state.speed = result.data.speed
                state.statusEditing = result.data.tcaConfig.statusEditing
                state.weightsEnabled = result.data.tcaConfig.weightsEnabled
                state.statusTags = result.data.tcaConfig.statusTags
                state.weightTags = result.data.tcaConfig.weightTags

                storageApi.set(result.data, () => {
                    build()
                    let note = document.querySelector(".tca-backup-saved")
                    if (note) {
                        note.style.opacity = "1"
                        setTimeout(() => note.style.opacity = "0", 1800)
                    }
                })
            } catch (err) {
                backupErrNote.textContent = err.message || "Failed to parse JSON file."
            }
        }
        reader.readAsText(file)
    }

    let importBtn = el("button", "tca-btn", "Import settings")
    importBtn.type = "button"
    importBtn.onclick = () => {
        backupErrNote.textContent = ""
        fileInput.click()
    }

    let backupSavedNote = el("span", "tca-set-saved tca-backup-saved", "Imported ✓")
    backupSavedNote.style.opacity = "0"

    let backupErrNote = el("span", "tca-set-error")

    backupRow.append(exportBtn, importBtn, fileInput, backupSavedNote, backupErrNote)
    sBackup.appendChild(backupRow)


    // Footer: reset / save
    let foot = el("div", "tca-set-foot")
    let resetBtn = el("button", "tca-link-btn", "Reset tags to defaults")
    resetBtn.type = "button"
    resetBtn.onclick = () => {
        state.statusTags = TCA_STATUS_DEFAULTS.map((s) => ({...s}))
        state.weightTags = TCA_WEIGHT_DEFAULTS.map((w) => ({...w}))
        build()
    }
    let savedNote = el("span", "tca-set-saved", "Saved ✓")
    savedNote.style.opacity = "0"
    let errNote = el("span", "tca-set-error")
    let saveBtn = el("button", "tca-btn tca-btn--primary", "Save")
    saveBtn.type = "button"
    saveBtn.onclick = () => {
        errNote.textContent = ""
        let result = validateAndSave(
            state.speed,
            state.statusEditing,
            state.weightsEnabled,
            state.statusTags,
            state.weightTags
        )
        if (result.error) {
            errNote.textContent = result.error
            return
        }
        state.statusTags = result.data.tcaConfig.statusTags
        state.weightTags = result.data.tcaConfig.weightTags
        storageApi.set(result.data, () => {
            build()
            let note = document.querySelector(".tca-set-saved")
            note.style.opacity = "1"
            setTimeout(() => note.style.opacity = "0", 1800)
        })
    }
    foot.append(resetBtn, el("span", "tca-spacer"), errNote, savedNote, saveBtn)
    app.appendChild(foot)
}

// ── Load stored values, then render ─────────────────────────────────
storageApi.get(["speed", "tcaConfig"], (data) => {
    if (data && data.speed != null) state.speed = Number(data.speed) || 4
    let cfg = data && data.tcaConfig
    if (cfg) {
        state.statusEditing = cfg.statusEditing !== false
        state.weightsEnabled = cfg.weightsEnabled !== false
        if (Array.isArray(cfg.statusTags) && cfg.statusTags.length) state.statusTags = cfg.statusTags.map((s) => ({...s}))
        if (Array.isArray(cfg.weightTags) && cfg.weightTags.length) state.weightTags = cfg.weightTags.map((w) => ({...w}))
    }
    build()
})
