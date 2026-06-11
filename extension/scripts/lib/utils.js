/**
 * Utility function to copy text to the user's clipboard functionally :)
 * @param text The text to copy
 */
let copyTextToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    } else {
        fallbackCopy(text)
    }
}
let fallbackCopy = (text) => {
    let copyFrom = document.createElement("textarea")
    copyFrom.textContent = text
    document.body.appendChild(copyFrom)
    copyFrom.select()
    document.execCommand('copy')
    copyFrom.blur()
    document.body.removeChild(copyFrom)
}

/**
 * Strip everything that is not a letter or digit down to single spaces.
 * Keeps Polish diacritics (they are letters). Used for folder/file names.
 */
let sanitizeName = (s) => (s == null ? '' : String(s))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')

/** ISO-8601 week-year + week number for the given date. */
let isoWeek = (date = new Date()) => {
    let d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    let day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    let week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
    return {year: d.getUTCFullYear(), week}
}

/** Normalize a TinkerCAD timestamp (ns / µs / s / ms / ISO) to milliseconds. */
let toMillis = (v) => {
    if (v == null) return null
    let n = Number(v)
    if (!isNaN(n) && n > 0) {
        if (n > 1e16) return Math.round(n / 1e6)   // nanoseconds
        if (n > 1e13) return Math.round(n / 1e3)   // microseconds
        if (n > 1e9 && n < 1e10) return n * 1000   // seconds
        return n                                    // milliseconds
    }
    let d = new Date(v)
    return isNaN(d.getTime()) ? null : d.getTime()
}

/** Start (00:00, local) of the Monday-based week containing d. */
let startOfWeek = (d) => {
    let x = new Date(d)
    x.setHours(0, 0, 0, 0)
    let day = (x.getDay() + 6) % 7 // Monday = 0
    x.setDate(x.getDate() - day)
    return x.getTime()
}

/** Start (00:00, local) of the month containing d. */
let startOfMonth = (d) => {
    let x = new Date(d)
    x.setHours(0, 0, 0, 0)
    x.setDate(1)
    return x.getTime()
}

/** True if timestamp `ms` falls in the named range relative to now. */
let inDateRange = (ms, range) => {
    if (range === "all") return true
    if (ms == null) return false
    let now = Date.now()
    let sow = startOfWeek(now)
    let som = startOfMonth(now)
    let lastWeekStart = sow - 7 * 86400000
    let lastMonthStart = startOfMonth(som - 1)
    switch (range) {
        case "thisWeek":
            return ms >= sow
        case "lastWeek":
            return ms >= lastWeekStart && ms < sow
        case "thisMonth":
            return ms >= som
        case "lastMonth":
            return ms >= lastMonthStart && ms < som
        case "older":
            return ms < lastMonthStart
        default:
            return true
    }
}

/** Download folder name: "{year}W{week} {sanitized class name}". */
let downloadFolder = (className) => {
    let {year, week} = isoWeek()
    return `${year}W${String(week).padStart(2, '0')} ${sanitizeName(className)}`.trim()
}

/** Download file base name: "{username} {project name}". */
let downloadFileBase = (username, projectName) => sanitizeName(`${username || ''} ${projectName || ''}`)

/** Human-readable duration ("<1 h", "5 h", "3 d", "2 wk") or null. */
let humanizeSpan = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) return null
    let h = ms / 3600000
    if (h < 1) return "<1 h"
    if (h < 48) return `${Math.round(h)} h`
    let d = h / 24
    if (d < 14) return `${Math.round(d)} d`
    return `${Math.round(d / 7)} wk`
}

/**
 * Append the print-weight preset (if tagged) to a file base name:
 * "Ala Keychain" + "printed,10g" -> "Ala Keychain_10g". Applied after
 * sanitizeName so the underscore separator survives.
 */
let withWeightSuffix = (fileBase, tags) => {
    let w = (typeof tcaWeightOf === "function") ? tcaWeightOf(tags) : null
    if (!w) return fileBase
    let def = TCA_WEIGHT_TAGS.find((x) => x.tag === w)
    return `${fileBase}_${def ? def.label : w}`
}

/** CSG STL/OBJ download URL for a design. */
let designDownloadUrl = (designId, format) => `https://csg-prd.tinkercad.com/things/${designId}/polysoup.${format}?rev=-1`

/** Public page of a design (TinkerCAD redirects to the slugged URL). */
let designPageUrl = (designId) => `https://www.tinkercad.com/things/${designId}`

/** Teacher dashboard page of a classroom. */
let classroomPageUrl = (classId) => `https://www.tinkercad.com/classrooms/${classId}`

/** File extension for a download format. OBJ is served as a .zip (obj + mtl). */
let downloadExt = (format) => format === "obj" ? "zip" : format

/** Best thumbnail URL from a design object or stored project (detail > filmstrip). */
let designThumbUrl = (d) => (d && d.thumbnail_json && (
    (d.thumbnail_json.detailThumb && d.thumbnail_json.detailThumb.url) ||
    (d.thumbnail_json.filmstrip && d.thumbnail_json.filmstrip.url))) || (d && d.thumb) || null

/** Active refresh of expired thumbnail S3 URL. */
let refreshThumbnail = (projectId, clazzId, imgEl, fallbackFn) => {
    if (!projectId || imgEl.dataset.tcaRefreshed === "1") {
        if (fallbackFn) fallbackFn()
        return
    }
    imgEl.dataset.tcaRefreshed = "1"
    tcApi.design(projectId).then((d) => {
        let freshUrl = designThumbUrl(d)
        if (freshUrl) {
            imgEl.src = freshUrl
            if (clazzId) {
                modify(clazzId, (clazz) => {
                    for (let act of Object.values((clazz && clazz.activities) || {})) {
                        if (act.projects && act.projects[projectId]) {
                            act.projects[projectId].thumb = freshUrl
                            break
                        }
                    }
                })
            }
        } else {
            if (fallbackFn) fallbackFn()
        }
    }).catch(() => {
        if (fallbackFn) fallbackFn()
    })
}

let escapeHtml = (str) => {
    if (!str) return ""
    return str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
}

function contains_heb(str) {
    return (/[\u0590-\u05FF]/).test(str);
}

/**
 * Utility to make sure the extension is still not reloaded to prevent the extension once reloaded not throwing exceptions :)
 * @param message Weather a message should be sent when this happens
 * @returns Returns if it is active or not.
 */
let isActive = (message = false) => {
    if (message) console.log("Extension was reloaded, no exception thrown")
    return chrome.runtime?.id
}

let openTab = (url) => {
    if (isActive()) chrome.runtime.sendMessage({type: 'TC_OPEN_TAB', url, active: false})
}

if (typeof window !== 'undefined') {
    window.copyTextToClipboard = copyTextToClipboard;
    window.fallbackCopy = fallbackCopy;
    window.sanitizeName = sanitizeName;
    window.isoWeek = isoWeek;
    window.toMillis = toMillis;
    window.startOfWeek = startOfWeek;
    window.startOfMonth = startOfMonth;
    window.inDateRange = inDateRange;
    window.downloadFolder = downloadFolder;
    window.downloadFileBase = downloadFileBase;
    window.humanizeSpan = humanizeSpan;
    window.withWeightSuffix = withWeightSuffix;
    window.designDownloadUrl = designDownloadUrl;
    window.designPageUrl = designPageUrl;
    window.classroomPageUrl = classroomPageUrl;
    window.downloadExt = downloadExt;
    window.designThumbUrl = designThumbUrl;
    window.refreshThumbnail = refreshThumbnail;
    window.escapeHtml = escapeHtml;
    window.contains_heb = contains_heb;
    window.isActive = isActive;
    window.openTab = openTab;
}
