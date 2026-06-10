let analyticsViewEnable = () => {
    let prevPage = window.currentPage
    return enableView("analytics", (container) => {
        window.currentPage = Context.GENERAL
        
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
            window.currentPage = prevPage
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

if (typeof window !== 'undefined') {
    window.analyticsViewEnable = analyticsViewEnable;
}
