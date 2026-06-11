let analyticsViewEnable = () => {
    let prevPage = window.currentPage
    return enableView("analytics", (container) => {
        window.currentPage = Context.GENERAL
        // Adopt the scoped design system; clear enableView's inline #fff so
        // the stylesheet canvas color applies.
        container.classList.add("tca-view", "tca-analytics")
        container.style.background = ""
        let el = tcaEl

        // ── Top bar ──────────────────────────────────────────────────
        let topbar = el("div", "tca-topbar")
        let backBtn = el("button", "tca-btn tca-btn--ghost")
        backBtn.type = "button"
        backBtn.appendChild(tcaIcon(TCA_ICONS.back))
        backBtn.appendChild(document.createTextNode("Back"))
        backBtn.onclick = () => {
            window.currentPage = prevPage
            disableView("analytics")
        }
        let classPill = el("span", "tca-pill")
        classPill.style.display = "none"
        let exportBtn = el("button", "tca-btn", "Copy TSV for Excel")
        exportBtn.type = "button"
        exportBtn.title = "Copy the student table as tab-separated values"
        topbar.append(
            backBtn,
            el("span", "tca-vsep"),
            el("span", "tca-title", "Classroom Analytics"),
            classPill,
            el("span", "tca-spacer"),
            exportBtn
        )

        // ── Scrollable page ──────────────────────────────────────────
        let page = el("div", "tca-page tca-scroll")
        container.append(topbar, page)

        let showMessage = (titleText, hint) => {
            page.innerHTML = ""
            let box = el("div", "tca-empty")
            box.appendChild(tcaIcon(TCA_ICONS.cube))
            box.appendChild(el("h3", null, titleText))
            if (hint) box.appendChild(el("p", null, hint))
            page.appendChild(box)
        }
        showMessage("Loading analytics…")

        getCurrentClazz((clazz) => {
            if (!clazz) {
                showMessage("Error loading classroom data", "Open this view from a class page and try again.")
                return
            }
            page.innerHTML = ""
            if (clazz.name) {
                classPill.textContent = clazz.name
                classPill.style.display = ""
            }

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

            // ── KPI stat cards ────────────────────────────────────────
            let stats = el("div", "tca-stats")
            let makeStat = (label, val, desc, color) => {
                let card = el("div", "tca-stat")
                let head = el("div", "tca-stat-label")
                let dot = el("span", "tca-stat-dot")
                dot.style.background = color
                head.append(dot, el("span", null, label))
                card.append(head, el("div", "tca-stat-value", String(val)), el("div", "tca-stat-desc", desc))
                return card
            }
            stats.append(
                makeStat("Total Projects", totalProjects, "Designs created in this classroom", "#1477d1"),
                makeStat("Active Students", activeCount, "Modified project in the last 7 days", "#16a34a"),
                makeStat("Idle Students", idleCount, "Modified project in the last 30 days", "#d97706"),
                makeStat("Inactive Students", inactiveCount, "No recent modifications", "#ef4444")
            )
            page.appendChild(stats)

            // ── Activity timeline (last 14 days) ──────────────────────
            let timeline = el("section", "tca-panel")
            timeline.appendChild(el("h3", "tca-panel-title", "Recent Classroom Activity (Past 14 Days)"))

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
            let chart = el("div", "tca-chart")
            let chartLabels = el("div", "tca-chart-labels")
            for (let i = 0; i < 14; i++) {
                let col = el("div", "tca-chart-col")
                let val = el("span", "tca-chart-val", dayCounts[i] > 0 ? String(dayCounts[i]) : "")
                let bar = el("div", "tca-chart-bar")
                bar.style.height = `${Math.round((dayCounts[i] / maxCount) * 100)}%`
                if (dayCounts[i] > 0) bar.style.minHeight = "4px"
                bar.title = `${dayCounts[i]} modifications`
                col.append(val, bar)
                chart.appendChild(col)
                chartLabels.appendChild(el("span", "tca-chart-lbl", dayLabels[i]))
            }
            timeline.append(chart, chartLabels)
            page.appendChild(timeline)

            // ── Per-student table ─────────────────────────────────────
            let tablePanel = el("section", "tca-panel tca-panel--flush")
            let table = el("table", "tca-table")
            let thead = document.createElement("thead")
            thead.innerHTML = `
                <tr>
                    <th>Student</th>
                    <th class="is-center">Total Projects</th>
                    <th>Last Activity</th>
                    <th>Engagement Status</th>
                </tr>
            `
            table.appendChild(thead)

            let tbody = document.createElement("tbody")
            rowsData.forEach(row => {
                let tr = document.createElement("tr")
                tr.innerHTML = `
                    <td class="tca-td-strong">${escapeHtml(row.name)}</td>
                    <td class="is-center">${row.count}</td>
                    <td>${row.lastActive}</td>
                    <td>
                        <span class="tca-badge" style="background: ${row.badgeBg}; color: ${row.badgeColor};">${row.status}</span>
                    </td>
                `
                tbody.appendChild(tr)
            })
            table.appendChild(tbody)
            tablePanel.appendChild(table)
            page.appendChild(tablePanel)

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
