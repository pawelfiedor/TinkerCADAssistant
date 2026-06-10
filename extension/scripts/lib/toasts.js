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

if (typeof window !== 'undefined') {
    window.ensureToastContainer = ensureToastContainer;
    window.createDownloadToast = createDownloadToast;
    window.downloadBatch = downloadBatch;
    window.showNotice = showNotice;
    window.tcApiError = tcApiError;
}
