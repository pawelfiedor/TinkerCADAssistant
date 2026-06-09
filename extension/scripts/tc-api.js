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
            throw Object.assign(new Error('Sesja TinkerCAD wygasła — zaloguj się ponownie'), {status: res.status})
        }
        if (!res.ok) throw new Error(`TinkerCAD API ${res.status} @ ${path}`)
        return res.json()
    },

    /** Logged-in teacher's user id (cached for the page lifetime). */
    async myUserId() {
        if (this._uid) return this._uid
        let data = await this._get('/users')
        let uid = (data && data.id) || (Array.isArray(data) && data[0] && data[0].id)
        if (!uid) throw new Error('Nie udało się ustalić ID użytkownika TinkerCAD')
        this._uid = uid
        return uid
    },

    /** Teacher's own classes (groups). Each carries name + join `code`. */
    async classes() {
        let uid = await this.myUserId()
        let raw = await this._get(`/users/${uid}/groups`)
        return Array.isArray(raw) ? raw : (raw && (raw.groups || raw.data)) || []
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
        let raw = await this._get(`/class/${classId}/project/${activityId}/designs?from=${kind}&sort=edited&asmType=designs`)
        return Array.isArray(raw) ? raw : (raw && (raw.designs || raw.items || raw.data)) || []
    },

    /** Full detail for a single design (description = name, user_id = owner). */
    async design(designId) {
        return this._get(`/things/${designId}`)
    },
}

// Expose on the isolated-world global so main-content.js resolves it robustly
// regardless of cross-file lexical-scope sharing.
if (typeof window !== 'undefined') window.tcApi = tcApi
