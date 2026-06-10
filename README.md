# TinkerCAD Assistant

> A classroom toolbar for teachers on **[tinkercad.com](https://www.tinkercad.com)** — bulk‑export student models, browse work in a gallery, review submissions, manage 3D prints, and see class engagement analytics, all without leaving TinkerCAD.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/eliikkeilljmpemlohjmcingikpjkjpc?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/tinkercad-assistant/eliikkeilljmpemlohjmcingikpjkjpc)
[![Users](https://img.shields.io/chrome-web-store/users/eliikkeilljmpemlohjmcingikpjkjpc?label=users)](https://chromewebstore.google.com/detail/tinkercad-assistant/eliikkeilljmpemlohjmcingikpjkjpc)
![Manifest V3](https://img.shields.io/badge/manifest-v3-blue)

**[➡️ Install from the Chrome Web Store](https://chromewebstore.google.com/detail/tinkercad-assistant/eliikkeilljmpemlohjmcingikpjkjpc)**

---

## What it does

TinkerCAD's classroom is great for assigning work, but tedious for teachers who
need to **export dozens of student models for 3D printing**, **review** everyone's
designs quickly, or **showcase** a class. TinkerCAD Assistant adds buttons and
full‑screen views directly inside the TinkerCAD UI to make those jobs fast.

It talks to TinkerCAD's own REST API using your existing logged‑in session — there
is no scraping, no separate login, and **nothing leaves your browser**.

## Features

### 📥 Bulk & single downloads
- Export designs as **STL**, **OBJ** (saved as a `.zip` of `obj` + `mtl`, as TinkerCAD serves it) or **PNG** thumbnails.
- One‑click per‑project buttons (revealed on hover/**Shift**) and **bulk** export for a whole activity.
- A **download queue** in the background worker with bounded concurrency, **automatic retries**, and a live **progress toast**.
- Files are named for you: folder `"{year}W{week} {class}"`, file `"{student} {project}"`.

### 🖼 Gallery
A full‑screen **slideshow** of project thumbnails (with an optional 3D view), for a
single activity, a whole class, or every class. Prev / Next / Pause controls, a
slide counter, and a top **progress bar** that counts down to the next slide.

### 👩‍🏫 Teacher view
A **thumbnail grid** of an activity's submissions. Click any card to enlarge it
(image or live 3D), flip through with **← / →**, toggle auto‑play with **Space**,
download STL/OBJ/PNG, and pick a thumbnail size (S/M/L). Refreshes automatically
to pick up new submissions.

### 🖨 Print Manager
A workbench for preparing prints across **all** your classes:
- Filterable grid of every project (by student / class / project name).
- **Date filter** by last‑modified time (this week, last week, this month, …).
- **Group by class** with per‑group *Select / Deselect*, plus multi‑select.
- **Bulk download** the selected projects as STL or OBJ.
- **Printable reports** — an overall print sheet and a per‑student breakdown.

### 📊 Classroom Analytics
Per‑student engagement for the current class: project counts and an
**Active / Idle / Inactive** status based on how recently each student last
modified a design. Export the table as **TSV** to paste straight into Excel/Sheets.

### 📦 Portfolio export
Bundle an activity into a single **`{Class}_Showcase.zip`** containing each
student's STL + thumbnail and a self‑contained **`index.html`** showcase page —
built entirely in the browser (no external libraries).

> **Co‑teacher friendly:** Gallery and Analytics buttons are injected even when
> the native classroom toolbar isn't present (e.g. for co‑teacher accounts), and
> expired S3 thumbnail links are refreshed automatically.

## How it works

```
www.tinkercad.com  ─┬─►  content script (scripts/main-content.js)
                    │      • injects buttons + full-screen views
                    │      • calls the TinkerCAD REST API with your session cookie
                    │        (api-reader-prd.tinkercad.com) — no DOM scraping
                    │      • caches classroom data in chrome.storage.local
                    │
                    └─►  service worker (scripts/service-worker.js)
                           • download queue (concurrency + retries + progress)
                           • file fetch for ZIP export
```

- **Manifest V3**, vanilla JavaScript, **no build step and no runtime dependencies**.
- `scripts/tc-api.js` is a small REST client; `scripts/main-content.js` holds the
  UI and views; `scripts/service-worker.js` runs downloads/exports.
- All commands the worker accepts are validated to come from the tinkercad.com
  content script and to target tinkercad/S3 URLs only.

## Installation

### From the Chrome Web Store (recommended)
Install from the [store listing](https://chromewebstore.google.com/detail/tinkercad-assistant/eliikkeilljmpemlohjmcingikpjkjpc),
open **tinkercad.com**, and sign in to your teacher account.

### From source (developer mode)
1. Clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the **`extension/`** folder.
4. Open [tinkercad.com](https://www.tinkercad.com) and sign in as a teacher.

After editing any file, press the **⟳ reload** button on the extension card.

## Usage

| Where | What you get |
|---|---|
| Classes dashboard (`/dashboard/classes`) | **Gallery** and **Print Manager** buttons |
| An activity page | **Teacher view**, **Gallery**, **Analytics**, bulk **Download STL/OBJ/thumbnails**, **Export Portfolio ZIP** |
| Any project card | Hover or hold **Shift** → per‑project **STL / OBJ / PNG / Tinker this** buttons |
| Extension popup | Auto‑advance **speed** for the Gallery/Teacher slideshows |

## Permissions & privacy

| Permission | Why |
|---|---|
| `storage` | Cache classroom data locally so views/downloads work. |
| `downloads` | Save the STL/OBJ/PNG/ZIP files you export. |
| `https://*.tinkercad.com/*` | Read classroom data from TinkerCAD's API and download models. |
| `https://*.amazonaws.com/*` | Fetch design thumbnails/assets hosted on TinkerCAD's S3 storage. |

The extension stores data **only in your browser** and sends nothing to the
developer or any third party. See **[PRIVACY.md](PRIVACY.md)** for details.

## Project structure

```
extension/
├── manifest.json            # MV3 manifest
├── scripts/
│   ├── tc-api.js            # TinkerCAD REST API client
│   ├── main-content.js      # UI injection + Gallery / Teacher / Print Manager / Analytics
│   └── service-worker.js    # download queue + ZIP-export file fetch
├── settings.html / .js      # popup (auto-advance speed)
├── style/printer.css
├── intro.html               # post-install page
└── icons/ · screenshots/
PRIVACY.md
```

## Development

This is plain ES2020 + Chrome extension APIs — no bundler, no `npm install`.

```bash
# quick syntax check before loading
node --check extension/scripts/main-content.js
node --check extension/scripts/tc-api.js
node --check extension/scripts/service-worker.js
```

Then **Load unpacked** the `extension/` folder and reload after changes.
User‑facing strings, code comments, and commit messages are kept in **English**.

## Disclaimer

TinkerCAD Assistant uses TinkerCAD's internal/undocumented API and UI, so an
upstream change by Autodesk can temporarily break a feature. It is an
independent project and is **not affiliated with or endorsed by Autodesk**.

## Attribution

This repository is a **fork of [shmezi/TinkerCADAssistant](https://github.com/shmezi/TinkerCADAssistant)**,
the original project created by **Ezra Golombek**, who also publishes the
[original extension on the Chrome Web Store](https://chromewebstore.google.com/detail/tinkercad-assistant/eliikkeilljmpemlohjmcingikpjkjpc).
The original code remains the copyright of its author. This fork adds further
features and is maintained by [@pawelfiedor](https://github.com/pawelfiedor).
Contact: `Ezragolombek.main@gmail.com`.

## License

The upstream project does **not include a license file**, which under copyright
law means **all rights are reserved by the original author**. Consequently this
fork carries no license of its own: the code here may not be reused,
redistributed, or published as a separate extension **without the original
author's permission**. If you would like to use it, please contact the original
author first.
