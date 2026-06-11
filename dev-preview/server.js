// Tiny static server for the Print Manager dev preview.
// Serves the repo root; "/" maps to dev-preview/index.html.
const http = require("http")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json"
}

http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
    if (urlPath === "/") urlPath = "/dev-preview/index.html"
    let file = path.join(ROOT, urlPath)
    if (!file.startsWith(ROOT)) {
        res.writeHead(403)
        res.end()
        return
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404)
            res.end("not found")
            return
        }
        res.writeHead(200, {"Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"})
        res.end(data)
    })
}).listen(8123, () => console.log("preview on http://localhost:8123"))
