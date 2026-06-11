// ── Shared UI kit for the redesigned assistant views (.tca-view) ────
// Inline SVG fragments (inline so the content script needs no extra
// asset requests). Sized via CSS where it matters.
let TCA_ICONS = {
    back: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    cube: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
    x: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    chevronLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
    chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 5h4v14H6z"/><path d="M14 5h4v14h-4z"/></svg>`
}

/** Create an element with an optional class list and text content. */
let tcaEl = (tag, cls, text) => {
    let node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}

/** Wrap an inline SVG fragment in a .tca-icon span. */
let tcaIcon = (svg) => {
    let s = tcaEl("span", "tca-icon")
    s.innerHTML = svg
    return s
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

if (typeof window !== 'undefined') {
    window.TCA_ICONS = TCA_ICONS;
    window.tcaEl = tcaEl;
    window.tcaIcon = tcaIcon;
    window.bigButton = bigButton;
    window.lazyDownloadAllButton = lazyDownloadAllButton;
    window.lazyDownloadAllThumbnailsButton = lazyDownloadAllThumbnailsButton;
    window.smallButton = smallButton;
    window.smallButton2 = smallButton2;
}
