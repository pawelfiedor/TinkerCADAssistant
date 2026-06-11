/**
 * Project workflow statuses, stored as plain tags in the design's
 * `asm_tags` field (comma-separated string, editable from TinkerCAD's
 * own properties dialog too). Single source of truth for every view.
 */
let TCA_STATUS_TAGS = [
    {tag: "to-print", label: "To print", color: "#1477d1"},
    {tag: "verified", label: "Verified", color: "#7c3aed"},
    {tag: "printed", label: "Printed", color: "#d97706"},
    {tag: "handed", label: "Handed out", color: "#16a34a"}
]

/**
 * Print-weight presets, also stored as tags (mutually exclusive).
 * "ns" = print at original scale; the rest = scale to the given weight.
 * The chosen value is appended to exported file names ("Model_10g.stl").
 */
let TCA_WEIGHT_TAGS = [
    {tag: "ns", label: "NS", title: "No scaling — print at original size"},
    {tag: "10g", label: "10g", title: "Scale to ~10 grams"},
    {tag: "20g", label: "20g", title: "Scale to ~20 grams"},
    {tag: "30g", label: "30g", title: "Scale to ~30 grams"}
]

/** asm_tags string -> Set of normalized tags. */
let tcaParseTags = (tagsStr) => new Set(
    String(tagsStr || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
)

/** Set/array of tags -> asm_tags string. */
let tcaSerializeTags = (tags) => [...tags].join(",")

/** The project's print-weight tag ("ns" / "10g" / …) or null. */
let tcaWeightOf = (tagsStr) => {
    let set = tcaParseTags(tagsStr)
    let hit = TCA_WEIGHT_TAGS.find((w) => set.has(w.tag))
    return hit ? hit.tag : null
}

/** Tags that are NOT workflow statuses or weight presets (user's own tags). */
let tcaOtherTags = (tagsStr) => {
    let known = new Set([...TCA_STATUS_TAGS.map((s) => s.tag), ...TCA_WEIGHT_TAGS.map((w) => w.tag)])
    return [...tcaParseTags(tagsStr)].filter((t) => !known.has(t))
}

/** Persist changed project fields into the local storage cache. */
let tcaUpdateStoredProject = (clazzId, projectId, fields, onDone = () => {
}) => {
    modify(clazzId, (clazz) => {
        for (let act of Object.values((clazz && clazz.activities) || {})) {
            if (act.projects && act.projects[projectId]) {
                Object.assign(act.projects[projectId], fields)
                break
            }
        }
    }, onDone)
}

/**
 * PATCH a project's print metadata on TinkerCAD, then mirror the change
 * into the in-memory item and the local storage cache.
 * `meta`: {tags?: string, printDescription?: string}
 */
let tcaPatchProjectMeta = (item, meta, onDone, onError) => {
    // Only the changed keys go into `patch`; the cached copy is passed as
    // fallbacks so a failed metadata GET still produces a complete body
    // without letting stale cache override fresh server values.
    let patch = {}
    if (meta.tags != null) patch.asm_tags = meta.tags
    if (meta.printDescription != null) patch.asm_description = meta.printDescription
    let fallbacks = {
        description: item.name || "",
        asm_tags: item.tags || "",
        asm_description: item.printDescription || ""
    }
    tcApi.patchDesign(item.id, patch, fallbacks).then(() => {
        let fields = {}
        if (meta.tags != null) {
            item.tags = meta.tags
            fields.tags = meta.tags
        }
        if (meta.printDescription != null) {
            item.printDescription = meta.printDescription
            fields.printDescription = meta.printDescription
        }
        if (item.clazzId) tcaUpdateStoredProject(item.clazzId, item.id, fields)
        if (onDone) onDone()
    }).catch((e) => {
        tcApiError(e, "design metadata")
        if (typeof showNotice === "function") showNotice(`Failed to update "${item.name || item.id}"`, "error")
        if (onError) onError(e)
    })
}

/** Toggle one workflow status tag on a project (immediate PATCH). */
let tcaToggleStatusTag = (item, tag, onDone, onError) => {
    let set = tcaParseTags(item.tags)
    if (set.has(tag)) set.delete(tag)
    else set.add(tag)
    tcaPatchProjectMeta(item, {tags: tcaSerializeTags(set)}, onDone, onError)
}

/**
 * Status chip row control.
 * opts: {tags: string, compact: bool (dots instead of labelled pills),
 *        onToggle: (statusDef, ctl) => void  — omit for read-only}
 * Returns {el, set(tagsStr), setBusy(tag, busy)}.
 */
let tcaStatusChips = (opts = {}) => {
    let wrap = tcaEl("span", "tca-status" + (opts.compact ? " tca-status--dots" : ""))
    let buttons = new Map()
    let ctl = {
        el: wrap,
        set(tagsStr) {
            let set = tcaParseTags(tagsStr)
            buttons.forEach((b, tag) => b.classList.toggle("is-on", set.has(tag)))
        },
        setBusy(tag, busy) {
            let b = buttons.get(tag)
            if (!b) return
            b.classList.toggle("is-busy", !!busy)
            if (opts.onToggle) b.disabled = !!busy
        }
    }
    TCA_STATUS_TAGS.forEach((st) => {
        let b = tcaEl("button", "tca-status-chip", opts.compact ? null : st.label)
        b.type = "button"
        b.title = st.label
        b.style.setProperty("--tca-chip", st.color)
        if (opts.onToggle) {
            b.onclick = (e) => {
                e.stopPropagation()
                e.preventDefault()
                opts.onToggle(st, ctl)
            }
        } else {
            b.classList.add("is-static")
            b.tabIndex = -1
        }
        buttons.set(st.tag, b)
        wrap.appendChild(b)
    })
    ctl.set(opts.tags || "")
    return ctl
}

/**
 * Print-weight chip row (single-select).
 * opts: {weight: tag|null, onSelect: (weightDef, ctl) => void}
 * Returns {el, set(weightTag|null)}.
 */
let tcaWeightChips = (opts = {}) => {
    let wrap = tcaEl("span", "tca-status")
    let buttons = new Map()
    let ctl = {
        el: wrap,
        set(weightTag) {
            buttons.forEach((b, tag) => b.classList.toggle("is-on", tag === weightTag))
        }
    }
    TCA_WEIGHT_TAGS.forEach((wt) => {
        let b = tcaEl("button", "tca-status-chip", wt.label)
        b.type = "button"
        b.title = wt.title || wt.label
        b.style.setProperty("--tca-chip", "#5b6472")
        b.onclick = (e) => {
            e.stopPropagation()
            e.preventDefault()
            if (opts.onSelect) opts.onSelect(wt, ctl)
        }
        buttons.set(wt.tag, b)
        wrap.appendChild(b)
    })
    ctl.set(opts.weight || null)
    return ctl
}

/** Standard wiring: chips that toggle + PATCH the given item in place. */
let tcaLiveStatusChips = (item, opts = {}) => tcaStatusChips({
    tags: item.tags,
    compact: opts.compact,
    onToggle: (st, ctl) => {
        ctl.setBusy(st.tag, true)
        let done = () => {
            ctl.setBusy(st.tag, false)
            ctl.set(item.tags)
            if (opts.onChange) opts.onChange()
        }
        tcaToggleStatusTag(item, st.tag, done, done)
    }
})

if (typeof window !== 'undefined') {
    window.TCA_STATUS_TAGS = TCA_STATUS_TAGS;
    window.TCA_WEIGHT_TAGS = TCA_WEIGHT_TAGS;
    window.tcaParseTags = tcaParseTags;
    window.tcaSerializeTags = tcaSerializeTags;
    window.tcaWeightOf = tcaWeightOf;
    window.tcaOtherTags = tcaOtherTags;
    window.tcaWeightChips = tcaWeightChips;
    window.tcaUpdateStoredProject = tcaUpdateStoredProject;
    window.tcaPatchProjectMeta = tcaPatchProjectMeta;
    window.tcaToggleStatusTag = tcaToggleStatusTag;
    window.tcaStatusChips = tcaStatusChips;
    window.tcaLiveStatusChips = tcaLiveStatusChips;
}
