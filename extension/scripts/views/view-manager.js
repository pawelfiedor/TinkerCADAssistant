let views = {}

let enableView = (id, enable, disable) => {
    // The view is a fixed full-screen overlay, so hiding #main is optional;
    // guard it because some pages (e.g. /dashboard/classes) have no #main.
    let og = document.querySelector("#main")
    if (og) og.style.display = "none"
    views[id] = {id: id, enable: enable, disable: disable}
    let container = document.createElement("div")
    container.classList.add("view")
    Object.assign(container.style, {
        position: "fixed", inset: "0", zIndex: "2147483640",
        display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff"
    })
    document.body.appendChild(container)
    enable(container)
}

let disableView = (id) => {
    let og = document.querySelector("#main")
    if (og) og.style.display = "block"

    for (let item of document.querySelectorAll(".view")) {
        console.log(`Disabled view: ${id}`)
        item.remove()
    }
    views[id].disable()
}

if (typeof window !== 'undefined') {
    window.views = views;
    window.enableView = enableView;
    window.disableView = disableView;
}
