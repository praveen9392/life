import { h } from "./dom.js";

const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Renders a chart at the container's real pixel width (1 SVG unit = 1 CSS px) and redraws on resize,
 * so axis labels stay a readable size on phones instead of scaling down with a fixed viewBox.
 */
export function responsive(draw) {
  const box = h("div", { style: { width: "100%" } });
  let last = 0;
  const observer = new ResizeObserver((entries) => {
    const w = Math.floor(entries[0].contentRect.width);
    if (w > 0 && Math.abs(w - last) > 4) { last = w; box.replaceChildren(draw(w)); }
  });
  observer.observe(box);
  return box;
}

/**
 * Line chart with straight segments. Points with a null value break the line and are not drawn
 * (UX-026: no interpolation across days that have no data).
 * series: [{name, color, dash?, values: (number|null)[]}], labels: string[]
 */
export function lineChart({ labels, series, min = 0, max = 100, unit = "%", width = 720, height = 260, ariaLabel }) {
  const W = width, H = height, L = 48, R = 20, T = 12, B = 30;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": ariaLabel ?? "Line chart" });
  const x = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const span = max - min || 1;
  const y = (v) => T + (1 - (v - min) / span) * (H - T - B);
  const fmt = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1));
  for (let t = 0; t <= 4; t++) {
    const v = min + (span / 4) * t;
    root.append(svg("line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    root.append(svg("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, `${fmt(v)}${unit}`));
  }
  const perLabel = 56;
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((W - L - R) / perLabel))));
  labels.forEach((l, i) => {
    const last = i === labels.length - 1;
    if (i % step === 0 || last) root.append(svg("text", { x: x(i), y: H - 8, "text-anchor": last && labels.length > 1 ? "end" : i === 0 ? "start" : "middle" }, l));
  });
  for (const s of series) {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    if (d) root.append(svg("path", { d, fill: "none", stroke: s.color, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round", ...(s.dash ? { "stroke-dasharray": s.dash } : {}) }));
    s.values.forEach((v, i) => {
      if (v == null) return;
      const dot = svg("circle", { cx: x(i), cy: y(v), r: 4, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 });
      dot.append(svg("title", {}, `${s.name}, ${labels[i]}: ${v}${unit}`));
      root.append(dot);
    });
  }
  return root;
}

/** Vertical bar chart with value labels and whole-number ticks. */
export function barChart({ labels, values, color = "var(--accent)", width = 720, height = 200, ariaLabel, unit = "" }) {
  const W = width, H = height, L = 32, R = 8, T = 22, B = 28;
  const max = Math.max(1, ...values);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": ariaLabel ?? "Bar chart" });
  const bw = (W - L - R) / values.length;
  const ticks = max <= 5 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  for (const t of ticks) {
    const yy = T + (1 - t / max) * (H - T - B);
    root.append(svg("line", { class: "grid", x1: L, x2: W - R, y1: yy, y2: yy }));
    root.append(svg("text", { x: L - 6, y: yy + 4, "text-anchor": "end" }, String(t)));
  }
  const perLabel = 52;
  const step = Math.max(1, Math.ceil(values.length / Math.max(2, Math.floor((W - L - R) / perLabel))));
  values.forEach((v, i) => {
    const bh = (v / max) * (H - T - B);
    const bx = L + i * bw + bw * 0.2;
    const rect = svg("rect", { x: bx, y: T + (H - T - B) - bh, width: bw * 0.6, height: Math.max(bh, v ? 2 : 0), rx: 4, fill: color });
    rect.append(svg("title", {}, `${labels[i]}: ${v}${unit}`));
    root.append(rect);
    if (v) root.append(svg("text", { x: bx + bw * 0.3, y: T + (H - T - B) - bh - 6, "text-anchor": "middle" }, String(v)));
    if (i % step === 0 || i === values.length - 1) root.append(svg("text", { x: bx + bw * 0.3, y: H - 8, "text-anchor": "middle" }, labels[i]));
  });
  return root;
}

/** Trend sparkline (no axes), scaled between the series' own min and max so small changes are visible. */
export function sparkline(values, { color = "var(--accent)", width = 120, height = 32 } = {}) {
  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": "Trend" });
  const present = values.filter((v) => v != null);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const span = hi - lo || 1;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    const px = values.length === 1 ? width / 2 : (i * (width - 4)) / (values.length - 1) + 2;
    const py = hi === lo ? height / 2 : height - 3 - ((v - lo) / span) * (height - 6);
    d += `${pen ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)} `;
    pen = true;
  });
  if (d) root.append(svg("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  return root;
}

/** Habit history heat strip: 7 rows (Mon..Sun) x N weeks, oldest first. cells: [{date, status|null}] */
export function heatStrip(cells, startDow, label) {
  const grid = h("div", { class: "heat", role: "img", "aria-label": label });
  for (let i = 0; i < startDow; i++) grid.append(h("i", { style: { visibility: "hidden" } }));
  for (const c of cells) grid.append(h("i", { "data-s": c.status ?? "", title: `${c.date}: ${c.status ?? "no entry"}` }));
  return grid;
}
