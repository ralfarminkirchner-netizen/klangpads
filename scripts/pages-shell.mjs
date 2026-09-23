#!/usr/bin/env node
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const base = process.env.VITE_BASE || "/klangpads/";
const prefix = base.endsWith("/") ? base : `${base}/`;
const candidates = [".vercel/output/static", ".output/public", "dist"];
const root = candidates.find((p) => existsSync(p));
if (!root) {
  console.error("[pages-shell] no static output (ran vite build?)");
  process.exit(1);
}

const assetsDir = join(root, "assets");
if (!existsSync(assetsDir)) {
  console.error("[pages-shell] no assets/ in", root);
  process.exit(1);
}

const files = readdirSync(assetsDir);
const js =
  files.find((f) => f.startsWith("index-") && f.endsWith(".js")) ||
  files.find((f) => f.endsWith(".js"));
const css = files.find((f) => f.endsWith(".css"));
if (!js) {
  console.error("[pages-shell] no client js in assets/");
  process.exit(1);
}

function cleanHtml(buf) {
  return Buffer.from(buf).filter((b) => b !== 0).toString("utf8");
}

const shellPath = join(root, "_shell.html");
const indexPath = join(root, "index.html");

if (existsSync(shellPath)) {
  const html = cleanHtml(readFileSync(shellPath));
  writeFileSync(indexPath, html);
  writeFileSync(shellPath, html);
  console.log("[pages-shell] index.html from prerendered _shell.html");
} else if (!existsSync(indexPath) || !readFileSync(indexPath, "utf8").includes("index-")) {
  const html = `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <title>KLANGPADS</title>
    <meta name="theme-color" content="#0b0b0e" />
    <meta
      name="description"
      content="KLANGPADS — 16 Pads, Pattern-Matrix, Loops, Mikro und Aufnahme."
    />
    <base href="${prefix}" />
    <link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg" />
    ${css ? `<link rel="stylesheet" href="${prefix}assets/${css}" />` : ""}
    <link rel="apple-touch-icon" href="${prefix}__grok/icon-180.png" />
  </head>
  <body>
    <script type="module" src="${prefix}assets/${js}"></script>
    <script src="https://grok.com/grok-app-builder/extensions.js"></script>
  </body>
</html>
`;
  writeFileSync(indexPath, html);
  console.log("[pages-shell] wrote fallback", indexPath, "js=", js);
} else {
  console.log("[pages-shell] keeping", indexPath);
}

copyFileSync(indexPath, join(root, "404.html"));
writeFileSync(join(root, ".nojekyll"), "");

if (process.argv.includes("--no-docs")) {
  console.log("[pages-shell] static root ready:", root);
} else {
  const docs = "docs";
  rmSync(docs, { recursive: true, force: true });
  mkdirSync(docs, { recursive: true });
  cpSync(root, docs, { recursive: true });
  console.log("[pages-shell] published", docs);
}
