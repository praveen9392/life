import { api, ApiError, DEMO_MODE } from "../core/api.js";
import { h } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { navigate } from "../core/router.js";
import { setUser } from "../core/session.js";
import { field, input, withBusy } from "../core/ui.js";

function authShell(view, { title, subtitle, form, footer }) {
  const fileNote = DEMO_MODE
    ? h("div", { class: "banner", role: "note" },
        h("span", null, h("strong", null, "Demo mode. "), "Everything here runs on sample data inside your browser - no server needed. Any email and password will sign you in (an email like ava@example.com and a 10+ character password for sign-up)."))
    : null;
  view.replaceChildren(h("div", { class: "auth" },
    h("aside", { class: "auth-aside", "aria-hidden": "true" },
      h("div", { class: "brand", style: { color: "inherit", padding: 0 } }, h("span", { class: "brand-mark", style: { background: "var(--accent-ink)", color: "var(--accent)" } }, icon("bolt", 18)), h("span", { class: "brand-name" }, "Life")),
      h("div", null, h("p", { class: "display" }, "One calm place for the whole day."),
        h("ul", { style: { marginTop: "24px" } },
          ["Tick off today's habits and tasks", "Capture notes without leaving the keyboard", "See honest progress, never invented scores"].map((t) => h("li", null, icon("check", 20), t)))),
      h("small", { style: { opacity: 0.8 } }, "Your data stays yours, isolated per account.")),
    h("main", { class: "auth-main", id: "main" },
      h("div", { class: "auth-card stack" }, h("div", null, h("h1", { id: "page-title", tabindex: "-1" }, title), h("p", { class: "muted", style: { marginTop: "6px" } }, subtitle)), fileNote, form, footer))));
}

function passwordControl(name, autocomplete) {
  const control = input({ name, type: "password", autocomplete, required: false });
  const toggle = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": "Show password", "aria-pressed": "false", onclick: () => {
    const show = control.type === "password";
    control.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.replaceChildren(icon(show ? "eyeoff" : "eye", 18));
  } }, icon("eye", 18));
  control.style.paddingRight = "44px";
  return { control, wrap: h("div", { class: "input-group" }, control, toggle) };
}

async function afterAuth(user) {
  setUser(user);
  navigate(user.onboarding_completed_at ? "/app" : "/onboarding", { replace: true });
}

export function loginPage(view) {
  const email = input({ name: "email", type: "email", autocomplete: "username", placeholder: "you@example.com" });
  const pw = passwordControl("password", "current-password");
  const banner = h("div", { class: "banner banner-danger", role: "alert", hidden: true });
  const submit = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", minHeight: "44px" } }, "Log in");
  const form = h("form", { class: "stack", novalidate: "", onsubmit: async (e) => {
    e.preventDefault();
    banner.hidden = true;
    form.querySelectorAll(".error").forEach((n) => n.remove());
    const problems = [];
    if (!email.value.trim()) problems.push([email, "Enter your email."]);
    if (!pw.control.value) problems.push([pw.control, "Enter your password."]);
    if (problems.length) {
      problems.forEach(([c, m]) => { c.setAttribute("aria-invalid", "true"); (c.closest(".field")).append(h("div", { class: "error", role: "alert" }, m)); });
      problems[0][0].focus();
      return;
    }
    try {
      const res = await withBusy(submit, () => api.auth.login({ email: email.value.trim(), password: pw.control.value }));
      await afterAuth(res.user);
    } catch (err) {
      banner.textContent = err instanceof ApiError ? err.message : "Something went wrong.";
      banner.hidden = false;
    }
  } }, banner, field({ label: "Email", control: email }), field({ label: "Password", control: pw.wrap, target: pw.control }), submit);
  authShell(view, {
    title: "Welcome back", subtitle: "Log in to pick up where you left off.", form,
    footer: h("p", { class: "muted" }, "New here? ", h("a", { href: "/register", "data-link": "" }, "Create an account")),
  });
}

export function registerPage(view) {
  const name = input({ name: "full_name", autocomplete: "name", maxlength: "100" });
  const email = input({ name: "email", type: "email", autocomplete: "username" });
  const pw = passwordControl("password", "new-password");
  const banner = h("div", { class: "banner banner-danger", role: "alert", hidden: true });
  const submit = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", minHeight: "44px" } }, "Create account");
  const form = h("form", { class: "stack", novalidate: "", onsubmit: async (e) => {
    e.preventDefault();
    banner.hidden = true;
    form.querySelectorAll(".error").forEach((n) => n.remove());
    const problems = [];
    if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) problems.push([email, "Enter a valid email address."]);
    if (pw.control.value.length < 10) problems.push([pw.control, "Use at least 10 characters."]);
    if (problems.length) {
      problems.forEach(([c, m]) => { c.setAttribute("aria-invalid", "true"); c.closest(".field").append(h("div", { class: "error", role: "alert" }, m)); });
      problems[0][0].focus();
      return;
    }
    try {
      const res = await withBusy(submit, () => api.auth.register({ email: email.value.trim(), password: pw.control.value, ...(name.value.trim() ? { full_name: name.value.trim() } : {}) }));
      await afterAuth(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        Object.entries(err.fields).forEach(([k, v]) => {
          const c = form.querySelector(`[name="${k.split(".").pop()}"]`);
          if (c) { c.setAttribute("aria-invalid", "true"); c.closest(".field").append(h("div", { class: "error", role: "alert" }, v)); }
        });
      } else {
        banner.textContent = err instanceof ApiError ? err.message : "Something went wrong.";
        banner.hidden = false;
      }
    }
  } }, banner, field({ label: "Name (optional)", control: name }), field({ label: "Email", control: email }), field({ label: "Password", control: pw.wrap, target: pw.control, hint: "At least 10 characters." }), submit);
  authShell(view, {
    title: "Create your account", subtitle: "Takes a minute. No credit card, no spam.", form,
    footer: h("p", { class: "muted" }, "Already have an account? ", h("a", { href: "/login", "data-link": "" }, "Log in")),
  });
}
