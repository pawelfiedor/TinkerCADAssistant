# Privacy Policy — TinkerCAD Assistant

_Last updated: 2026-06-09_

TinkerCAD Assistant is a browser extension that adds classroom-management tools
(project galleries, a teacher review view, and bulk model/thumbnail downloads)
on top of [tinkercad.com](https://www.tinkercad.com). This document explains what
data the extension touches and where it goes.

## Short version

- The extension runs **entirely in your browser**.
- It does **not** send your data, or your students' data, to the developer or to
  any third‑party server.
- It does **not** collect analytics or telemetry.
- It does **not** store passwords — it uses your existing, already‑logged‑in
  TinkerCAD session.

## What data is accessed

Using your logged‑in TinkerCAD session, the extension reads classroom data from
TinkerCAD's own API (`api-reader-prd.tinkercad.com`), which can include:

- Your TinkerCAD user id.
- Class (group) names and join codes.
- Student display names / nicknames and badge counts (the same information a
  teacher already sees in the TinkerCAD classroom UI).
- Project (design) ids, names, thumbnails, and owner ids.

## Where data is stored

- This data is cached **locally on your device** via `chrome.storage.local`, only
  to make the extension's views and downloads work. It never leaves your machine
  through the extension.
- Model/thumbnail downloads are fetched **directly from TinkerCAD's servers**
  (`csg-prd.tinkercad.com` and TinkerCAD thumbnail hosts) to your computer using
  Chrome's download manager. The developer's servers are not involved.
- When the signed‑in TinkerCAD user changes, the local cache is cleared and
  rebuilt. Removing the extension (or clearing its storage) deletes the cache.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `storage` | Cache classroom data locally so views/downloads work. |
| `downloads` | Save STL/OBJ/PNG files you choose to export. |
| `host_permissions` (`www.tinkercad.com`, `api-reader-prd.tinkercad.com`, `csg-prd.tinkercad.com`) | Read classroom data from TinkerCAD's API and download model/thumbnail files. |

The extension's background worker only accepts commands from its own
tinkercad.com content script and only downloads/open URLs on `tinkercad.com`.

## Data sharing

None. No data is sold, shared, or transmitted to the developer or third parties.

## Contact

Questions: Ezragolombek.main@gmail.com ·
Source: https://github.com/pawelfiedor/TinkerCADAssistant
