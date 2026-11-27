class ToDoChromeBar {
  get ICON() {
    return {
      plus: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      repeat: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
      list: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      search: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
      back: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
      reset: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/></svg>`,
    };
  }

  /** The one To-Do note. It always shows today; the week strip picks other days. */
  static get TODAY_PATH() { return "spice/to-do/To-Do.md"; }

  /** Where `sauce update` installs the To-Do note's layout. */
  static get TEMPLATE_PATH() { return "ranch/templates/To-Do.md"; }

  /**
   * PURE. The To-Do note rebuilt from the installed template: the template up
   * to and including the marker, then whatever the note holds below its own
   * marker. A note with no marker keeps its text minus its frontmatter and its
   * ToDoChromeBar / ToDoDailyFilterView blocks. Returns null when the template
   * has no marker. Idempotent. Kept in step with install.js's
   * _resetToDoSingleBody (run-todo-single-note.js checks they agree).
   */
  static resetBody(current, canonical) {
    // Everything above this line in To-Do.md is Sauce's; everything below is yours.
    const marker = "[//]: # (TODO_CHROME_END)";
    const canon = typeof canonical === "string" ? canonical : "";
    const at = canon.indexOf(marker);
    if (at < 0) return null;
    const head = canon.slice(0, at + marker.length);
    const cur = typeof current === "string" ? current : "";
    const mine = cur.indexOf(marker);
    let tail;
    if (mine >= 0) {
      tail = cur.slice(mine + marker.length);
    } else {
      tail = cur
        .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
        .replace(/```dataviewjs[ \t]*\r?\n[^`]*?class:\s*"(?:ToDoChromeBar|ToDoDailyFilterView)"[^`]*?```/g, "");
    }
    tail = tail.trim();
    return head + (tail ? "\n\n" + tail + "\n" : "\n");
  }

  /** Open To-Do.md, creating it from the installed template when it is missing. */
  static async openToday() {
    const path = ToDoChromeBar.TODAY_PATH;
    try {
      let file = app.vault.getAbstractFileByPath(path);
      if (!file) {
        const tpl = app.vault.getAbstractFileByPath(ToDoChromeBar.TEMPLATE_PATH);
        const body = tpl ? ToDoChromeBar.resetBody("", await app.vault.read(tpl)) : null;
        if (body == null) {
          if (typeof Notice === "function") new Notice(`Could not find the To-Do layout at ${ToDoChromeBar.TEMPLATE_PATH}. Run sauce update.`, 8000);
          return;
        }
        try { file = await app.vault.create(path, body); }
        catch (e) { if (!/already exists|exists/i.test((e && e.message) || "")) throw e; }
      }
      await app.workspace.openLinkText(path, "");
    } catch (e) { if (typeof Notice === "function") new Notice("Could not open To-Do: " + (e.message || e), 6000); }
  }

  /**
   * Rewrite the To-Do note's Sauce part from the installed template, keeping
   * everything below the marker. Copies the old note to .sauce-backup/to-do/
   * first. Writes only the To-Do note.
   */
  static async resetLayout(path) {
    const target = path || ToDoChromeBar.TODAY_PATH;
    try {
      const tpl = app.vault.getAbstractFileByPath(ToDoChromeBar.TEMPLATE_PATH);
      const canonical = tpl ? await app.vault.read(tpl) : "";
      if (ToDoChromeBar.resetBody("", canonical) == null) {
        if (typeof Notice === "function") new Notice(`Could not find the To-Do layout at ${ToDoChromeBar.TEMPLATE_PATH}. Run sauce update.`, 8000);
        return { ok: false, reason: "no-template" };
      }
      const file = app.vault.getAbstractFileByPath(target);
      if (!file) {
        await app.vault.create(target, ToDoChromeBar.resetBody("", canonical));
        if (typeof Notice === "function") new Notice("To-Do recreated from the Sauce layout.", 5000);
        return { ok: true, action: "created" };
      }
      const before = await app.vault.read(file);
      const after = ToDoChromeBar.resetBody(before, canonical);
      if (after === before) {
        if (typeof Notice === "function") new Notice("To-Do already matches the Sauce layout.", 4000);
        return { ok: true, action: "unchanged" };
      }
      const stamp = (window.moment ? window.moment().format("YYYYMMDD-HHmmss") : "backup");
      const backupDir = ".sauce-backup/to-do";
      const backupPath = `${backupDir}/To-Do.md.${stamp}`;
      try {
        if (!(await app.vault.adapter.exists(backupDir))) await app.vault.adapter.mkdir(backupDir);
        await app.vault.adapter.write(backupPath, before);
      } catch (_e) { /* best effort */ }
      await app.vault.modify(file, after);
      if (typeof Notice === "function") new Notice(`To-Do reset to the Sauce layout. The old copy is at ${backupPath}.`, 6000);
      return { ok: true, action: "reset", backupPath };
    } catch (e) {
      if (typeof Notice === "function") new Notice("Could not reset To-Do: " + (e.message || e), 6000);
      return { ok: false, reason: "error" };
    }
  }

  render(dv) {
    try {
      if (!customJS || !customJS.ChromeBar || typeof customJS.ChromeBar.makeAdapter !== "function"
        || typeof customJS.ChromeBar.render !== "function") return;
      return customJS.ChromeBar.render(dv, customJS.ChromeBar.makeAdapter(this._config()));
    } catch (_e) { /* never throw */ }
  }

  _config() {
    const ICON = this.ICON;
    const ROOT = "spice/to-do";
    return {
      detect: (dv, page) => {
        const t = page && page.type;
        if (t === "to-do") return { context: "to-do", path: (page.file && page.file.path) || "" };
        if (t === "to-do-today") return { context: "to-do-today", path: (page.file && page.file.path) || "" };
        if (t === "to-do-hub") return { context: "to-do-hub", path: (page.file && page.file.path) || "" };
        if (t === "project-todo") return { context: "project-todo", path: (page.file && page.file.path) || "" };
        if (t === "to-do-recurring") return { context: "to-do-recurring", path: (page.file && page.file.path) || "" };
        if (t === "to-do-recurring-list") return { context: "to-do-recurring-list", path: (page.file && page.file.path) || "" };
        return null;
      },
      surfaceSpec: (ctx) => {
        const iconActions = [{ id: "jump", label: "Jump to task or note", icon: ICON.search }];
        if (ctx.context === "to-do" || ctx.context === "to-do-today") {
          const overflow = [
            { id: "recurring", label: "Recurring", icon: ICON.repeat },
            { id: "all-todos", label: "All To-Dos", icon: ICON.list },
            { id: "completed-tasks", label: "Completed", icon: ICON.list },
          ];
          if (ctx.context === "to-do-today") overflow.push({ id: "reset-layout", label: "Reset to Sauce layout", icon: ICON.reset });
          return {
            primary: { id: "new-task", label: "New Task", icon: ICON.plus },
            overflow,
            leaf: true,
            iconActions,
          };
        }
        if (ctx.context === "to-do-hub") {
          return {
            primary: null,
            overflow: [{ id: "back-today", label: "Back to Today", icon: ICON.back }],
            leaf: false,
            iconActions,
          };
        }
        if (ctx.context === "project-todo") {
          return {
            primary: { id: "new-task", label: "New Task", icon: ICON.plus },
            overflow: [{ id: "recurring", label: "Recurring", icon: ICON.repeat }],
            leaf: true,
            iconActions,
          };
        }
        if (ctx.context === "to-do-recurring") {
          return {
            primary: null,
            overflow: [
              { id: "all-todos", label: "All To-Dos", icon: ICON.list },
              { id: "completed-tasks", label: "Completed", icon: ICON.list },
            ],
            leaf: true,
            iconActions,
          };
        }
        if (ctx.context === "to-do-recurring-list") {
          return {
            primary: null,
            overflow: [
              { id: "all-todos", label: "All To-Dos", icon: ICON.list },
              { id: "completed-tasks", label: "Completed", icon: ICON.list },
            ],
            leaf: true,
            iconActions,
          };
        }
        return { primary: null, overflow: [], leaf: false };
      },
      dispatch: (dv, ctx, id) => {
        if (id === "jump") {
          try { window.customJS.TaskJump.open(); }
          catch (e) { if (typeof Notice === "function") new Notice("Could not open Jump: " + (e.message || e), 6000); }
          return;
        }
        if (id === "new-task") {
          if (ctx.context === "project-todo") {
            try {
              let cur = null; try { cur = dv && dv.current ? dv.current() : null; } catch (_e) { cur = null; }
              const cleanName = (v) => {
                if (v == null) return "";
                if (typeof v === "object" && v !== null && ("path" in v || "display" in v)) {
                  const p = v.path != null ? String(v.path).trim() : "";
                  if (p) { const sl = p.lastIndexOf("/"); return (sl >= 0 ? p.slice(sl + 1) : p).replace(/\.md$/i, ""); }
                  return v.display != null ? String(v.display).trim() : "";
                }
                if (typeof v === "string") {
                  let s = v.trim(); const m = /^\[\[([^\]]*)\]\]$/.exec(s); if (m) s = m[1].trim();
                  const pipe = s.indexOf("|"); if (pipe >= 0) s = s.slice(0, pipe).trim();
                  const sl = s.lastIndexOf("/"); if (sl >= 0) s = s.slice(sl + 1);
                  return s.replace(/\.md$/i, "");
                }
                return String(v);
              };
              const slugify = (n) => String(n == null ? "" : n).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
              const name = cleanName(cur && cur.project);
              const slug = (cur && cur.project_slug) || (name ? slugify(name) : "");
              window.customJS.TaskDialog.open({ surface: "project", project: { name, slug } });
            } catch (e) { if (typeof Notice === "function") new Notice("Could not open task dialog: " + (e.message || e), 6000); }
          } else {
            try {
              window.customJS.TaskDialog.open({ surface: "daily", today: window.moment().format("YYYY-MM-DD") });
            } catch (e) { if (typeof Notice === "function") new Notice("Could not open task dialog: " + (e.message || e), 6000); }
          }
          return;
        }
        if (id === "recurring") {
          try { app.workspace.openLinkText("spice/to-do/Recurring.md", ""); }
          catch (e) { if (typeof Notice === "function") new Notice("Could not open Recurring: " + (e.message || e), 6000); }
          return;
        }
        if (id === "all-todos") {
          try { app.workspace.openLinkText("spice/to-do/All-ToDos.md", ""); }
          catch (e) { if (typeof Notice === "function") new Notice("Could not open All To-Dos: " + (e.message || e), 6000); }
          return;
        }
        if (id === "completed-tasks") {
          try { app.workspace.openLinkText("spice/to-do/Completed Tasks.md", ""); }
          catch (e) { if (typeof Notice === "function") new Notice("Could not open Completed Tasks: " + (e.message || e), 6000); }
          return;
        }
        if (id === "back-today") {
          return ToDoChromeBar.openToday();
        }
        if (id === "reset-layout") {
          return ToDoChromeBar.resetLayout(ctx && ctx.path);
        }
      },
      destinations: (dv, ctx) => {
        const out = [{ section: "This to-do" }];
        let curPath = ctx && ctx.path;
        if (!curPath) { try { const c = dv && dv.current ? dv.current() : null; curPath = (c && c.file && c.file.path) || ""; } catch (_e) { curPath = ""; } }
        const open = (p) => { try { customJS.ChromeBar.openNavTarget(p, dv); } catch (_e) {} };
        const todayPath = ToDoChromeBar.TODAY_PATH;
        if (curPath !== todayPath) {
          out.push({ label: "Today's To-Do", icon: ICON.back, _navTarget: todayPath, onSelect: () => ToDoChromeBar.openToday() });
        }
        const allPath = "spice/to-do/All-ToDos.md";
        if (curPath !== allPath) {
          out.push({ label: "All To-Dos", icon: ICON.list, _navTarget: allPath, onSelect: () => open(allPath) });
        }
        const completedPath = "spice/to-do/Completed Tasks.md";
        if (curPath !== completedPath) {
          out.push({ label: "Completed Tasks", icon: ICON.list, _navTarget: completedPath, onSelect: () => open(completedPath) });
        }
        return out;
      },
      rootClass: "todo-chrome-root",
      btnClass: (v) => `todo-chrome-btn todo-chrome-btn-${v}`,
    };
  }
}
