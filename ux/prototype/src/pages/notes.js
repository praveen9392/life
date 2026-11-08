import { api } from "../core/api.js";
import { debounce, events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { relTime } from "../core/format.js";
import { plainSnippet, renderMarkdown } from "../core/markdown.js";
import { query, setQuery } from "../core/router.js";
import { chip, confirmDialog, emptyState, errorState, input, openMenu, openModal, pageHeader, segmented, select, skeletonRows, toast, toastError } from "../core/ui.js";
import { noteForm, simpleTextForm } from "../forms.js";

const SORTS = { updated: ["updated_at", "desc"], created: ["created_at", "desc"], title: ["title", "asc"] };

export default async function notes(view) {
  const q = query();
  const st = { folder: q.get("folder") || "all", search: "", sort: "updated", noteId: q.get("note"), mode: "write", save: "saved" };
  let folders = { items: [], unfiled_count: 0, total_count: 0 };
  let items = [];
  let loadError = null;
  let current = null;
  let dead = false;
  let dirty = false;

  const root = h("div", { class: "notes" });
  const foldersPane = h("aside", { class: "pane folders-pane", "aria-label": "Folders" });
  const listPane = h("section", { class: "pane list-pane", "aria-label": "Notes" });
  const editorPane = h("section", { class: "pane editor-pane", "aria-label": "Editor" });
  root.append(foldersPane, listPane, editorPane);

  /* ---------- data ---------- */
  const listParams = () => {
    const p = {};
    if (st.search) p.search = st.search;
    if (st.folder === "unfiled") p.unfiled = true;
    else if (st.folder !== "all") p.directory_id = st.folder;
    [p.sort, p.order] = SORTS[st.sort];
    return p;
  };
  let editorFolderSelect = null;
  const folderOptions = () => [["", "Unfiled"], ...folders.items.map((f) => [f.id, f.name])];
  async function loadFolders() {
    try { folders = await api.folders.list(); } catch { /* keep previous */ }
    drawFolders();
    if (editorFolderSelect?.isConnected) {
      editorFolderSelect.replaceChildren(...folderOptions().map(([v, l]) => h("option", { value: v }, l)));
      editorFolderSelect.value = current?.directory_id ?? "";
    }
  }
  async function loadNotes() {
    clear(listPane).append(skeletonRows(4));
    try { const r = await api.notes.list(listParams()); items = r.items; loadError = null; } catch (e) { loadError = e; }
    if (dead) return;
    drawList();
  }

  /* ---------- folders ---------- */
  async function moveNote(noteId, folderId) {
    try {
      if (folderId === null) await api.notes.update(noteId, { directory_id: null });
      else await api.folders.move(folderId, [noteId]);
      toast(folderId === null ? "Moved to Unfiled" : "Note moved");
      if (current?.id === noteId) current.directory_id = folderId;
      await Promise.all([loadFolders(), loadNotes()]);
      if (current?.id === noteId) drawEditor();
    } catch (e) { toastError(e); }
  }

  function folderButton({ key, label, count, droppable, id }) {
    const btn = h("button", { class: "folder-btn", type: "button", "aria-current": String(st.folder === key), onclick: () => { st.folder = key; setQuery({ folder: key === "all" ? "" : key }); drawFolders(); loadNotes(); } },
      icon(key === "all" ? "notes" : key === "unfiled" ? "archive" : "folder", 18), h("span", { class: "truncate" }, label), h("span", { class: "count tnum" }, String(count)));
    if (droppable) {
      btn.addEventListener("dragover", (e) => { e.preventDefault(); btn.classList.add("drop"); });
      btn.addEventListener("dragleave", () => btn.classList.remove("drop"));
      btn.addEventListener("drop", (e) => { e.preventDefault(); btn.classList.remove("drop"); const nid = e.dataTransfer.getData("text/plain"); if (nid) moveNote(nid, id ?? null); });
    }
    return btn;
  }

  function drawFolders() {
    const list = h("div", { class: "folder-list stack-sm", style: { padding: "8px" } },
      folderButton({ key: "all", label: "All notes", count: folders.total_count }),
      folderButton({ key: "unfiled", label: "Unfiled", count: folders.unfiled_count, droppable: true, id: null }),
      ...folders.items.map((f) => {
        const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Actions for folder ${f.name}`, "aria-haspopup": "menu", onclick: () => openMenu(more, [
          { label: "Rename", icon: "edit", onClick: () => simpleTextForm({ title: "Rename folder", label: "Folder name", value: f.name, maxlength: 100, onSave: async (name) => { await api.folders.rename(f.id, name); await loadFolders(); } }) },
          { label: "Delete…", icon: "trash", danger: true, onClick: async () => {
            if (!(await confirmDialog({ title: `Delete "${f.name}"?`, message: `The folder and the ${f.note_count} note${f.note_count === 1 ? "" : "s"} inside it will be deleted.` }))) return;
            try { await api.folders.remove(f.id); if (st.folder === f.id) { st.folder = "all"; setQuery({ folder: "" }); } toast("Folder deleted"); await Promise.all([loadFolders(), loadNotes()]); } catch (e) { toastError(e); }
          } },
        ]) }, icon("more", 16));
        return h("div", { class: "row-gap", style: { gap: 0 } }, h("div", { style: { flex: 1, minWidth: 0 } }, folderButton({ key: f.id, label: f.name, count: f.note_count, droppable: true, id: f.id })), more);
      }));
    const add = h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => simpleTextForm({ title: "New folder", label: "Folder name", maxlength: 100, submitLabel: "Create folder", onSave: async (name) => { const f = await api.folders.create(name); await loadFolders(); st.folder = f.id; setQuery({ folder: f.id }); drawFolders(); loadNotes(); } }) }, icon("plus", 16), "New folder");
    clear(foldersPane).append(h("div", { class: "card-head", style: { padding: "12px 16px" } }, h("h2", { style: { flex: 1, fontSize: "14px" } }, "Folders"), add), list);
  }

  /* ---------- list ---------- */
  function noteRow(n) {
    const row = h("button", { type: "button", class: "row", draggable: "true", "aria-current": String(n.id === st.noteId), style: { width: "100%", border: 0, textAlign: "left", alignItems: "flex-start", background: n.id === st.noteId ? "var(--accent-soft)" : undefined }, onclick: () => openNote(n.id),
      ondragstart: (e) => { e.dataTransfer.setData("text/plain", n.id); e.dataTransfer.effectAllowed = "move"; } },
      h("div", { class: "row-main" }, h("div", { class: "row-gap" }, n.is_pinned ? h("span", { style: { color: "var(--accent)" }, title: "Pinned" }, icon("pin", 14)) : null, h("div", { class: "row-title truncate" }, n.title)),
        h("div", { class: "row-meta", style: { display: "block" } }, h("div", { class: "truncate" }, plainSnippet(n.content) || "Empty note"), h("div", null, relTime(n.updated_at)))));
    return row;
  }

  function drawList() {
    const search = input({ type: "search", placeholder: "Search notes", "aria-label": "Search notes", value: st.search });
    search.addEventListener("input", debounce(() => { st.search = search.value.trim(); loadNotes(); }, 300));
    const sort = select([["updated", "Last edited"], ["created", "Newest"], ["title", "Title A–Z"]], st.sort, { "aria-label": "Sort notes", style: { width: "auto" }, onchange: (e) => { st.sort = e.target.value; loadNotes(); } });
    const head = h("div", { class: "toolbar", style: { padding: "12px", margin: 0, borderBottom: "1px solid var(--line)" } }, h("div", { class: "grow" }, search), sort);
    let body;
    if (loadError) body = errorState(loadError, loadNotes);
    else if (!items.length) body = emptyState({ icon: "notes", title: st.search ? "No notes match" : "No notes here yet", text: st.search ? "Try another search." : "Capture a thought, a plan, or a draft.", action: st.search ? null : h("button", { class: "btn btn-primary", type: "button", onclick: () => noteForm({ directoryId: ["all", "unfiled"].includes(st.folder) ? null : st.folder }) }, "New note") });
    else body = h("div", { class: "rows", style: { maxHeight: "70vh", overflowY: "auto" } }, items.map(noteRow));
    clear(listPane).append(head, body);
    if (st.search) listPane.querySelector("input[type=search]").focus();
  }

  /* ---------- editor ---------- */
  const saveLabel = h("span", { class: "faint", role: "status", "aria-live": "polite", style: { fontSize: "13px" } });
  const showSave = () => { saveLabel.textContent = st.save === "saving" ? "Saving…" : st.save === "error" ? "Not saved - will retry" : st.save === "dirty" ? "Unsaved changes" : "All changes saved"; };

  async function flush() {
    if (!dirty || !current) return;
    const note = current;
    const payload = { title: note.title.trim() || "Untitled note", content: note.content };
    dirty = false; st.save = "saving"; showSave();
    try {
      const saved = await api.notes.update(note.id, payload);
      note.updated_at = saved.updated_at;
      st.save = dirty ? "dirty" : "saved";
      const inList = items.find((x) => x.id === note.id);
      if (inList) { inList.title = note.title; inList.content = note.content; inList.updated_at = saved.updated_at; }
      showSave();
      events.emit("data");
    } catch (e) { dirty = true; st.save = "error"; showSave(); }
  }
  const autosave = debounce(flush, 900);
  const touch = () => { dirty = true; st.save = "dirty"; showSave(); autosave(); };

  async function openNote(id) {
    await flush();
    st.noteId = id;
    setQuery({ note: id });
    current = items.find((n) => n.id === id) ?? null;
    if (!current) { try { current = await api.notes.get(id); } catch (e) { toastError(e); st.noteId = null; setQuery({ note: "" }); } }
    st.mode = "write"; st.save = "saved";
    drawList(); drawEditor();
    root.classList.toggle("editing", !!current);
  }

  function readerModal(n) {
    const body = h("div", { class: "md" });
    body.innerHTML = renderMarkdown(n.content || "*Empty note*");
    openModal({ title: n.title, body, wide: true });
  }

  async function tagsModal(n) {
    let tags = [];
    try { tags = await api.tags.list(); } catch (e) { toastError(e); return; }
    const sel = new Set(n.tags.map((t) => t.id));
    const box = h("div", { class: "chip-scroll", style: { flexWrap: "wrap" } });
    const toggle = (t) => h("button", { type: "button", class: "chip", "aria-pressed": String(sel.has(t.id)), onclick: (e) => { sel.has(t.id) ? sel.delete(t.id) : sel.add(t.id); e.currentTarget.setAttribute("aria-pressed", String(sel.has(t.id))); } }, t.name);
    box.append(...tags.map(toggle));
    const nt = input({ placeholder: "New tag", maxlength: "40", "aria-label": "New tag name" });
    const addTag = async () => { const name = nt.value.trim(); if (!name) return; try { const t = await api.tags.create(name); if (!tags.some((x) => x.id === t.id)) tags.push(t); sel.add(t.id); nt.value = ""; clear(box).append(...tags.map(toggle)); } catch (e) { toastError(e); } };
    nt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } });
    const save = h("button", { class: "btn btn-primary", type: "button", onclick: async () => {
      try { const saved = await api.notes.update(n.id, { tag_ids: [...sel] }); n.tags = saved.tags; dlg.close(); drawEditor(); drawList(); toast("Tags updated"); } catch (e) { toastError(e); }
    } }, "Save tags");
    const dlg = openModal({ title: "Tags", body: [tags.length ? box : h("p", { class: "muted" }, "No tags yet. Create your first below."), h("div", { class: "row-gap" }, nt, h("button", { class: "btn btn-secondary", type: "button", onclick: addTag }, "Add"))], footer: [h("button", { class: "btn btn-secondary", type: "button", onclick: () => dlg.close() }, "Cancel"), save] });
  }

  function drawEditor() {
    const n = current;
    if (!n) {
      clear(editorPane).append(emptyState({ icon: "notes", title: "Select a note", text: "Pick a note from the list, or create a new one.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => noteForm({ directoryId: ["all", "unfiled"].includes(st.folder) ? null : st.folder }) }, "New note") }));
      return;
    }
    const title = h("input", { class: "note-title", value: n.title, maxlength: "200", "aria-label": "Note title", placeholder: "Untitled note", oninput: (e) => { n.title = e.target.value; touch(); } });
    const body = h("textarea", { class: "note-body", "aria-label": "Note content", placeholder: "Start writing… Markdown is supported.", spellcheck: "true", oninput: (e) => { n.content = e.target.value; touch(); } });
    body.value = n.content;
    const preview = h("div", { class: "md", style: { minHeight: "360px" } });
    const draw = () => {
      if (st.mode === "preview") { preview.innerHTML = renderMarkdown(n.content || "*Nothing to preview yet.*"); preview.querySelectorAll("pre[data-lang=mermaid]").forEach((pre) => pre.insertAdjacentElement("beforebegin", h("p", { class: "faint", style: { fontSize: "13px" } }, "Diagram source (diagram rendering isn't part of this prototype)"))); }
      body.hidden = st.mode !== "write"; preview.hidden = st.mode !== "preview";
    };
    const folderSel = select(folderOptions(), n.directory_id ?? "", { "aria-label": "Folder", style: { width: "auto", minHeight: "32px", padding: "2px 8px" }, onchange: (e) => moveNote(n.id, e.target.value || null) });
    editorFolderSelect = folderSel;
    const menuBtn = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": "Note actions", "aria-haspopup": "menu", onclick: () => openMenu(menuBtn, [
      { label: n.is_pinned ? "Unpin" : "Pin to top", icon: "pin", onClick: async () => { try { const s = await api.notes.update(n.id, { is_pinned: !n.is_pinned }); n.is_pinned = s.is_pinned; await loadNotes(); drawEditor(); } catch (e) { toastError(e); } } },
      { label: "Read full screen", icon: "eye", onClick: () => readerModal(n) },
      { label: "Edit tags", icon: "tag", onClick: () => tagsModal(n) },
      { label: "Archive…", icon: "archive", onClick: async () => {
        if (!(await confirmDialog({ title: "Archive this note?", message: "Archived notes are hidden from every list and search. Life can't restore them yet, so archive only what you no longer need.", confirmLabel: "Archive", danger: false }))) return;
        await flush();
        try { await api.notes.update(n.id, { is_archived: true }); closeEditor(); await Promise.all([loadNotes(), loadFolders()]); toast("Note archived"); events.emit("data"); } catch (e) { toastError(e); }
      } },
      "-",
      { label: "Delete…", icon: "trash", danger: true, onClick: async () => { if (!(await confirmDialog({ title: "Delete this note?", message: `"${n.title}" will be permanently deleted.` }))) return; try { dirty = false; await api.notes.remove(n.id); closeEditor(); toast("Note deleted"); await Promise.all([loadNotes(), loadFolders()]); events.emit("data"); } catch (e) { toastError(e); } } },
    ]) }, icon("more", 18));
    const tagRow = h("div", { class: "row-gap", style: { flexWrap: "wrap" } }, ...n.tags.map((t) => chip(t.name)), h("button", { class: "chip", type: "button", onclick: () => tagsModal(n) }, icon("plus", 12), n.tags.length ? "Tags" : "Add tag"));
    clear(editorPane).append(h("div", { class: "note-editor" },
      h("div", { class: "row-gap" }, h("button", { class: "btn btn-ghost btn-sm back-btn", type: "button", onclick: closeEditor }, icon("left", 16), "Notes"), h("span", { class: "spacer" }), saveLabel, menuBtn),
      title, h("div", { class: "row-gap", style: { flexWrap: "wrap" } }, folderSel, segmented([["write", "Write"], ["preview", "Preview"]], st.mode, (v) => { st.mode = v; draw(); }, "Editor mode")), tagRow, body, preview));
    draw(); showSave();
  }

  async function closeEditor() {
    await flush();
    current = null; st.noteId = null; setQuery({ note: "" });
    root.classList.remove("editing");
    drawList(); drawEditor();
  }

  /* ---------- boot ---------- */
  view.replaceChildren(
    pageHeader({ eyebrow: "Capture", title: "Notes", module: "notes", subtitle: "Write freely. Organise when you're ready.", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => noteForm({ directoryId: ["all", "unfiled"].includes(st.folder) ? null : st.folder }) }, icon("plus", 18), "New note")] }),
    root);
  drawFolders(); drawEditor();
  await Promise.all([loadFolders(), loadNotes()]);
  if (st.noteId) await openNote(st.noteId);
  const onHide = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onHide);
  return () => { dead = true; autosave.cancel(); document.removeEventListener("visibilitychange", onHide); flush(); };
}
