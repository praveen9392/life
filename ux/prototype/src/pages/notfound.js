import { h } from "../core/dom.js";
import { icon } from "../core/icons.js";

export default function notFound(view) {
  view.replaceChildren(h("main", { id: "main", style: { minHeight: "70vh", display: "grid", placeItems: "center", padding: "24px" } },
    h("div", { class: "empty" },
      h("div", { class: "empty-icon" }, icon("search", 22)),
      h("h1", { id: "page-title", tabindex: "-1", class: "display", style: { fontSize: "32px" } }, "Page not found"),
      h("p", null, "That address doesn't lead anywhere in Life."),
      h("a", { class: "btn btn-primary", href: "/app", "data-link": "" }, "Back to Today"))));
}
