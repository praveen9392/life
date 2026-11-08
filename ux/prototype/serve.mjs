// Zero-dependency static server with SPA fallback. Usage: node serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5180);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end("Forbidden"); return; }
    let info = await stat(file).catch(() => null);
    // "/" and unknown extension-less paths serve the module entry (dev.html) so deep links work.
    if (url.pathname === "/" || info?.isDirectory()) { file = join(ROOT, "dev.html"); info = await stat(file).catch(() => null); }
    if (!info) {
      if (extname(url.pathname)) { res.writeHead(404).end("Not found"); return; }
      file = join(ROOT, "dev.html");
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" }).end(body);
  } catch (err) {
    res.writeHead(500).end("Server error");
    console.error(err);
  }
}).listen(PORT, () => console.log(`Life prototype on http://localhost:${PORT}`));
