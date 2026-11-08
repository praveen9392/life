/* Page code passes conditional children (cond ? node : null). The native methods would render those as
 * the text "null", so skip null/undefined/false and flatten arrays, matching what `h()` does. */
for (const method of ["append", "prepend", "replaceChildren"]) {
  const native = Element.prototype[method];
  Element.prototype[method] = function (...nodes) {
    return native.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false));
  };
}

/** Tiny DOM builder: h("div", { class, onclick, "aria-label": "x" }, child, ...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === false || value == null) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value" || key === "checked" || key === "disabled" || key === "selected") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Replace the children of `el` with `nodes`. */
export function setChildren(el, ...nodes) {
  clear(el);
  return append(el, nodes);
}

export function debounce(fn, ms = 250) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Tiny pub/sub used so mutations can tell the shell to refresh badges. */
const listeners = new Map();
export const events = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name).delete(fn);
  },
  emit(name, detail) {
    listeners.get(name)?.forEach((fn) => fn(detail));
  },
};
