/** Minimal history router. Pages are lazy ES modules: `export default (root, ctx) => cleanup?`.
 * On http(s) it uses the pathname; on file:// (where pathname is the file path) it falls back
 * to hash routing (`#/app/tasks`) so the bundled standalone.html works when double-clicked. */
const routes = [];
let current = null;
let renderFn = () => {};

export const FILE_MODE = location.protocol === "file:";

function raw() {
  if (FILE_MODE) return location.hash.replace(/^#/, "") || "/";
  return location.pathname + location.search;
}
export function currentPath() {
  return raw().split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}
export function query() {
  const q = raw().split("?")[1] ?? "";
  return new URLSearchParams(q);
}

export function route(pattern, loader, options = {}) {
  routes.push({ pattern, loader, ...options });
}

export function navigate(path, { replace = false } = {}) {
  if (FILE_MODE) {
    if (replace) { history.replaceState({}, "", `#${path}`); resolve(); }
    else if (location.hash === `#${path}`) resolve();
    else location.hash = `#${path}`; // fires hashchange -> resolve
    return;
  }
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  resolve();
}

/** Update the query string without re-rendering the page (filters, selected day, etc.). */
export function setQuery(values) {
  const path = currentPath();
  const q = query();
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  const target = `${path}${s ? `?${s}` : ""}`;
  if (FILE_MODE) history.replaceState({}, "", `#${target}`);
  else history.replaceState({}, "", target);
}

function match(path) {
  for (const r of routes) {
    if (r.pattern === path) return r;
  }
  return routes.find((r) => r.pattern === "*");
}

async function resolve() {
  const path = currentPath();
  const r = match(path);
  current = r;
  await renderFn(r, path);
}

export function startRouter(render) {
  renderFn = render;
  window.addEventListener("popstate", resolve);
  window.addEventListener("hashchange", resolve);
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a[data-link]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http")) return;
    e.preventDefault();
    navigate(href);
  });
  return resolve();
}

export const currentRoute = () => current;
export const reload = () => resolve();
