import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const port = Number(process.env.PORT || 8080);
const candidates = [".vercel/output/static", ".output/public", "dist"];
const root = resolve(candidates.find((p) => existsSync(p)) || ".vercel/output/static");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function safe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const full = resolve(join(root, "." + decoded));
  if (!full.startsWith(root)) return null;
  return full;
}

function send(res, code, body, type = "text/plain") {
  res.writeHead(code, { "content-type": type, "cache-control": "public, max-age=60" });
  res.end(body);
}

const server = createServer((req, res) => {
  const path = safe(req.url || "/");
  if (!path) return send(res, 403, "forbidden");
  let file = path;
  try {
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    if (!existsSync(file)) return send(res, 404, "not found");
    const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 500, "error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[klangpads] listening on 0.0.0.0:${port}  root=${root}`);
});
