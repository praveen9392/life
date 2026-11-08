import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { ApiError } from "./api.js";

/* ---------- Toasts ---------- */
let toastHost;
export function toast(message, kind = "info", action) {
  toastHost ??= document.body.appendChild(h("div", { class: "toasts", role: "status", "aria-live": "polite" }));
  const node = h("div", { class: `toast${kind === "error" ? " toast-error" : ""}` }, h("span", null, message),
    action ? h("button", { type: "button", onclick: () => { action.run(); node.remove(); } }, action.label) : null);
  toastHost.append(node);
  setTimeout(() => node.remove(), action ? 6000 : kind === "error" ? 5500 : 2800);
}
export const errorMessage = (e) => (e instanceof ApiError ? e.message : "Something went wrong.");
export const toastError = (e) => toast(errorMessage(e), "error");

/* ---------- Focus handling ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapTab(container, e) {
  if (e.key !== "Tab") return;
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- Modal / sheet ---------- */
let modalCount = 0;
export function openModal({ title, body, footer, wide = false, onClose }) {
  const returnFocus = document.activeElement;
  const titleId = `m-${Math.random().toString(36).slice(2, 8)}`;
  const closeBtn = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": "Close", onclick: () => close() }, icon("x", 18));
  const modal = h("div", { class: `modal${wide ? " modal-wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("div", { class: "modal-head" }, h("h2", { id: titleId }, title), closeBtn),
    h("div", { class: "modal-body" }, body),
    footer ? h("div", { class: "modal-foot" }, footer) : null);
  const backdrop = h("div", { class: "backdrop" }, modal);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    trapTab(modal, e);
  });
  document.body.append(backdrop);
  modalCount++;
  document.body.style.overflow = "hidden";
  (modal.querySelector("[autofocus], input, textarea, select") ?? closeBtn).focus();
  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (--modalCount === 0) document.body.style.overflow = "";
    returnFocus?.isConnected && returnFocus.focus();
    onClose?.(result);
  }
  return { close, el: modal };
}

export function confirmDialog({ title, message, confirmLabel = "Delete", danger = true }) {
  return new Promise((resolve) => {
    const cancel = h("button", { class: "btn btn-secondary", type: "button", onclick: () => dlg.close(false) }, "Cancel");
    const ok = h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, type: "button", onclick: () => dlg.close(true) }, confirmLabel);
    const dlg = openModal({ title, body: h("p", { class: "muted" }, message), footer: [cancel, ok], onClose: (r) => resolve(r === true) });
    cancel.focus();
  });
}

/* ---------- Menu / popover ---------- */
let openMenuEl = null;
export function closeMenu() {
  openMenuEl?.remove();
  openMenuEl = null;
}
/** items: [{label, icon?, onClick, danger?, href?}] | {head: "text"} | "-" */
export function openMenu(anchor, items, { align = "end" } = {}) {
  closeMenu();
  const menu = h("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it === "-") menu.append(h("hr"));
    else if (it.head) menu.append(h("div", { class: "menu-head" }, it.head));
    else {
      const attrs = { role: "menuitem", class: it.danger ? "danger" : "" };
      const content = [it.icon ? icon(it.icon, 18) : null, it.label];
      const el = it.href
        ? h("a", { ...attrs, href: it.href, "data-link": "", onclick: () => closeMenu() }, content)
        : h("button", { ...attrs, type: "button", onclick: () => { closeMenu(); it.onClick?.(); } }, content);
      menu.append(el);
    }
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const left = align === "end" ? Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) : Math.max(8, Math.min(r.left, innerWidth - w - 8));
  const top = r.bottom + 6 + menu.offsetHeight > innerHeight ? Math.max(8, r.top - menu.offsetHeight - 6) : r.bottom + 6;
  Object.assign(menu.style, { left: `${left}px`, top: `${top}px` });
  openMenuEl = menu;
  const buttons = () => [...menu.querySelectorAll("button,a")];
  buttons()[0]?.focus();
  menu.addEventListener("keydown", (e) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Escape") { e.stopPropagation(); closeMenu(); anchor.focus?.(); }
    else if (e.key === "Tab") closeMenu();
  });
  setTimeout(() => {
    const off = (e) => { if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener("mousedown", off, true); } };
    document.addEventListener("mousedown", off, true);
  });
  return menu;
}

/** Free-form popover (notifications, etc.) positioned like a menu; closes on outside click / Escape. */
export function openPopover(anchor, content, { width = 360 } = {}) {
  closeMenu();
  const pop = h("div", { class: "menu", role: "dialog", "aria-label": "Notifications", style: { width: `min(${width}px, calc(100vw - 16px))`, maxWidth: "none", padding: "0" } }, content);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8));
  Object.assign(pop.style, { left: `${left}px`, top: `${r.bottom + 6}px` });
  openMenuEl = pop;
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeMenu(); anchor.focus?.(); } });
  setTimeout(() => {
    const off = (e) => { if (!pop.contains(e.target)) { closeMenu(); document.removeEventListener("mousedown", off, true); } };
    document.addEventListener("mousedown", off, true);
  });
  return pop;
}

/* ---------- Building blocks ---------- */
export function pageHeader({ eyebrow, title, subtitle, actions = [], module }) {
  return h("header", { class: "page-head", style: module ? { "--mod": `var(--m-${module})` } : undefined },
    h("div", null,
      eyebrow ? h("div", { class: "eyebrow" }, h("span", { class: "dot" }), eyebrow) : null,
      h("h1", { id: "page-title", tabindex: "-1" }, title),
      subtitle ? h("p", { class: "subtitle" }, subtitle) : null),
    actions.length ? h("div", { class: "actions" }, actions) : null);
}

export function button({ label, variant = "secondary", size, icon: ic, onClick, type = "button", disabled, ariaLabel, href }) {
  const cls = `btn btn-${variant}${size === "sm" ? " btn-sm" : ""}${!label ? " btn-icon" : ""}`;
  const kids = [ic ? icon(ic, size === "sm" ? 16 : 18) : null, label];
  if (href) return h("a", { class: cls, href, "data-link": "", "aria-label": ariaLabel }, kids);
  return h("button", { class: cls, type, onclick: onClick, disabled, "aria-label": ariaLabel }, kids);
}

/** Wraps a button to show a spinner and block double submits while `fn` runs. */
export async function withBusy(btn, fn) {
  if (btn.disabled) return;
  const old = [...btn.childNodes];
  btn.disabled = true;
  clear(btn).append(h("span", { class: "spinner", "aria-label": "Working" }));
  try { return await fn(); } finally { btn.disabled = false; clear(btn).append(...old); }
}

/** `control` is what is rendered; `target` (default: control) is the real form element that gets id/aria wiring. */
export function field({ label, hint, error, control, target }) {
  const el = target ?? control;
  if (!el.id) el.id = `f-${Math.random().toString(36).slice(2, 8)}`;
  if (error) el.setAttribute("aria-invalid", "true");
  const describedBy = [];
  const wrap = h("div", { class: "field" }, label ? h("label", { for: el.id }, label) : null, control);
  if (hint) { const e = h("div", { class: "hint", id: `${el.id}-hint` }, hint); describedBy.push(e.id); wrap.append(e); }
  if (error) { const e = h("div", { class: "error", id: `${el.id}-err`, role: "alert" }, error); describedBy.push(e.id); wrap.append(e); }
  if (describedBy.length) el.setAttribute("aria-describedby", describedBy.join(" "));
  return wrap;
}
export const input = (props = {}) => h("input", { class: "input", ...props });
export const textarea = (props = {}) => h("textarea", { class: "textarea", ...props });
export function select(options, value, props = {}) {
  const el = h("select", { class: "select", ...props }, options.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h("option", { value: v, selected: String(v) === String(value) }, l);
  }));
  return el;
}

export function chip(text, variant = "") {
  return h("span", { class: `chip${variant ? ` chip-${variant}` : ""}` }, text);
}

export function emptyState({ icon: ic = "list", title, text, action }) {
  return h("div", { class: "empty" }, h("div", { class: "empty-icon" }, icon(ic, 22)), h("h3", null, title), text ? h("p", null, text) : null, action ?? null);
}

export function skeletonRows(n = 4) {
  return h("div", { class: "rows", "aria-busy": "true", "aria-label": "Loading" },
    Array.from({ length: n }, () => h("div", { class: "row" }, h("div", { class: "skeleton", style: { width: "28px", height: "28px", borderRadius: "50%" } }),
      h("div", { class: "row-main stack-sm" }, h("div", { class: "skeleton", style: { height: "14px", width: "55%" } }), h("div", { class: "skeleton", style: { height: "12px", width: "30%" } })))));
}

export function errorState(e, retry) {
  const offline = e instanceof ApiError && e.status === 0;
  const apiInput = offline
    ? (() => {
        const control = input({ type: "url", value: (localStorage.getItem("life.proto.api") || "http://localhost:8000"), "aria-label": "API address", style: { minWidth: "260px" } });
        const save = h("button", { class: "btn btn-primary", type: "button", onclick: () => {
          localStorage.setItem("life.proto.api", control.value.trim().replace(/\/$/, ""));
          location.reload();
        } }, "Save and reload");
        return h("div", { class: "stack-sm", style: { width: "min(420px, 100%)" } },
          h("p", { class: "faint", style: { fontSize: "13px" } }, "Where is the Life API running?"),
          h("div", { class: "row-gap", style: { flexWrap: "wrap" } }, control, save));
      })()
    : null;
  return h("div", { class: "empty" },
    h("div", { class: "empty-icon" }, icon("alert", 22)),
    h("h3", null, offline ? "Can't reach the Life API" : "That didn't load"),
    h("p", null, errorMessage(e)),
    apiInput,
    retry ? button({ label: "Try again", variant: "secondary", onClick: retry }) : null);
}

export function ring(percent, label = "today") {
  const R = 54;
  const C = 2 * Math.PI * R;
  const value = percent == null ? 0 : percent;
  const wrap = h("div", { class: "ring", role: "img", "aria-label": percent == null ? `No ${label} progress yet` : `${percent}% of ${label} done` });
  wrap.innerHTML = `<svg viewBox="0 0 132 132" aria-hidden="true"><circle class="ring-bg" cx="66" cy="66" r="${R}"/><circle class="ring-fg" cx="66" cy="66" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`;
  const big = h("b", { class: "tnum" }, percent == null ? "-" : `${percent}%`);
  wrap.append(h("div", { class: "ring-label" }, big, h("span", null, label)));
  const set = (p) => {
    wrap.querySelector(".ring-fg").setAttribute("stroke-dashoffset", String(C * (1 - (p ?? 0) / 100)));
    big.textContent = p == null ? "-" : `${p}%`;
    wrap.setAttribute("aria-label", p == null ? `No ${label} progress yet` : `${p}% of ${label} done`);
  };
  wrap.update = set;
  requestAnimationFrame(() => requestAnimationFrame(() => set(percent)));
  return wrap;
}

export function progressBar(percent, label) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  return h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p), "aria-label": label ?? "Progress" }, h("span", { style: { width: `${p}%` } }));
}

export function statCard({ label, value, sub, onClick, pressed }) {
  const kids = [h("div", { class: "stat-label" }, label), h("div", { class: "stat-value" }, value), sub ? h("div", { class: "stat-sub" }, sub) : null];
  return onClick ? h("button", { class: "stat", type: "button", onclick: onClick, "aria-pressed": String(!!pressed) }, kids) : h("div", { class: "stat" }, kids);
}

export function segmented(options, value, onChange, label) {
  const root = h("div", { class: "segmented", role: "group", "aria-label": label });
  const draw = (v) => {
    clear(root);
    for (const [val, text] of options) root.append(h("button", { type: "button", "aria-pressed": String(val === v), onclick: () => { onChange(val); draw(val); } }, text));
  };
  draw(value);
  return root;
}
