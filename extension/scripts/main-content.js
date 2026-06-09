/**
 *  TinkerCAD assistant was developed by Ezra Golombek 2025.
 */

/**
 * Terms used:
 * UAS - Update and store: Refers to update the current data and store it.
 * UASR - Update and store and reload: Refers to to reload an entire of something and store it.
 */
// if (window !== window.top) {
// }
const Context = Object.freeze({
    GENERAL: 'general',
    ACTIVITY: 'activity',
    TEACHER: 'teacher',
    CLASSES: 'classes',
    GALLERY: 'gallery',
    ACTIVITIES: 'activities',
    PRINTER: 'printer'
})


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

/** CSG STL/OBJ download URL for a design. */
let designDownloadUrl = (designId, format) => `https://csg-prd.tinkercad.com/things/${designId}/polysoup.${format}?rev=-1`

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

class SimpleZipWriter {
    constructor() {
        this.files = []
    }

    addFile(name, data) {
        this.files.push({ name, data })
    }

    generate() {
        const crc32Table = new Int32Array(256)
        for (let i = 0; i < 256; i++) {
            let c = i
            for (let j = 0; j < 8; j++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1))
            }
            crc32Table[i] = c
        }

        const getCrc32 = (buf) => {
            let crc = -1
            for (let i = 0; i < buf.length; i++) {
                crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xFF]
            }
            return (crc ^ -1) >>> 0
        }

        const getDosDateTime = (date) => {
            const y = date.getFullYear()
            const m = date.getMonth() + 1
            const d = date.getDate()
            const h = date.getHours()
            const min = date.getMinutes()
            const s = date.getSeconds()
            const dosTime = (h << 11) | (min << 5) | (s >> 1)
            const dosDate = ((y - 1980) << 9) | (m << 5) | d
            return { dosTime, dosDate }
        }

        const { dosTime, dosDate } = getDosDateTime(new Date())
        const textEncoder = new TextEncoder()
        const getBytes = (str) => textEncoder.encode(str)

        let localHeadersSize = 0
        let centralDirectorySize = 0

        this.files.forEach(f => {
            const nameBytes = getBytes(f.name)
            f.nameBytes = nameBytes
            f.crc = getCrc32(f.data)
            f.localHeaderOffset = localHeadersSize

            localHeadersSize += 30 + nameBytes.length + f.data.length
            centralDirectorySize += 46 + nameBytes.length
        })

        const totalSize = localHeadersSize + centralDirectorySize + 22
        const out = new Uint8Array(totalSize)
        let pos = 0

        const writeUint16 = (val) => {
            out[pos++] = val & 0xFF
            out[pos++] = (val >> 8) & 0xFF
        }

        const writeUint32 = (val) => {
            out[pos++] = val & 0xFF
            out[pos++] = (val >> 8) & 0xFF
            out[pos++] = (val >> 16) & 0xFF
            out[pos++] = (val >> 24) & 0xFF
        }

        const writeBytes = (bytes) => {
            out.set(bytes, pos)
            pos += bytes.length
        }

        this.files.forEach(f => {
            writeUint32(0x04034b50)
            writeUint16(10)
            writeUint16(0)
            writeUint16(0)
            writeUint16(dosTime)
            writeUint16(dosDate)
            writeUint32(f.crc)
            writeUint32(f.data.length)
            writeUint32(f.data.length)
            writeUint16(f.nameBytes.length)
            writeUint16(0)
            writeBytes(f.nameBytes)
            writeBytes(f.data)
        })

        const centralDirectoryOffset = pos

        this.files.forEach(f => {
            writeUint32(0x02014b50)
            writeUint16(20)
            writeUint16(10)
            writeUint16(0)
            writeUint16(0)
            writeUint16(dosTime)
            writeUint16(dosDate)
            writeUint32(f.crc)
            writeUint32(f.data.length)
            writeUint32(f.data.length)
            writeUint16(f.nameBytes.length)
            writeUint16(0)
            writeUint16(0)
            writeUint16(0)
            writeUint16(0)
            writeUint32(0)
            writeUint32(f.localHeaderOffset)
            writeBytes(f.nameBytes)
        })

        writeUint32(0x06054b50)
        writeUint16(0)
        writeUint16(0)
        writeUint16(this.files.length)
        writeUint16(this.files.length)
        writeUint32(centralDirectorySize)
        writeUint32(centralDirectoryOffset)
        writeUint16(0)

        return out
    }
}

let generateOfflineIndexHtml = (className, projects) => {
    let studentMap = new Map()
    projects.forEach(p => {
        let name = p.student || "(unknown)"
        if (!studentMap.has(name)) studentMap.set(name, [])
        studentMap.get(name).push(p)
    })

    let sectionsHtml = ""
    studentMap.forEach((items, student) => {
        let cards = items.map(it => {
            let imgHtml = it.thumbFilename ? `<img src="./${encodeURIComponent(it.thumbFilename)}" alt="${escapeHtml(it.name)}">` : `<div class="fallback-img">🧊</div>`
            let stlLink = it.stlFilename ? `<a class="btn" href="./${encodeURIComponent(it.stlFilename)}" download>Download STL</a>` : ""
            return `
            <div class="card">
                <div class="thumb-wrap">
                    ${imgHtml}
                </div>
                <div class="info">
                    <h3 class="proj-name">${escapeHtml(it.name)}</h3>
                    <div class="actions">
                        ${stlLink}
                        <a class="btn secondary" href="https://www.tinkercad.com/things/${it.id}" target="_blank">View on TinkerCAD ↗</a>
                    </div>
                </div>
            </div>
            `
        }).join("")

        sectionsHtml += `
        <section class="student-section">
            <h2 class="student-header">${escapeHtml(student)} (${items.length})</h2>
            <div class="grid">
                ${cards}
            </div>
        </section>
        `
    })

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(className)} - Classroom Portfolio</title>
    <style>
        body {
            font-family: 'Open Sans', Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #f8fafc;
            margin: 0;
            padding: 30px;
        }
        header {
            max-width: 1200px;
            margin: 0 auto 30px auto;
            background: #fff;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        h1 {
            margin: 0;
            font-size: 26px;
            color: #0f172a;
        }
        .meta {
            font-size: 14px;
            color: #64748b;
            text-align: right;
        }
        .student-section {
            max-width: 1200px;
            margin: 0 auto 40px auto;
        }
        .student-header {
            font-size: 18px;
            font-weight: 700;
            color: #4076c7;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 8px;
            margin-bottom: 16px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 20px;
        }
        .card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .thumb-wrap {
            height: 180px;
            background: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-bottom: 1px solid #e2e8f0;
        }
        .thumb-wrap img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .fallback-img {
            font-size: 48px;
        }
        .info {
            padding: 12px;
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            justify-content: space-between;
        }
        .proj-name {
            margin: 0 0 12px 0;
            font-size: 15px;
            font-weight: 600;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .actions {
            display: flex;
            gap: 8px;
        }
        .btn {
            flex: 1;
            text-align: center;
            padding: 8px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 6px;
            text-decoration: none;
            background: #4076c7;
            color: #fff;
            transition: background 0.15s;
        }
        .btn:hover {
            background: #325e9f;
        }
        .btn.secondary {
            background: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
        }
        .btn.secondary:hover {
            background: #e2e8f0;
        }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>Classroom Portfolio Showcase</h1>
            <div style="font-size: 14px; color: #475569; margin-top: 4px;">Class: ${escapeHtml(className)}</div>
        </div>
        <div class="meta">
            <div>Date Generated: ${new Date().toLocaleDateString()}</div>
            <div>Generated by TinkerCAD Assistant</div>
        </div>
    </header>
    ${sectionsHtml}
</body>
</html>
`
}

}

let exportPortfolioZip = (clazzID, activityID) => {
    let toast = createDownloadToast(1)
    toast.update({ done: 0, failed: 0, total: 1 })
    
    sasAllDataForClassActivity(clazzID, activityID, () => {
        get(clazzID, (fresh) => {
            let activity = fresh && fresh.activities && fresh.activities[activityID]
            let projects = (activity && activity.projects) || {}
            let className = (fresh && fresh.name) || "TinkerCAD"
            
            let jobs = []
            let projectsList = []
            
            for (let project of Object.values(projects)) {
                let student = fresh.students ? fresh.students[project.author] : null
                let username = sanitizeName(student ? student.name : project.author) || "Unknown"
                let cleanProjName = sanitizeName(project.name) || "Untitled"
                
                let folderName = `${username}`
                let stlFilename = `${folderName}/${cleanProjName}.stl`
                let thumbFilename = project.thumb ? `${folderName}/${cleanProjName}.png` : null
                
                jobs.push({
                    url: designDownloadUrl(project.id, "stl"),
                    path: stlFilename
                })
                
                if (project.thumb) {
                    jobs.push({
                        url: project.thumb,
                        path: thumbFilename
                    })
                }
                
                projectsList.push({
                    id: project.id,
                    name: project.name,
                    student: student ? student.name : project.author,
                    stlFilename,
                    thumbFilename
                })
            }
            
            if (jobs.length === 0) {
                alert("No projects to export")
                return
            }
            
            let batchId = `zip_${Date.now()}`
            
            let progressListener = (msg) => {
                if (msg.batchId !== batchId) return
                if (msg.type === 'TC_EXPORT_PROGRESS') {
                    toast.update({ done: msg.done, failed: msg.failed, total: msg.total })
                }
                if (msg.type === 'TC_EXPORT_DONE') {
                    chrome.runtime.onMessage.removeListener(progressListener)
                    toast.update({ done: msg.files.length, failed: jobs.length - msg.files.length, total: jobs.length })
                    
                    let zip = new SimpleZipWriter()
                    
                    msg.files.forEach(f => {
                        let binStr = atob(f.base64)
                        let len = binStr.length
                        let bytes = new Uint8Array(len)
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binStr.charCodeAt(i)
                        }
                        zip.addFile(f.path, bytes)
                    })
                    
                    let indexHtml = generateOfflineIndexHtml(className, projectsList)
                    let indexBytes = new TextEncoder().encode(indexHtml)
                    zip.addFile("index.html", indexBytes)
                    
                    let zipData = zip.generate()
                    let blob = new Blob([zipData], { type: "application/zip" })
                    let blobUrl = URL.createObjectURL(blob)
                    
                    let a = document.createElement("a")
                    a.href = blobUrl
                    a.download = `${sanitizeName(className)}_Showcase.zip`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
                    
                    toast.finish({ done: msg.files.length, failed: jobs.length - msg.files.length, total: jobs.length })
                }
            }
            
            chrome.runtime.onMessage.addListener(progressListener)
            
            chrome.runtime.sendMessage({
                type: 'TC_FETCH_BATCH',
                batchId,
                jobs
            })
        })
    }, true)
}

let analyticsViewEnable = () => {
    let prevPage = currentPage
    return enableView("analytics", (container) => {
        currentPage = Context.GENERAL
        
        let header = document.createElement("div")
        Object.assign(header.style, {
            display: "flex", alignItems: "center", gap: "12px", flex: "0 0 auto",
            padding: "12px 18px", boxSizing: "border-box", borderBottom: "1px solid #cbd5e1",
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        
        let titleEl = document.createElement("strong")
        titleEl.textContent = "Classroom Analytics"
        titleEl.style.fontSize = "18px"
        titleEl.style.color = "#0f172a"
        
        let mainContent = document.createElement("div")
        Object.assign(mainContent.style, {
            flex: "1", minHeight: "0", overflowY: "auto", padding: "24px",
            background: "#f8fafc", boxSizing: "border-box", fontFamily: "Open Sans, Helvetica, Arial, sans-serif"
        })
        
        container.appendChild(header)
        container.appendChild(mainContent)
        
        header.appendChild(bigButton("Back", () => {
            currentPage = prevPage
            disableView("analytics")
        }))
        header.appendChild(titleEl)
        
        let exportBtn = bigButton("Copy TSV for Excel", () => {})
        header.appendChild(exportBtn)
        
        mainContent.textContent = "Loading analytics data..."
        
        getCurrentClazz((clazz) => {
            if (!clazz) {
                mainContent.textContent = "Error loading classroom data."
                return
            }
            mainContent.innerHTML = ""
            
            let students = clazz.students || {}
            let activities = clazz.activities || {}
            
            let studentProjects = new Map()
            Object.values(students).forEach(s => {
                studentProjects.set(s.id, { student: s, projects: [] })
            })
            
            let allProjects = []
            for (let act of Object.values(activities)) {
                for (let proj of Object.values(act.projects || {})) {
                    allProjects.push(proj)
                    let author = proj.author
                    if (!studentProjects.has(author)) {
                        studentProjects.set(author, { student: { id: author, name: author }, projects: [] })
                    }
                    studentProjects.get(author).projects.push(proj)
                }
            }
            
            let now = Date.now()
            let oneWeek = 7 * 86400000
            let oneMonth = 30 * 86400000
            
            let activeCount = 0
            let idleCount = 0
            let inactiveCount = 0
            let totalProjects = allProjects.length
            
            let rowsData = []
            
            studentProjects.forEach((data, id) => {
                let s = data.student
                let projs = data.projects
                
                let lastMtime = 0
                projs.forEach(p => {
                    let mt = toMillis(p.mtime)
                    if (mt && mt > lastMtime) lastMtime = mt
                })
                
                let status = "Inactive"
                let badgeColor = "#ef4444"
                let badgeBg = "#fee2e2"
                
                if (lastMtime > 0) {
                    let diff = now - lastMtime
                    if (diff < oneWeek) {
                        status = "Active"
                        badgeColor = "#16a34a"
                        badgeBg = "#dcfce7"
                        activeCount++
                    } else if (diff < oneMonth) {
                        status = "Idle"
                        badgeColor = "#d97706"
                        badgeBg = "#fef3c7"
                        idleCount++
                    } else {
                        inactiveCount++
                    }
                } else {
                    inactiveCount++
                }
                
                rowsData.push({
                    name: s.name || s.username || id,
                    count: projs.length,
                    lastActive: lastMtime ? new Date(lastMtime).toLocaleString("pl-PL") : "Never",
                    lastMtime,
                    status,
                    badgeColor,
                    badgeBg
                })
            })
            
            rowsData.sort((a, b) => a.name.localeCompare(b.name))
            
            let summaryContainer = document.createElement("div")
            Object.assign(summaryContainer.style, {
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "20px", marginBottom: "30px"
            })
            
            let makeCard = (title, val, desc, color) => {
                let card = document.createElement("div")
                Object.assign(card.style, {
                    background: "#fff", padding: "20px", borderRadius: "12px",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
                    borderLeft: `5px solid ${color}`
                })
                let t = document.createElement("div")
                t.textContent = title
                t.style.fontSize = "13px"
                t.style.color = "#64748b"
                t.style.fontWeight = "600"
                t.style.textTransform = "uppercase"
                let v = document.createElement("div")
                v.textContent = val
                v.style.fontSize = "28px"
                v.style.fontWeight = "700"
                v.style.color = "#0f172a"
                v.style.margin = "8px 0"
                let d = document.createElement("div")
                d.textContent = desc
                d.style.fontSize = "12px"
                d.style.color = "#94a3b8"
                card.appendChild(t)
                card.appendChild(v)
                card.appendChild(d)
                return card
            }
            
            summaryContainer.appendChild(makeCard("Total Projects", totalProjects, "Designs created in this classroom", "#4076c7"))
            summaryContainer.appendChild(makeCard("Active Students", activeCount, "Modified project in the last 7 days", "#16a34a"))
            summaryContainer.appendChild(makeCard("Idle Students", idleCount, "Modified project in the last 30 days", "#d97706"))
            summaryContainer.appendChild(makeCard("Inactive Students", inactiveCount, "No recent modifications", "#ef4444"))
            
            mainContent.appendChild(summaryContainer)
            
            let timelineCard = document.createElement("div")
            Object.assign(timelineCard.style, {
                background: "#fff", padding: "20px", borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", marginBottom: "30px"
            })
            let timelineTitle = document.createElement("h3")
            timelineTitle.textContent = "Recent Classroom Activity (Past 14 Days)"
            timelineTitle.style.margin = "0 0 16px 0"
            timelineTitle.style.fontSize = "15px"
            timelineTitle.style.color = "#1f2937"
            timelineCard.appendChild(timelineTitle)
            
            let dayCounts = new Array(14).fill(0)
            let dayLabels = []
            for (let d = 13; d >= 0; d--) {
                let targetDate = new Date(now - d * 86400000)
                dayLabels.push(targetDate.toLocaleDateString("pl-PL", { day: 'numeric', month: 'short' }))
                
                let startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
                let endOfDay = startOfDay + 86400000
                
                allProjects.forEach(p => {
                    let mt = toMillis(p.mtime)
                    if (mt && mt >= startOfDay && mt < endOfDay) {
                        dayCounts[13 - d]++
                    }
                })
            }
            
            let maxCount = Math.max(...dayCounts, 1)
            let chartContainer = document.createElement("div")
            Object.assign(chartContainer.style, {
                display: "flex", justifyContent: "space-between", alignItems: "flex-end",
                height: "120px", gap: "10px", padding: "10px 0 0 0"
            })
            
            for (let i = 0; i < 14; i++) {
                let col = document.createElement("div")
                Object.assign(col.style, {
                    flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px"
                })
                
                let bar = document.createElement("div")
                let heightPct = Math.round((dayCounts[i] / maxCount) * 100)
                Object.assign(bar.style, {
                    width: "100%", height: `${heightPct}%`, background: "#4076c7",
                    borderRadius: "4px 4px 0 0", minHeight: dayCounts[i] > 0 ? "4px" : "0px",
                    transition: "height 0.3s ease", position: "relative"
                })
                bar.title = `${dayCounts[i]} modifications`
                
                let barVal = document.createElement("span")
                barVal.textContent = dayCounts[i] > 0 ? dayCounts[i] : ""
                barVal.style.fontSize = "10px"
                barVal.style.color = "#64748b"
                barVal.style.fontWeight = "600"
                
                let label = document.createElement("span")
                label.textContent = dayLabels[i]
                label.style.fontSize = "9px"
                label.style.color = "#94a3b8"
                label.style.whiteSpace = "nowrap"
                
                col.appendChild(barVal)
                col.appendChild(bar)
                col.appendChild(label)
                chartContainer.appendChild(col)
            }
            timelineCard.appendChild(chartContainer)
            mainContent.appendChild(timelineCard)
            
            let tableCard = document.createElement("div")
            Object.assign(tableCard.style, {
                background: "#fff", borderRadius: "12px", overflow: "hidden",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)"
            })
            
            let table = document.createElement("table")
            Object.assign(table.style, {
                width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left"
            })
            
            let thead = document.createElement("thead")
            thead.innerHTML = `
                <tr style="background: #f1f5f9; color: #475569; font-weight: 600; border-bottom: 1px solid #e2e8f0;">
                    <th style="padding: 12px 18px;">Student</th>
                    <th style="padding: 12px 18px; text-align: center;">Total Projects</th>
                    <th style="padding: 12px 18px;">Last Activity</th>
                    <th style="padding: 12px 18px;">Engagement Status</th>
                </tr>
            `
            table.appendChild(thead)
            
            let tbody = document.createElement("tbody")
            rowsData.forEach(row => {
                let tr = document.createElement("tr")
                tr.style.borderBottom = "1px solid #f1f5f9"
                tr.innerHTML = `
                    <td style="padding: 12px 18px; font-weight: 600; color: #1e293b;">${escapeHtml(row.name)}</td>
                    <td style="padding: 12px 18px; text-align: center; color: #334155;">${row.count}</td>
                    <td style="padding: 12px 18px; color: #475569;">${row.lastActive}</td>
                    <td style="padding: 12px 18px;">
                        <span style="background: ${row.badgeBg}; color: ${row.badgeColor}; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase;">
                            ${row.status}
                        </span>
                    </td>
                `
                tbody.appendChild(tr)
            })
            table.appendChild(tbody)
            tableCard.appendChild(table)
            mainContent.appendChild(tableCard)
            
            exportBtn.onclick = () => {
                let tsv = "Student\tTotal Projects\tLast Activity\tEngagement Status\n"
                rowsData.forEach(row => {
                    tsv += `${row.name}\t${row.count}\t${row.lastActive}\t${row.status}\n`
                })
                fallbackCopy(tsv)
                showNotice("Analytics copied to clipboard!", "ok")
            }
        })
    }, () => {})
}

/** Floating, bottom-right container that stacks per-batch download toasts. */
let downloadToastContainer = null
let ensureToastContainer = () => {
    if (downloadToastContainer && document.body.contains(downloadToastContainer)) return downloadToastContainer
    downloadToastContainer = document.createElement("div")
    downloadToastContainer.id = "tcaDownloadToasts"
    Object.assign(downloadToastContainer.style, {
        position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
        display: "flex", flexDirection: "column", gap: "8px",
        fontFamily: "Open Sans, Helvetica, Arial, sans-serif", pointerEvents: "none"
    })
    document.body.appendChild(downloadToastContainer)
    return downloadToastContainer
}

/** Creates a live progress toast for one download batch. */
let createDownloadToast = (total) => {
    let toast = document.createElement("div")
    Object.assign(toast.style, {
        background: "#2c2c2c", color: "#fff", padding: "12px 14px", borderRadius: "10px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)", width: "260px", fontSize: "13px"
    })
    let label = document.createElement("div")
    Object.assign(label.style, {marginBottom: "8px", fontWeight: "600"})
    label.textContent = `Downloading… 0/${total}`
    let barOuter = document.createElement("div")
    Object.assign(barOuter.style, {height: "6px", borderRadius: "3px", background: "#555", overflow: "hidden"})
    let barInner = document.createElement("div")
    Object.assign(barInner.style, {height: "100%", width: "0%", background: "#4076c7", transition: "width 0.2s ease"})
    barOuter.appendChild(barInner)
    toast.appendChild(label)
    toast.appendChild(barOuter)
    ensureToastContainer().appendChild(toast)

    let setPct = (done, failed, t) => {
        let n = t || total
        barInner.style.width = `${n ? Math.round(((done + failed) / n) * 100) : 0}%`
    }
    return {
        update: (msg) => {
            setPct(msg.done, msg.failed, msg.total)
            label.textContent = `Downloading… ${msg.done + msg.failed}/${msg.total || total}` + (msg.failed ? ` (errors: ${msg.failed})` : "")
        },
        finish: (res) => {
            setPct(res.done, res.failed, res.total)
            barInner.style.width = "100%"
            if (res.failed) {
                barInner.style.background = "#c74040"
                label.textContent = `⚠ Downloaded ${res.done}/${res.total} (errors: ${res.failed})`
            } else {
                barInner.style.background = "#3fa75a"
                label.textContent = `✓ Downloaded ${res.done}/${res.total}`
            }
            setTimeout(() => {
                toast.style.transition = "opacity 0.4s ease"
                toast.style.opacity = "0"
                setTimeout(() => toast.remove(), 400)
            }, res.failed ? 6000 : 3000)
        }
    }
}

/**
 * Download queue client. Hands a batch of {url, filename} jobs to the service
 * worker, which runs them with bounded concurrency + automatic retries and
 * reports progress / completion back here, shown live in a toast.
 */
let pendingBatches = {}
let downloadBatch = (jobs, onProgress = () => {
}, onDone = () => {
}) => {
    if (!isActive() || !jobs || jobs.length === 0) {
        onDone({total: 0, done: 0, failed: 0, failures: []})
        return
    }
    let batchId = `b${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let toast = createDownloadToast(jobs.length)
    pendingBatches[batchId] = {
        onProgress: (msg) => {
            toast.update(msg)
            onProgress(msg)
        },
        onDone: (msg) => {
            toast.finish(msg)
            onDone(msg)
        }
    }
    chrome.runtime.sendMessage({type: 'TC_DOWNLOAD_BATCH', batchId, jobs})
}
chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.batchId || !pendingBatches[msg.batchId]) return
    if (msg.type === 'TC_DL_PROGRESS') pendingBatches[msg.batchId].onProgress(msg)
    if (msg.type === 'TC_DL_BATCH_DONE') {
        pendingBatches[msg.batchId].onDone(msg)
        delete pendingBatches[msg.batchId]
    }
})
let openTab = (url) => {
    if (isActive()) chrome.runtime.sendMessage({type: 'TC_OPEN_TAB', url, active: false})
}

/** Small transient toast for status / error messages (reuses the toast stack). */
let showNotice = (text, kind = "info") => {
    let colors = {info: "#2c2c2c", error: "#c74040", ok: "#3fa75a"}
    let n = document.createElement("div")
    Object.assign(n.style, {
        background: colors[kind] || colors.info, color: "#fff", padding: "12px 14px",
        borderRadius: "10px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: "320px",
        fontSize: "13px", fontFamily: "Open Sans, Helvetica, Arial, sans-serif", pointerEvents: "none"
    })
    n.textContent = text
    ensureToastContainer().appendChild(n)
    setTimeout(() => {
        n.style.transition = "opacity 0.4s ease"
        n.style.opacity = "0"
        setTimeout(() => n.remove(), 400)
    }, 6000)
}

/** Centralised API-error handler: logs, and shows a one-off notice on expired session. */
let sessionNoticeShown = false
let tcApiError = (e, what) => {
    console.warn(`[tcApi] Failed to fetch ${what}:`, e && e.message)
    if (e && (e.status === 401 || e.status === 403) && !sessionNoticeShown) {
        sessionNoticeShown = true
        showNotice("TinkerCAD session expired — reload the page and sign in again.", "error")
        setTimeout(() => {
            sessionNoticeShown = false
        }, 30000)
    }
}

/**
 * Resolve the download folder + file base for a single design card, using the
 * current classroom/activity in the URL.
 *  - folder:   "{year}W{week} {class name}"   (falls back to "...TinkerCAD")
 *  - fileBase: "{student name} {project name}" (falls back to just project name)
 * Loads class data on demand (cached after first time).
 */
let resolveDownloadTarget = (id, name, onReady) => {
    let activityMatch = /\/classrooms\/(\w+)\/activities\/(\w+)/.exec(window.location.href)
    if (!activityMatch) {
        let classMatch = /\/classrooms\/(\w+)/.exec(window.location.href)
        if (!classMatch) {
            onReady(downloadFolder("TinkerCAD"), sanitizeName(name), null)
            return
        }
        // Class-level designs page (/classrooms/{id}/designs) — no activity in the
        // URL. Load the whole class (students + all activity designs) and find
        // this design by id, reusing the proven proj.name path from the activity
        // page. Fall back to the single-design detail endpoint if it isn't tied
        // to a stored activity (e.g. a teacher template).
        let clazzID = classMatch[1]
        sasAllDataForClass(clazzID, () => {
            get(clazzID, (clazz) => {
                let folder = downloadFolder((clazz && clazz.name) || "TinkerCAD")
                let proj = null
                for (const act of Object.values((clazz && clazz.activities) || {})) {
                    if (act.projects && act.projects[id]) {
                        proj = act.projects[id]
                        break
                    }
                }
                if (proj) {
                    let student = (clazz.students || {})[proj.author]
                    let username = student ? student.name : proj.author
                    onReady(folder, downloadFileBase(username, proj.name), proj)
                    return
                }
                tcApi.design(id).then((d) => {
                    console.log("[tcApi.design] not in stored activities; raw detail:", d)
                    let projectName = (d && (d.description || d.name || d.title ||
                        (d.thing && (d.thing.description || d.thing.name)))) || name
                    onReady(folder, sanitizeName(projectName), {thumb: designThumbUrl(d)})
                }).catch(() => onReady(folder, sanitizeName(name), null))
            })
        }, false)
        return
    }
    let clazzID = activityMatch[1]
    let activityID = activityMatch[2]
    sasAllDataForClassActivity(clazzID, activityID, () => {
        get(clazzID, (clazz) => {
            let folder = downloadFolder((clazz && clazz.name) || "TinkerCAD")
            let projects = clazz && clazz.activities && clazz.activities[activityID] && clazz.activities[activityID].projects
            let proj = projects && projects[id]
            // The card's h3 is the author/student, not the project — prefer the
            // project name stored from the API (design.description).
            let projectName = (proj && proj.name) || name
            let username = null
            if (proj) {
                let student = (clazz.students || {})[proj.author]
                username = student ? student.name : proj.author
            }
            onReady(folder, username ? downloadFileBase(username, projectName) : sanitizeName(projectName), proj || null)
        })
    }, false)
}

/**
 * Retrieves a clazz from storage an item based on id.
 * @param id ID of the item that was stored
 * @param onComplete Action run on completion
 */
let get = (id, onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else {
            store = data.storage
        }
        onComplete(store[id])

    })
}


/**
 * Retrieve all class IDS
 * @param onComplete Callback including all of the keys
 */
let getKeys = (onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else {
            store = data.storage
        }
        onComplete(Object.keys(store))
    })
}

/**
 * USE WITH CAUTION, or better yet use the modify function to safely modify items!
 * Set item inside storage using an Id
 * @param id ID of the item that was stored
 * @param value The value to set it to
 * @param onComplete Action run on completion
 */
let unsafeSet = (id, value, onComplete) => {
    if (!isActive()) {

        return
    }
    chrome.storage.local.get(["storage"], (data) => {
        let store
        if (!data.storage) {
            store = {}
        } else store = data.storage
        {
            store[id] = value
        }

        chrome.storage.local.set({storage: store}, (data) => {
            onComplete()
        })
    })
}
/**
 * USE WITH CAUTION, or better yet use the modify function to safely modify items!
 * Modify an item inside storage using an Id
 * @param id ID of the item that was stored
 * @param map Modification to run on item
 * @param onComplete Action run on completion
 */
let unSafeModify = (id, map, onComplete) => {
    get(id, (data) => {
        let d
        if (!data) {
            d = {}
        } else {
            d = data
        }

        map(d)
        unsafeSet(id, d, onComplete)

    })
}
let queue = []
/**
 * Recursive function used in conjunction with the queue and modify system.
 * Please avoid calling this method unless you are certain you know what you are doing :)
 * @param obj
 */
let recursive = (obj) => {
    unSafeModify(obj.id, obj.map, () => {
        obj.onComplete()
        queue.shift()
        if (queue.length !== 0) recursive(queue[0])
    })
}
/**
 * Modify an item safely that is inside of the database / add it if it does not exist
 * @param id ID of item that should be modified
 * @param map Modification to make on item
 * @param onComplete Run on completion
 */
let modify = (id, map, onComplete = () => {
}) => {
    queue.push({id: id, map: map, onComplete: onComplete})
    if (queue.length === 1) recursive(queue[0])
}


/**
 * Big button used by TinkerCAD
 * @param text Text that should be inside the big button
 * @param onclick Function called on click of the button
 * @returns {HTMLButtonElement} Returns a big button used in TinkerCAD
 */
let bigButton = (text, onclick) => {
    const button = document.createElement("button");
    button.textContent = text
    button.onclick = onclick
    button.classList.add("btn", "activities", "btn-white")
    button.style.height = "40px"
    button.style.overflow = "hidden"
    button.style.textOverflow = "ellipsis"
    button.style.whiteSpace = "nowrap"
    button.style.fontFamily = "Open Sans, Helvetica, Arial, sans-serif"
    button.textContent = text
    button.onclick = onclick
    return button
}
let lazyDownloadAllButton = (format, itemFunction) => {
    return bigButton(`Download ${format}s`, () => {
        itemFunction((directoryName, projects) => {
            let jobs = Object.values(projects).map((project) => ({
                url: designDownloadUrl(project.id, format),
                filename: `${directoryName}/${project.downloadName}.${downloadExt(format)}`
            }))
            if (jobs.length === 0) {
                alert("No projects to download")
                return
            }
            downloadBatch(jobs)
        })

    })
}

/** Bulk download of project thumbnails (PNG) for an activity/class. */
let lazyDownloadAllThumbnailsButton = (itemFunction) => {
    return bigButton("Download thumbnails", () => {
        itemFunction((directoryName, projects) => {
            let jobs = Object.values(projects)
                .filter((p) => p.thumb)
                .map((p) => ({
                    url: p.thumb,
                    filename: `${directoryName}/${p.downloadName}.png`
                }))
            if (jobs.length === 0) {
                alert("No thumbnails to download")
                return
            }
            downloadBatch(jobs)
        })
    })
}

// downloadAllButton removed — superseded by lazyDownloadAllButton + the
// service-worker download queue (concurrency + automatic retries).


/**
 * Small button used by TinkerCAD
 * @param text Text that should be inside the big button
 * @param onclick Function called on click of the button
 * @returns {HTMLButtonElement} Returns a big button used in TinkerCAD
 */
let smallButton = (text, onclick) => {
    const button = document.createElement("button");
    button.textContent = text
    button.onclick = onclick
    button.classList.add("btn", "btn-primary", "tinkerButton")
    button.style.padding = "10px"
    button.style.marginTop = "5px"

    button.style.fontFamily = "Open Sans, Helvetica, Arial, sans-serif"
    button.textContent = text
    button.onclick = onclick
    return button
}
let smallButton2 = (text, onclick) => {
    const button = document.createElement("button");
    button.textContent = text
    button.onclick = onclick
    button.classList.add("button-md")
    button.style.background = "#1477d1"

    button.textContent = text
    button.onclick = onclick
    return button
}


let currentPage = Context.GENERAL
/**
 * Await for a condition to occur to then run another function.
 * @param condition A function that will determine if can complete.
 * @param onComplete The function to run once condition is met.
 * @param delay Delay in MS to wait before checking again.
 * */
let awaitResult = (condition, onComplete, delay = 1000, isCancelled = () => false) => {

    setTimeout(() => {
        if (isCancelled()) return
        let state = condition()
        if (!state) {
            return awaitResult(condition, onComplete, delay, isCancelled)
        }

        return onComplete()

    }, delay)
}


let elementListeners = {}

/**
 * Wait for an element to load into the DOM to later be manipulated.
 * @param selector Selector of item to wait for.
 * @param id ID of element that is added
 * @param onComplete Action run on completion.
 * @param delay Delay to wait between checks.
 * @param context Context that we should wait inside for.
 */
let onElementLoad = (selector, id, onComplete, delay = 300, context = Context.GENERAL) => {

    if (!elementListeners[context]) elementListeners[context] = {}
    elementListeners[context][id] = () => {
        awaitResult(() => {


            if (currentPage !== context) return

            return document.querySelector(selector) !== undefined && document.querySelector(selector) !== null
        }, () => {
            onComplete(document.querySelector(selector))
        }, delay)
    }


}

/**
 * Listen when an element in the DOM loads to later manipulate. Listens only in specific specified contexts.
 * @param generalSelector Selector of element to wait for.
 * @param id ID of what is going to be added.
 * @param action Manipulation of what was scraped.
 * @param delay Delay in MS of how long to wait between runs
 * @param context Context to run in, see [Page] for reference.
 */
let onElementsLoad = (generalSelector, id, action, delay = 300, context = Context.GENERAL) => {
    onElementLoad(generalSelector, id, () => {
        for (let item of document.querySelectorAll(generalSelector)) {
            action(item)
        }

    }, delay, context)

}
/**
 * Update which listeners should be running. (THIS DOES NOT DEACTIVATE THEM! however, they automatically shut down if they are loaded in the wrong context :))
 */

let updateActiveListeners = () => {
    console.log(`Moved to context of :${currentPage}, now updating all matching elements!`)
    for (let contextID of Object.keys(elementListeners)) {
        if (currentPage !== contextID) continue

        let context = elementListeners[contextID]

        for (let listener of Object.values(context)) {
            listener()

        }


    }
}
/**
 * Retrieve the current url the page is at
 * @param onComplete Callback called when url is found
 * @param delay Delay to wait between checks
 */
let getCurrentURL = (onComplete) => {
    onComplete(window.location.href)
}
let activityRegex = /^https:\/\/www\.tinkercad\.com\/classrooms\/.+\/activities\/.+$/gm
let tinkerCADURL = /^https:\/\/www\.tinkercad\.com.*$/gm
let classesRegex = /^https:\/\/www\.tinkercad\.com\/dashboard\/classes(\?.*)?$/gm
let activitiesRegex = /^https:\/\/www\.tinkercad\.com\/classrooms\/.+\/activities(\?.*)?$/gm


/**
 * This is a listener that listens to when the URL is changed!
 * Add actual logic needed here :)
 */
let first = true
let lastURL = null
let onURLChange = () => {
    setTimeout(() => {
        let url = window.location.href
        if ((url !== lastURL) || first) {
            if (url.match(tinkerCADURL)) {
                if (url.match(activityRegex)) {
                    currentPage = Context.ACTIVITY
                } else if (url.match(classesRegex)) {
                    currentPage = Context.CLASSES
                } else if (url.match(activitiesRegex)) {
                    currentPage = Context.ACTIVITIES
                } else {
                    currentPage = Context.GENERAL
                }
                lastURL = url
                updateActiveListeners()
                first = false
            }
        }
        onURLChange()
    }, 1000)
}
onURLChange()


/**
 * Utility to make sure the extension is still not reloaded to prevent the extension once reloaded not throwing exceptions :)
 * @param message Weather a message should be sent when this happens
 * @returns Returns if it is active or not.
 */
let isActive = (message = false) => {
    if (message) console.log("Extension was reloaded, no exception thrown")
    return chrome.runtime?.id

}
/**
 * Download a project
 * @param project Download object, see example objects for example.
 * @param directoryName Name of directory that the items will be downloaded to
 * @param format Format to download the items as (STL OBJ etc)
 * @param onComplete Callback run once download complete.
 */
let download = (project, directoryName, format, onComplete = () => {
}) => {
    downloadBatch([{
        url: designDownloadUrl(project.id, format),
        filename: `${directoryName}/${project.downloadName}.${downloadExt(format)}`
    }], () => {
    }, () => onComplete())
}


// iframe-based scraping (collect / collectOne / basicCollectOne) removed —
// data now comes from tcApi (REST). The visual gallery/teacher iframes that
// render a design's 3D editor live in their own view code below.


/**
 * UAS Based action that stores the basic list of classes.
 * NOTE: Please use this function before any other UAS operations since this builds the foundation for everything.
 * @param onComplete Run once the data has been collected.
 */
let sasGeneralClasses = (onComplete = () => {
}) => {
    tcApi.classes().then((groups) => {
        if (!groups || groups.length === 0) {
            onComplete()
            return
        }
        let i = 0
        for (let group of groups) {
            modify(group.id, (data) => {
                data.id = group.id
                data.name = group.name
                data.code = group.code
                data.coteacherCode = group.coteacher_code
                data.memberCount = group.number_members
            }, () => {
                if (++i >= groups.length) onComplete()
            })
        }
    }).catch((e) => {
        tcApiError(e, "classes")
        onComplete()
    })
}


/**
 * UAS Based action to store the activities of a class
 * @param clazzID ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasClassActivitiesOf = (clazzID, onComplete = () => {
}, force = false) => {
    get(clazzID, (data) => {

        if (data && data.activities && !force) {
            onComplete()
            console.log("All activities are up to date!")
            return
        }

        tcApi.activities(clazzID).then((results) => {
            modify(clazzID, (clazz) => {
                if (!clazz.activities) clazz.activities = {}
                for (let result of results) {
                    if (!clazz.activities[result.id]) {
                        clazz.activities[result.id] = {id: result.id, name: result.name}
                    } else {
                        clazz.activities[result.id].name = result.name
                    }
                }
            }, onComplete)
            console.log(`Filling in activities for class of ${clazzID}`)
        }).catch((e) => {
            tcApiError(e, "activities")
            onComplete()
        })

    })


}
document.addEventListener('keydown', (event) => {
    if (event.shiftKey) {
        for (const elem of document.querySelectorAll('.actions')) {
            elem.style.display = "initial"
        }
    }
})
document.addEventListener('keyup', (event) => {
    if (!event.shiftKey) {
        for (const elem of document.querySelectorAll('.actions')) {
            elem.style.display = "none"
        }
    }
})
// let sasGetPrinterInformation = (projectID) => {
//
//     let f = document.createElement('iframe')
//     f.src = "https://api-reader.tinkercad.com/designs/detail/cLe5l6nECEG"
//     f.id = "finder"
//     document.querySelector("body").appendChild(f)
//     console.log(f.contentWindow)
//
// }
// sasGetPrinterInformation("cLe5l6nECEG")

let projectIDRegex = /\/things\/(.{11})/gm
/**
 * UAS Based action to store the projects of an activity
 * @param clazz ID of class
 * @param activity ID of activity
 * @param onComplete Run once complete.
 * @param force Weather this action should be run overriding old data
 */
let sasGetProjectsOfActivity = (clazz, activity, onComplete = () => {
}, force = false) => {
    get(clazz, (data) => {
        if (data && data.activities && data.activities[activity] && data.activities[activity].projects && !force) {
            onComplete()
            console.log("All activities are up to date!")
            return
        }

        tcApi.designs(clazz, activity).then((designs) => {
            modify(clazz, (data) => {
                if (!data.activities) data.activities = {}
                if (!data.activities[activity]) data.activities[activity] = {id: activity}
                data.activities[activity].projects = {}
                if (!data.activities[activity].ogFiles) data.activities[activity].ogFiles = {}
                for (let design of designs) {
                    let id = design.id || design.thingId
                    if (!id) continue
                    data.activities[activity].projects[id] = {
                        id: id,
                        name: design.description || design.name || design.title || `Project ${id}`,
                        author: String(design.user_id || design.userId || ""),
                        tags: design.asm_tags || null,
                        printDescription: design.asm_description || null,
                        thumb: (design.thumbnail_json && (
                            (design.thumbnail_json.detailThumb && design.thumbnail_json.detailThumb.url) ||
                            (design.thumbnail_json.filmstrip && design.thumbnail_json.filmstrip.url))) || null,
                        mtime: design.mtime || null
                    }
                }
            }, onComplete)
            console.log(`Filling in all of the projects of the activity of ${activity}`)
        }).catch((e) => {
            tcApiError(e, "activity designs")
            onComplete()
        })

    })


}

/**
 * UAS Based action to store the projects of all the activities of a class
 * @param clazz ID of class
 * @param onComplete Run once complete.
 * @param force Weather this action should be run overriding old data
 */
let sasGetAllProjectsOfActivitiesOfClazz = (clazz, onComplete = () => {
}, force = false) => {
    get(clazz, (data) => {
        if (data.projects && !force) {
            onComplete()
            console.log("All students are up to date!")
            return
        }
        let i = 0
        let items = Object.values(data.activities)
        for (let activity of items) {

            sasGetProjectsOfActivity(clazz, activity.id, () => {
                if (++i >= items.length) onComplete()
            }, force)
        }
    })
}


/**
 * UAS Based action to store the students of a class
 * @param id ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasStudentsAndClassCodeOf = (id, onComplete = () => {
}, force = false) => {
    get(id, (data) => {
        if (data && data.students && !force) {
            onComplete()
            console.log("All students are up to date!")
            return
        }
        tcApi.members(id).then((members) => {
            modify(id, (data) => {
                if (!data.students) data.students = {}
                for (let m of members) {
                    let sid = String(m.user_id || m.userId || m.member_id || m.id || "")
                    if (!sid) continue
                    data.students[sid] = {
                        id: sid,
                        name: m.name || m.screen_name || m.identifier || "not-found",
                        username: m.screen_name || m.name || "not-found",
                        badgeCount: String((m.badges != null ? m.badges : (m.badge_count != null ? m.badge_count : (m.numberBadges != null ? m.numberBadges : 0))))
                    }
                }
            }, () => {
                // Join code lives on the group object, not the roster — backfill if missing.
                get(id, (cur) => {
                    if (cur && cur.code) {
                        onComplete()
                        return
                    }
                    tcApi.classById(id).then((group) => {
                        if (!group) {
                            onComplete()
                            return
                        }
                        modify(id, (d) => {
                            d.code = group.code
                            d.name = d.name || group.name
                            d.coteacherCode = group.coteacher_code
                        }, onComplete)
                    }).catch(() => onComplete())
                })
            })
        }).catch((e) => {
            tcApiError(e, "students")
            onComplete()
        })
    })

}


const UpdateItems = Object.freeze({
    STUDENTS: "students",

})


/**
 * UASR Based action to store all of a classroom's data.
 * @param id ID of class
 * @param onComplete Run once complete.
 * @param force
 */
let sasAllDataForClass = (id, onComplete = () => {
}, force = false) => {
    sasStudentsAndClassCodeOf(id, () => {
        sasClassActivitiesOf(id, () => {
            sasGetAllProjectsOfActivitiesOfClazz(id, onComplete, force)
        }, force)
    }, force)
}
/**
 * UASR Based action to store all of data needed by an activity.
 * @param id ID of class
 * @param activity
 * @param onComplete Run once complete.
 * @param force
 */
let sasAllDataForClassActivity = (id, activity, onComplete = () => {
}, force = false) => {
    sasStudentsAndClassCodeOf(id, () => {
        sasClassActivitiesOf(id, () => {
            sasGetProjectsOfActivity(id, activity, onComplete, force)
        }, force)
    }, force)
}


/**
 * Returns the current user that is logged in.
 * @returns {string}
 */
let getCurrentUser = (onRetrieve) => {
    tcApi.myUserId().then((uid) => onRetrieve(uid)).catch((e) => {
        tcApiError(e, "user")
    })
}

/**
 * UASR Based action to store all data of all classrooms (Good for initial setup :))
 */
let usasAllData = (onComplete = () => {
}) => {
    sasGeneralClasses(() => {

        getKeys((clazzIds) => {
            if (!clazzIds.length) {
                onComplete()
                return
            }
            let i = 0
            for (let key of clazzIds) {
                sasAllDataForClass(key, () => {
                    if (++i >= clazzIds.length) onComplete()
                })
            }
        })
    })

}
/**
 * Run general update sequence on storage.
 * Checking in general items that have never been adding them adding them.
 * This does not completely rebuild the storage.
 */
let updateStorage = (onComplete = () => {
}) => {
    if (!isActive()) {
        onComplete()
        return
    }
    chrome.storage.local.get("user", (user) => {
        getCurrentUser((username) => {
            if (user.user !== username) {
                console.log("Attempting to rebuild storage cache!")
                chrome.storage.local.clear(() => {
                    chrome.storage.local.set({user: username}, () => {
                        console.log(`Signed-In User changed! Rebuilding Cache`)
                        updateStorage(onComplete)
                    })
                })
                return
            }
            usasAllData(onComplete)


        })

    })


}
let views = {}

let enableView = (id, enable, disable) => {
    // The view is a fixed full-screen overlay, so hiding #main is optional;
    // guard it because some pages (e.g. /dashboard/classes) have no #main.
    let og = document.querySelector("#main")
    if (og) og.style.display = "none"
    views[id] = {id: id, enable: enable, disable: disable}
    let container = document.createElement("div")
    container.classList.add("view")
    Object.assign(container.style, {
        position: "fixed", inset: "0", zIndex: "2147483640",
        display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff"
    })
    document.body.appendChild(container)
    enable(container)

}

let disableView = (id) => {
    let og = document.querySelector("#main")
    if (og) og.style.display = "block"

    for (let item of document.querySelectorAll(".view")) {
        console.log(`Disabled view: ${id}`)
        item.remove()
    }
    views[id].disable()
}

function contains_heb(str) {
    return (/[\u0590-\u05FF]/).test(str);
}

let printerViewEnable = () => {
    let prevPage = currentPage
    return enableView("printer", (container) => {
        currentPage = Context.PRINTER
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

    <script>
        window.addEventListener('load', () => {
            setTimeout(() => {
                window.print();
            }, 600);
        });
    <\/script>
</body>
</html>
            `
            win.document.write(html)
            win.document.close()
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
            width: 220px;
            height: 165px;
            background: #f1f5f9;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
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
            flex-grow: 1;
            min-width: 0;
        }
        .project-name {
            font-weight: 700;
            font-size: 18px;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #0f172a;
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

    <script>
        window.addEventListener('load', () => {
            setTimeout(() => {
                window.print();
            }, 600);
        });
    <\/script>
</body>
</html>
            `
            win.document.write(html)
            win.document.close()
        }

        // ── Header controls ─────────────────────────────────────────
        header.appendChild(bigButton("Back", () => {
            currentPage = prevPage
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
        header.appendChild(bigButton("Clear", () => clearAll()))
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
let galleryViewEnable = (projects = null) => {
    let prevPage = currentPage
    return enableView("gallery", (container) => {
        currentPage = Context.GALLERY
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
                if (active && mode === "3d" && currentPage === Context.GALLERY && doc) {
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
                if (paused || !active || currentPage !== Context.GALLERY) return
                let ms = ((data && data.speed != null) ? 6 - Number(data.speed) : 3) * 10000
                void progressFill.offsetWidth // force reflow so the animation restarts
                progressFill.style.transition = `width ${ms}ms linear`
                progressFill.style.width = "100%"
                timer = setTimeout(() => {
                    if (paused || !active || currentPage !== Context.GALLERY) return
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
            currentPage = prevPage
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


let teacherViewEnable = () => enableView("teacher", (container) => {
    currentPage = Context.TEACHER
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
                    if (!active || currentPage !== Context.TEACHER || autoId !== id) return
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
            if (!active || currentPage !== Context.TEACHER) return
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
            currentPage = Context.ACTIVITY
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
                if (!active || currentPage !== Context.TEACHER) return
                refresh()
                pollLoop()
            }, 30000)
        }

        load()
        pollLoop()
    })

}, () => {
})


/**
 * finds the id of the class that is currently on screen in
 * @param onFound Callback called in including id of the class
 */
let getCurrentClazzID = (onFound) => {
    getCurrentURL((data) => {
        let clazzRegex = /(https:\/\/www\.tinkercad\.com\/classrooms\/)(\w+)\/?(.+)*\/(\w+)/gm
        let v = clazzRegex.exec(data)
        if (!v) {
            console.warn("[tca] No classroom id in URL:", data)
            return
        }
        onFound(v[2])

    }, 100)
}

/**
 * finds the id of the activity that is currently on screen in
 * @param onFound
 */
let getCurrentActivityAndClassID = (onFound) => {
    let clazzRegex = /(https:\/\/www\.tinkercad\.com\/classrooms\/)(\w+)\/?(.+)*\/(\w+)/gm

    getCurrentURL((data) => {
        let d = clazzRegex.exec(data)
        if (!d) {
            console.warn("[tca] No classroom/activity id in URL:", data)
            return
        }
        onFound(d[2], d[4])
    }, 100)
}
let getCurrentClazz = (onFound) => {
    getCurrentClazzID((clazzId) => {
        get(clazzId, (clazz) => {
            onFound(clazz)
        })
    })
}
let getCurrentActivity = (onFound) => {
    getCurrentActivityAndClassID((clazzID, activityID) => {
        get(clazzID, (clazz) => {
            onFound(clazz.activities[activityID])
        })
    })
}


let main = () => {

    /**
     * Implementation of TinkerCAD assistant actual look and feel from here on :)
     */
    onElementLoad(".left-actions", "gallery", (container) => {
        let elem = smallButton2("Gallery", () => {
            galleryViewEnable()
        })
        let target = container.querySelector("#newClassButton")
        if (target) {
            target.insertAdjacentElement('afterend', elem)
        } else {
            container.appendChild(elem)
        }

    }, 500, Context.CLASSES)

    onElementLoad(".left-actions", "prints", (container) => {
        let elem = smallButton2("Print Manager", () => {
            printerViewEnable()
        })
        let target = container.querySelector("#newClassButton")
        if (target) {
            target.insertAdjacentElement('afterend', elem)
        } else {
            container.appendChild(elem)
        }

    }, 500, Context.CLASSES)

    let easyTools = (context) => {
        onElementsLoad(".thing-box", "border", (item) => {
            if (item.dataset.tcaButtons === "1") return
            let container = document.createElement("div")
            container.style.padding = "3px"
            container.style.display = "flex"
            container.style.alignItems = "center"
            container.style.justifyContent = "center"
            let id = item.querySelector("a").href?.match(projectIDRegex)?.[0]?.replace("/things/", "")
            if (!id) return
            item.dataset.tcaButtons = "1"
            let name = item.querySelector("h3").textContent

            let button = (text, onClick) => {
                let b = smallButton(text, onClick)
                b.style.padding = "4px"
                b.style.margin = "3px"
                b.style.fontSize = "14px"
                b.classList.add("actions")
                b.style.display = "none"
                container.appendChild(b)
            }

            button("Tinker this", () => {
                openTab(`https://www.tinkercad.com/things/${id}/edit`)
            })
            button("STL", () => {
                resolveDownloadTarget(id, name, (folder, fileBase) => {
                    download({id: id, downloadName: fileBase}, folder, "stl", () => {
                    })
                })
            })
            button("OBJ", () => {
                resolveDownloadTarget(id, name, (folder, fileBase) => {
                    download({id: id, downloadName: fileBase}, folder, "obj", () => {
                    })
                })
            })
            button("PNG", () => {
                resolveDownloadTarget(id, name, (folder, fileBase, proj) => {
                    let url = (proj && proj.thumb) || item.querySelector(".thumbnail img")?.src
                    if (!url) {
                        alert("No thumbnail for this project")
                        return
                    }
                    downloadBatch([{url: url, filename: `${folder}/${fileBase}.png`}])
                })
            })
            // container.style.border = "2px solid #FFD700"

            item.querySelector(".thumbnail").insertAdjacentElement("beforebegin", container)

        }, 3000, context)

    }
    easyTools(Context.GENERAL)
    easyTools(Context.ACTIVITY)

    onElementLoad(".class-projects-list-toolbar", "gallery", (container) => {
        let elem = bigButton("Gallery", () => {
            getCurrentClazz((clazz) => {
                let items = []
                for (const activities of Object.values((clazz && clazz.activities) || {})) {
                    for (const project of Object.values(activities.projects || {})) {
                        items.push(toGalleryItem(project, clazz))
                    }
                }
                galleryViewEnable(items)
            })


        })
        let elemAnalytics = bigButton("Analytics", () => {
            analyticsViewEnable()
        })
        let header = document.querySelector(".class-projects-list-toolbar")
        header.style.display = "flex"
        elem.style.marginLeft = "5px"
        elemAnalytics.style.marginLeft = "5px"
        header.appendChild(elem)
        header.appendChild(elemAnalytics)


    }, 500, Context.ACTIVITIES)

    onElementsLoad(".project-toolbar-top", "downloadButtons", (item) => {
        let elem = item.querySelector(".btn-group")
        elem.appendChild(bigButton("Teacher view", () => {
            teacherViewEnable()
        }))

        elem.appendChild(bigButton("Gallery", () => {
            getCurrentActivityAndClassID((clazzID, activityID) => {
                get(clazzID, (clazz) => {
                    let act = ((clazz && clazz.activities) || {})[activityID] || {}
                    let items = Object.values(act.projects || {}).map((p) => toGalleryItem(p, clazz))
                    galleryViewEnable(items)
                })
            })
        }))

        getCurrentActivityAndClassID((clazzID, activityID) => {
            get(clazzID, (clazz) => {
                let lazyAction = (onComplete) => {
                    sasAllDataForClassActivity(clazzID, activityID, () => {
                        // Re-read fresh data — `clazz` captured above is a stale
                        // snapshot that predates the activity/project load.
                        get(clazzID, (fresh) => {
                            let activity = fresh && fresh.activities && fresh.activities[activityID]
                            let projects = (activity && activity.projects) || {}
                            let downloadItems = {}

                            let directoryName = downloadFolder((fresh && fresh.name) || "TinkerCAD")
                            for (let project of Object.values(projects)) {
                                let student = fresh.students ? fresh.students[project.author] : null
                                let username = student ? student.name : project.author
                                downloadItems[project.id] = {
                                    id: project.id,
                                    downloadName: downloadFileBase(username, project.name),
                                    thumb: project.thumb || null
                                }
                            }
                            onComplete(directoryName, downloadItems)
                        })
                    }, true)
                }

                elem.appendChild(lazyDownloadAllButton("stl", lazyAction))
                elem.appendChild(lazyDownloadAllButton("obj", lazyAction))
                elem.appendChild(lazyDownloadAllThumbnailsButton(lazyAction))
                elem.appendChild(bigButton("Export Portfolio ZIP", () => {
                    exportPortfolioZip(clazzID, activityID)
                }))
            })


        })


    }, 300, Context.ACTIVITY)
    sasGeneralClasses(() => {

        console.log("Collected standard basic student data")
    })
}
main()

