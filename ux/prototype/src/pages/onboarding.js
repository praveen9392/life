import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { navigate } from "../core/router.js";
import { applyTheme, session, setUser } from "../core/session.js";
import { field, input, select, toastError, withBusy } from "../core/ui.js";
import { NOTIFICATION_LABELS, guessTimezone, timezones } from "../prefs.js";

export default function onboarding(view) {
  const u = session.user;
  const state = {
    step: 0,
    name: u.full_name ?? "",
    tz: u.timezone && u.timezone !== "UTC" ? u.timezone : guessTimezone(),
    theme: u.theme_preference ?? "system",
    notifications: { ...u.notification_preferences },
  };
  const STEPS = ["About you", "Look & feel", "Reminders"];

  const finish = async (btn, skip) => {
    try {
      await withBusy(btn, async () => {
        if (!skip) {
          const updated = await api.me.update({ full_name: state.name.trim() || null, timezone: state.tz, theme_preference: state.theme, notification_preferences: state.notifications });
          setUser(updated);
        }
        setUser(await api.me.onboard());
      });
      navigate("/app", { replace: true });
    } catch (e) { toastError(e); }
  };

  const draw = () => {
    const name = input({ name: "full_name", value: state.name, maxlength: "100", oninput: (e) => { state.name = e.target.value; }, autocomplete: "name" });
    const tz = select(timezones(state.tz).map((z) => [z, z]), state.tz, { onchange: (e) => { state.tz = e.target.value; } });
    let body;
    if (state.step === 0) {
      body = [h("h2", { class: "display", style: { fontSize: "26px" } }, "Let's set up your day"),
        field({ label: "What should we call you?", control: name }),
        field({ label: "Your timezone", control: tz, hint: "Decides when \"today\" starts for habits, streaks and reminders." })];
    } else if (state.step === 1) {
      body = [h("h2", { class: "display", style: { fontSize: "26px" } }, "Pick a look"),
        h("div", { class: "field-row", role: "radiogroup", "aria-label": "Theme" }, ["light", "dark", "system"].map((t) =>
          h("button", { type: "button", role: "radio", "aria-checked": String(state.theme === t), class: "card", style: { textAlign: "left", cursor: "pointer", borderColor: state.theme === t ? "var(--accent)" : undefined, boxShadow: state.theme === t ? "0 0 0 1px var(--accent) inset" : undefined }, onclick: () => { state.theme = t; applyTheme(t); draw(); } },
            h("strong", { style: { textTransform: "capitalize" } }, t), h("div", { class: "muted", style: { fontSize: "13px", marginTop: "4px" } }, t === "system" ? "Match this device" : t === "light" ? "Warm paper" : "Easy on the eyes"))))];
    } else {
      body = [h("h2", { class: "display", style: { fontSize: "26px" } }, "What should nudge you?"),
        h("div", { class: "stack-sm" }, Object.entries(NOTIFICATION_LABELS).map(([key, label]) =>
          h("label", { class: "card check", style: { padding: "12px 16px", justifyContent: "space-between" } }, label,
            h("input", { type: "checkbox", checked: state.notifications[key] !== false, onchange: (e) => { state.notifications[key] = e.target.checked; } }))))];
    }
    const last = state.step === STEPS.length - 1;
    const next = h("button", { class: "btn btn-primary", type: "button", onclick: (e) => (last ? finish(e.currentTarget, false) : (state.step++, draw())) }, last ? "Finish" : "Continue");
    const skipBtn = h("button", { class: "btn btn-ghost", type: "button", onclick: (e) => finish(e.currentTarget, true) }, "Skip for now");
    view.replaceChildren(h("main", { id: "main", style: { minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" } },
      h("div", { class: "stack", style: { width: "min(520px, 100%)" } },
        h("div", { class: "row-gap" }, h("span", { class: "brand-mark", style: { background: "var(--accent)", color: "var(--accent-ink)", width: "32px", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center" } }, icon("bolt", 18)), h("strong", { class: "display", style: { fontSize: "22px" } }, "Life"), h("span", { class: "spacer" }), h("span", { class: "muted", role: "status" }, `Step ${state.step + 1} of ${STEPS.length} - ${STEPS[state.step]}`)),
        h("div", { class: "progress", "aria-hidden": "true" }, h("span", { style: { width: `${((state.step + 1) / STEPS.length) * 100}%` } })),
        h("div", { class: "card stack", id: "page-title", tabindex: "-1", style: { padding: "28px" } }, body),
        h("div", { class: "row-gap" }, state.step > 0 ? h("button", { class: "btn btn-secondary", type: "button", onclick: () => { state.step--; draw(); } }, "Back") : null, h("span", { class: "spacer" }), skipBtn, next))));
    (view.querySelector("input,select,[role=radio]"))?.focus?.({ preventScroll: true });
  };
  draw();
}
