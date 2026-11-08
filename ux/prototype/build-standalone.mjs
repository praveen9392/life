// Builds index.html as a fully self-contained file (CSS + JS inlined, dynamic imports inlined)
// that works when double-clicked (file://) — no server, no backend, no dependencies.
// On file:// the app runs in demo mode with a built-in mock API and sample data.
// Uses the rolldown bundled with the frontend's node_modules. Run: node build-standalone.mjs
import { readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { rolldown } = require(join(HERE, "..", "..", "frontend", "node_modules", "rolldown", "dist", "index.mjs"));

const bundle = await rolldown({
  input: join(HERE, "src", "main.js"),
  platform: "browser",
  resolve: { extensions: [".js", ".mjs"] },
});
const { output } = await bundle.generate({ format: "iife", codeSplitting: false });
await bundle.close();
const js = output[0].code;

const styles = (await Promise.all(["tokens", "base", "components", "layout"].map(async (n) => `/* ${n}.css */\n` + (await readFile(join(HERE, "assets", "styles", `${n}.css`), "utf8"))))).join("\n");
const inline = js
  .replace(/<\/script/gi, "<\\/script")
  .replace(/^\/\/# sourceMappingURL=.*$/gm, "");

const html = `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <title>Life</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%232f6b57'/%3E%3Cpath d='M17 5L8 18h7l-1 9 9-13h-7z' fill='white'/%3E%3C/svg%3E" />
    <style>
${styles}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <noscript>Life needs JavaScript enabled.</noscript>
    <script>
${inline}
    </script>
  </body>
</html>
`;
await writeFile(join(HERE, "index.html"), html);
await rm(join(HERE, "standalone.html"), { force: true });
console.log(`index.html written (${Math.round(html.length / 1024)} KB, fully self-contained)`);
