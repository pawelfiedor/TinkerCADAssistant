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
    window.bigButton = bigButton;
    window.lazyDownloadAllButton = lazyDownloadAllButton;
    window.lazyDownloadAllThumbnailsButton = lazyDownloadAllThumbnailsButton;
    window.smallButton = smallButton;
    window.smallButton2 = smallButton2;
}
