/**
 * TinkerCAD REST API client — runs in the content-script context on
 * www.tinkercad.com and replaces the old hidden-iframe DOM scraping.
 *
 * All calls use the logged-in teacher's session cookie via
 * `credentials: 'include'`. Same-site CORS (www.tinkercad.com ->
 * api-reader-prd.tinkercad.com) lets these requests succeed.
 *
 * Terminology trap: TinkerCAD's API "project" (group level) == this
 * extension's "activity"; TinkerCAD's "design" == this extension's "project".
 */
const TC_API_BASE = 'https://api-reader-prd.tinkercad.com'

const tcApi = {
    _uid: null,

    async _get(path) {
        let url = path.startsWith('http') ? path : TC_API_BASE + path
        let res = await fetch(url, {credentials: 'include', headers: {Accept: 'application/json'}})
        if (res.status === 401 || res.status === 403) {
            throw Object.assign(new Error('TinkerCAD session expired — please log in again'), {status: res.status})
        }
        if (!res.ok) throw new Error(`TinkerCAD API ${res.status} @ ${path}`)
        return res.json()
    },

    /** Logged-in teacher's user id (cached for the page lifetime). */
    async myUserId() {
        if (this._uid) return this._uid
        let data = await this._get('/users')
        let uid = (data && data.id) || (Array.isArray(data) && data[0] && data[0].id)
        if (!uid) throw new Error('Could not determine TinkerCAD user ID')
        this._uid = uid
        return uid
    },

    /** Teacher's own classes (groups). Each carries name + join `code`. */
    async classes() {
        let uid = await this.myUserId()
        let ownGroups = []
        try {
            let raw = await this._get(`/users/${uid}/groups`)
            ownGroups = Array.isArray(raw) ? raw : (raw && (raw.groups || raw.data)) || []
        } catch (err) {
            throw err
        }

        let coGroups = []
        try {
            let raw = await this._get(`/coteachers/listClasses`)
            coGroups = Array.isArray(raw) ? raw : (raw && (raw.classes || raw.groups || raw.data || Object.values(raw).find(Array.isArray))) || []
        } catch (err) {
            console.warn('Failed to fetch co-teaching classes:', err)
        }

        let merged = new Map()
        for (let g of ownGroups) {
            if (g && g.id) {
                merged.set(g.id, g)
            }
        }
        for (let g of coGroups) {
            if (g && g.id) {
                if (merged.has(g.id)) {
                    merged.set(g.id, Object.assign({}, merged.get(g.id), g))
                } else {
                    merged.set(g.id, g)
                }
            }
        }
        return Array.from(merged.values())
    },

    /** A single class (group) object by id, taken from the classes list. */
    async classById(classId) {
        let all = await this.classes()
        return all.find((g) => g.id === classId) || null
    },

    /** Activities of a class (TinkerCAD calls these group-level "projects"). */
    async activities(classId) {
        let uid = await this.myUserId()
        let raw = await this._get(`/users/${uid}/groups/${classId}/projects`)
        return Array.isArray(raw) ? raw : (raw && (raw.projects || raw.data)) || []
    },

    /** Class roster (members). */
    async members(classId) {
        let uid = await this.myUserId()
        let raw = await this._get(`/users/${uid}/groups/${classId}/members?pageSize=2000&type=0&userAvatars=true`)
        return Array.isArray(raw) ? raw : (raw && (raw.members || raw.data)) || []
    },

    /**
     * Student designs (this extension's "projects") for one activity.
     * kind: 'student' (submissions) | 'template' (starter/og files).
     */
    async designs(classId, activityId, kind = 'student') {
        const PAGE_SIZE = 50
        const byId = new Map()
        for (let page = 0; page < 40; page++) {
            const raw = await this._get(`/class/${classId}/project/${activityId}/designs?from=${kind}&sort=edited&asmType=designs&page=${page}&pageSize=${PAGE_SIZE}`)
            const arr = Array.isArray(raw) ? raw : (raw && (raw.designs || raw.items || raw.data)) || []
            if (!arr.length) break
            let added = 0
            for (const d of arr) {
                const id = d && (d.id || d.thingId)
                if (id && !byId.has(id)) {
                    byId.set(id, d)
                    added++
                }
            }
            // Stop if the endpoint ignored paging (returned the same set) or this was the last page.
            if (added === 0 || arr.length < PAGE_SIZE) break
        }
        return [...byId.values()]
    },

    /** Full detail for a single design (description = name, user_id = owner). */
    async design(designId) {
        return this._get(`/designs/detail/${designId}`)
    },

    /** CSRF token TinkerCAD stores in a (non-HttpOnly) cookie. */
    _csrfToken() {
        let m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)
        return m ? decodeURIComponent(m[1]) : null
    },

    /**
     * Update design metadata (asm_tags / asm_description / description…).
     * The official client PATCHes the full editable field set, so we
     * read-modify-write. Precedence: defaults < `fallbacks` (caller's cached
     * copy) < fresh GET values < `patch` (the actual change) — so a failed
     * GET can't wipe fields, and a successful GET can't be overridden by a
     * stale cache for fields we aren't changing.
     */
    async patchDesign(designId, patch, fallbacks = {}) {
        let csrf = this._csrfToken()
        if (!csrf) throw new Error('Missing TinkerCAD CSRF token — reload the page and sign in again')
        let current = null
        try {
            current = await this.design(designId)
        } catch (e) {
            console.warn("[tca] Fetching design details failed, patching with cached fallbacks:", e)
        }
        let body = {
            license_id: "0",
            description: "",
            permission: 0,
            asm_tags: "",
            asm_description: "",
            ...fallbacks
        }
        if (current) {
            if (current.license_id != null) body.license_id = String(current.license_id)
            if (current.description != null) body.description = current.description
            if (current.permission != null) body.permission = current.permission
            if (current.asm_tags != null) body.asm_tags = current.asm_tags
            if (current.asm_description != null) body.asm_description = current.asm_description
        } else if (!body.description) {
            // `description` IS the design's display name. Without a fresh copy
            // or a cached name, sending "" would blank it — refuse instead.
            throw new Error(`No design name available for ${designId} — refusing to PATCH blind`)
        }
        Object.assign(body, patch)
        let res = await fetch(`${TC_API_BASE}/dashboard/designs/${designId}?content_type=tinkercad`, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            body: JSON.stringify(body)
        })
        if (res.status === 401 || res.status === 403) {
            throw Object.assign(new Error('TinkerCAD session expired — please log in again'), {status: res.status})
        }
        if (!res.ok) throw new Error(`TinkerCAD API ${res.status} @ PATCH designs/${designId}`)
        return res.json().catch(() => null)
    },
}

// Expose on the isolated-world global so main-content.js resolves it robustly
// regardless of cross-file lexical-scope sharing.
if (typeof window !== 'undefined') window.tcApi = tcApi
