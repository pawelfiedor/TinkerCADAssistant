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

if (typeof window !== 'undefined') {
    window.generateOfflineIndexHtml = generateOfflineIndexHtml;
    window.exportPortfolioZip = exportPortfolioZip;
}
