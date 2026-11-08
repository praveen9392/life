import { api, ApiError } from "../core/api.js";
import { events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { fmtDateTime, parseUA, todayISO } from "../core/format.js";
import { session, setTheme, setUser } from "../core/session.js";
import { chip, confirmDialog, emptyState, errorMessage, field, input, openModal, pageHeader, select, toast, toastError, withBusy } from "../core/ui.js";
import { NOTIFICATION_LABELS, timezones } from "../prefs.js";
import { logout } from "../shell.js";

function section(title, description, ...children) {
  return h("section", { class: "card stack", "aria-labelledby": `s-${title.replace(/\W+/g, "-")}` },
    h("div", null, h("h2", { id: `s-${title.replace(/\W+/g, "-")}`, style: { fontSize: "18px" } }, title), description ? h("p", { class: "muted", style: { fontSize: "14px", marginTop: "2px" } }, description) : null), ...children);
}

export default async function settings(view) {
  const u = session.user;

  /* profile */
  const name = input({ name: "full_name", value: u.full_name ?? "", maxlength: "100", autocomplete: "name" });
  const tz = select(timezones(u.timezone).map((z) => [z, z]), u.timezone, { name: "timezone" });
  const saveProfile = h("button", { class: "btn btn-primary", type: "submit" }, "Save profile");
  const profile = section("Profile", `Signed in as ${u.email}. Your email can't be changed in this version.`,
    h("form", { class: "stack", novalidate: "", onsubmit: async (e) => {
      e.preventDefault();
      try { await withBusy(saveProfile, async () => setUser(await api.me.update({ full_name: name.value.trim() || null, timezone: tz.value }))); toast("Profile saved"); events.emit("refresh"); } catch (err) { toastError(err); }
    } }, field({ label: "Name", control: name }), field({ label: "Timezone", control: tz, hint: "Decides when \"today\" starts for habits, streaks and reminders." }), h("div", null, saveProfile)));

  /* appearance */
  const themeSeg = h("div", { class: "field-row", role: "radiogroup", "aria-label": "Theme" });
  const drawTheme = () => {
    const pref = document.documentElement.dataset.themePref ?? session.user.theme_preference;
    clear(themeSeg).append(...[["light", "Light", "Warm paper"], ["dark", "Dark", "Easy on the eyes"], ["system", "System", "Match this device"]].map(([v, l, d]) =>
      h("button", { type: "button", role: "radio", "aria-checked": String(pref === v), class: "card", style: { textAlign: "left", cursor: "pointer", padding: "14px", borderColor: pref === v ? "var(--accent)" : undefined, boxShadow: pref === v ? "0 0 0 1px var(--accent) inset" : undefined },
        onclick: async () => { try { await setTheme(v); drawTheme(); toast("Theme saved"); } catch (e) { toastError(e); } } }, h("strong", null, l), h("div", { class: "muted", style: { fontSize: "13px" } }, d))));
  };
  drawTheme();
  const appearance = section("Appearance", "Saved to your account, so it follows you across devices.", themeSeg);

  /* notifications */
  const prefs = { ...u.notification_preferences };
  const notifications = section("Notifications", "Choose which reminders you'd like to see.", h("div", { class: "stack-sm" }, Object.entries(NOTIFICATION_LABELS).map(([key, label]) =>
    h("label", { class: "card check", style: { padding: "12px 16px", justifyContent: "space-between" } }, label,
      h("input", { type: "checkbox", checked: prefs[key] !== false, "aria-label": label, onchange: async (e) => {
        const next = e.target.checked;
        try { setUser(await api.me.update({ notification_preferences: { ...prefs, [key]: next } })); prefs[key] = next; toast("Saved"); } catch (err) { e.target.checked = !next; toastError(err); }
      } })))));

  /* security */
  const cur = input({ name: "current_password", type: "password", autocomplete: "current-password" });
  const nw = input({ name: "new_password", type: "password", autocomplete: "new-password" });
  const pwBtn = h("button", { class: "btn btn-secondary", type: "submit" }, "Change password");
  const pwForm = h("form", { class: "stack", novalidate: "", onsubmit: async (e) => {
    e.preventDefault();
    pwForm.querySelectorAll(".error").forEach((n) => n.remove());
    const problem = !cur.value ? [cur, "Enter your current password."] : nw.value.length < 10 ? [nw, "Use at least 10 characters."] : nw.value === cur.value ? [nw, "The new password must be different."] : null;
    if (problem) { problem[0].setAttribute("aria-invalid", "true"); problem[0].closest(".field").append(h("div", { class: "error", role: "alert" }, problem[1])); problem[0].focus(); return; }
    try { await withBusy(pwBtn, () => api.me.password({ current_password: cur.value, new_password: nw.value })); cur.value = ""; nw.value = ""; toast("Password changed. Other devices were signed out."); loadSessions(); }
    catch (err) { const target = err instanceof ApiError && err.fields?.current_password ? cur : nw; target.closest(".field").append(h("div", { class: "error", role: "alert" }, errorMessage(err))); target.focus(); }
  } }, field({ label: "Current password", control: cur }), field({ label: "New password", control: nw, hint: "At least 10 characters." }), h("div", null, pwBtn));

  const sessionsHost = h("div", { class: "stack-sm" });
  async function loadSessions() {
    try {
      const list = (await api.me.sessions()).sort((a, b) => Number(b.is_current) - Number(a.is_current) || new Date(b.created_at) - new Date(a.created_at));
      clear(sessionsHost).append(...(list.length ? list.map((s) => h("div", { class: "card row-gap", style: { padding: "12px 16px" } }, icon("settings", 18),
        h("div", { style: { flex: 1, minWidth: 0 } }, h("div", { class: "row-gap" }, h("strong", { class: "truncate" }, parseUA(s.user_agent)), s.is_current ? chip("This device", "accent") : null), h("div", { class: "faint", style: { fontSize: "13px" } }, `Signed in ${fmtDateTime(s.created_at)}`)),
        s.is_current ? null : h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: async () => { if (!(await confirmDialog({ title: "Sign out this device?", message: `${parseUA(s.user_agent)} will be signed out.`, confirmLabel: "Sign out" }))) return; try { await api.me.revoke(s.id); toast("Device signed out"); loadSessions(); } catch (e) { toastError(e); } } }, "Sign out"))) : [emptyState({ icon: "settings", title: "No active sessions" })]));
    } catch (e) { clear(sessionsHost).append(h("p", { class: "muted" }, "Couldn't load your sessions.")); }
  }
  const security = section("Security", "Change your password and review where you're signed in.", pwForm, h("div", null, h("h3", { style: { fontSize: "15px", margin: "8px 0" } }, "Active sessions"), sessionsHost),
    h("div", null, h("button", { class: "btn btn-secondary", type: "button", onclick: async () => { if (await confirmDialog({ title: "Log out everywhere?", message: "This ends every session on every device, including this one.", confirmLabel: "Log out everywhere" })) logout(true); } }, icon("logout", 18), "Log out everywhere")));

  /* privacy */
  const exportBtn = h("button", { class: "btn btn-secondary", type: "button" }, icon("download", 18), "Export my data");
  exportBtn.addEventListener("click", () => withBusy(exportBtn, async () => {
    try {
      const data = await api.me.export();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = h("a", { href: url, download: `life-export-${todayISO()}.json` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Export downloaded");
    } catch (e) { toastError(e); }
  }));
  const deleteBtn = h("button", { class: "btn btn-ghost", type: "button", style: { color: "var(--danger)" }, onclick: () => {
    const confirmText = input({ placeholder: "Type delete", "aria-label": "Type delete to confirm", autocomplete: "off" });
    const pw = input({ type: "password", placeholder: "Current password", "aria-label": "Current password", autocomplete: "current-password" });
    const go = h("button", { class: "btn btn-danger", type: "button", disabled: true }, "Delete forever");
    const sync = () => { go.disabled = confirmText.value !== "delete" || !pw.value; };
    confirmText.addEventListener("input", sync); pw.addEventListener("input", sync);
    const dlg = openModal({ title: "Delete your account?", body: [h("p", { class: "muted" }, "This permanently deletes your account and everything in it: tasks, habits, notes, health data and more. It can't be undone."), field({ label: "Type delete to confirm", control: confirmText }), field({ label: "Current password", control: pw })],
      footer: [h("button", { class: "btn btn-secondary", type: "button", onclick: () => dlg.close() }, "Cancel"), go] });
    go.addEventListener("click", () => withBusy(go, async () => { try { await api.me.deleteAccount({ current_password: pw.value }); dlg.close(); events.emit("session-ended"); } catch (e) { toastError(e); } }));
  } }, "Delete account…");
  const privacy = section("Privacy & data", "Take a complete copy of your data, or delete your account for good.", h("div", { class: "row-gap", style: { flexWrap: "wrap" } }, exportBtn, deleteBtn));

  view.replaceChildren(
    pageHeader({ eyebrow: "Account", title: "Settings", module: "calendar", subtitle: "Profile, appearance, reminders and security." }),
    h("div", { class: "stack", style: { maxWidth: "720px" } }, profile, appearance, notifications, security, privacy));
  loadSessions();
}
