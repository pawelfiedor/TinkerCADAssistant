/**
 * TinkerCAD Assistant — background service worker.
 *
 * After the API migration the worker only needs to:
 *   - run a download queue with bounded concurrency + automatic retries
 *   - open / reload tabs on request
 *
 * The old "(SPLIT)" command protocol and the api/api2 iframe round-trips were
 * removed — design data now comes straight from tcApi in the content script.
 */

const DL = {
    MAX_CONCURRENT: 3,
    MAX_RETRIES: 3,
    RETRY_BASE_MS: 1000,

    queue: [],            // pending jobs: { url, filename, batchId, retries }
    active: new Map(),    // chrome downloadId -> job
    batches: new Map(),   // batchId -> { total, done, failed, failures, tabId }

    enqueue(jobs, batchId, tabId) {
        this.batches.set(batchId, {total: jobs.length, done: 0, failed: 0, failures: [], tabId})
        for (const j of jobs) this.queue.push({url: j.url, filename: j.filename, batchId, retries: 0})
        this.pump()
    },

    pump() {
        while (this.active.size < this.MAX_CONCURRENT && this.queue.length > 0) {
            this.start(this.queue.shift())
        }
    },

    start(job) {
        try {
            chrome.downloads.download(
                {url: job.url, filename: job.filename, conflictAction: 'uniquify'},
                (downloadId) => {
                    if (chrome.runtime.lastError || downloadId === undefined) {
                        this.retryOrFail(job, (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'download() failed')
                        return
                    }
                    this.active.set(downloadId, job)
                }
            )
        } catch (e) {
            this.retryOrFail(job, e.message)
        }
    },

    retryOrFail(job, reason) {
        if (job.retries < this.MAX_RETRIES) {
            job.retries += 1
            // Linear back-off before requeueing.
            setTimeout(() => {
                this.queue.push(job)
                this.pump()
            }, this.RETRY_BASE_MS * job.retries)
        } else {
            const b = this.batches.get(job.batchId)
            if (b) {
                b.failed += 1
                b.failures.push({filename: job.filename, reason})
            }
            this.report(job.batchId)
            this.finishIfDone(job.batchId)
        }
        this.pump()
    },

    succeed(job) {
        const b = this.batches.get(job.batchId)
        if (b) b.done += 1
        this.report(job.batchId)
        this.finishIfDone(job.batchId)
        this.pump()
    },

    report(batchId) {
        const b = this.batches.get(batchId)
        if (!b || b.tabId == null) return
        chrome.tabs.sendMessage(b.tabId, {
            type: 'TC_DL_PROGRESS', batchId, total: b.total, done: b.done, failed: b.failed,
        }, () => void chrome.runtime.lastError)
    },

    finishIfDone(batchId) {
        const b = this.batches.get(batchId)
        if (!b || (b.done + b.failed) < b.total) return
        if (b.tabId != null) {
            chrome.tabs.sendMessage(b.tabId, {
                type: 'TC_DL_BATCH_DONE', batchId, total: b.total, done: b.done, failed: b.failed, failures: b.failures,
            }, () => void chrome.runtime.lastError)
        }
        this.batches.delete(batchId)
    },
}

chrome.downloads.onChanged.addListener((delta) => {
    if (!delta || !delta.state) return
    const job = DL.active.get(delta.id)
    if (!job) return
    if (delta.state.current === 'complete') {
        DL.active.delete(delta.id)
        DL.succeed(job)
    } else if (delta.state.current === 'interrupted') {
        DL.active.delete(delta.id)
        DL.retryOrFail(job, (delta.error && delta.error.current) || 'interrupted')
    }
})

// Accept commands only from the extension's own tinkercad.com content script,
// and only act on tinkercad.com/S3 URLs (downloads + tab opening).
const TC_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*tinkercad\.com\//i
const ALLOWED_EXPORT_RE = /^https:\/\/([a-z0-9-]+\.)*(tinkercad\.com|amazonaws\.com)\//i

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false
    if (!sender.url || !TC_HOST_RE.test(sender.url)) {
        sendResponse({ok: false, error: 'untrusted sender'})
        return false
    }

    if (msg.type === 'TC_DOWNLOAD_BATCH') {
        const jobs = (msg.jobs || []).filter((j) => j && typeof j.url === 'string' && TC_HOST_RE.test(j.url))
        DL.enqueue(jobs, msg.batchId, sender.tab && sender.tab.id)
        sendResponse({ok: true, queued: jobs.length})
        return false
    }

    if (msg.type === 'TC_FETCH_BATCH') {
        const { batchId, jobs } = msg
        const tabId = sender.tab && sender.tab.id
        
        let done = 0
        let failed = 0
        const results = []
        
        const maxConcurrent = 3
        let index = 0
        
        const runNext = () => {
            if (index >= jobs.length) {
                if (done + failed === jobs.length) {
                    chrome.tabs.sendMessage(tabId, {
                        type: 'TC_EXPORT_DONE',
                        batchId,
                        files: results
                    }, () => void chrome.runtime.lastError)
                }
                return
            }
            
            const job = jobs[index++]
            if (!ALLOWED_EXPORT_RE.test(job.url)) {
                failed++
                chrome.tabs.sendMessage(tabId, {
                    type: 'TC_EXPORT_PROGRESS',
                    batchId,
                    done,
                    failed,
                    total: jobs.length
                }, () => void chrome.runtime.lastError)
                runNext()
                return
            }
            
            fetch(job.url)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`)
                    return res.arrayBuffer()
                })
                .then(buf => {
                    const bytes = new Uint8Array(buf)
                    let binary = ''
                    const len = bytes.byteLength
                    const chunk = 8192
                    for (let i = 0; i < len; i += chunk) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
                    }
                    const base64 = btoa(binary)
                    results.push({ path: job.path, base64 })
                    done++
                    
                    chrome.tabs.sendMessage(tabId, {
                        type: 'TC_EXPORT_PROGRESS',
                        batchId,
                        done,
                        failed,
                        total: jobs.length
                    }, () => void chrome.runtime.lastError)
                    
                    runNext()
                })
                .catch(err => {
                    console.warn(`[TCA SW] Failed to fetch for export: ${job.url}`, err)
                    failed++
                    
                    chrome.tabs.sendMessage(tabId, {
                        type: 'TC_EXPORT_PROGRESS',
                        batchId,
                        done,
                        failed,
                        total: jobs.length
                    }, () => void chrome.runtime.lastError)
                    
                    runNext()
                })
        }
        
        for (let c = 0; c < Math.min(maxConcurrent, jobs.length); c++) {
            runNext()
        }
        
        sendResponse({ ok: true })
        return false
    }

    if (msg.type === 'TC_OPEN_TAB') {
        if (typeof msg.url === 'string' && TC_HOST_RE.test(msg.url)) {
            chrome.tabs.create({url: msg.url, active: msg.active === true})
        }
        sendResponse({ok: true})
        return false
    }

    return false
})

chrome.runtime.onInstalled.addListener(() => {
})
