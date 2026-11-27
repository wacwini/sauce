#!/usr/bin/env node
/**
 * run-todo-single-note.js — To-Do is one note, spice/to-do/To-Do.md, that
 * always shows today (the week strip picks other days), instead of a new
 * ToDo-YYYY-MM-DD.md every day. Every way in (the To Do button, the To-Do
 * menu, All To-Dos, the daily dashboard) opens it, and its menu can put the
 * note back to the installed layout. The installer creates and repairs it.
 * The old dated notes are never touched.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const loadClass = (rel, name) => new Function(`${read(rel)}\nreturn ${name};`)();

const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(`  ${c ? 'PASS' : 'FAIL'} — ${n}`); };

const MARKER = '[//]: # (TODO_CHROME_END)';
const TEMPLATE_SRC = read('platform/blueprints/to-do/templates/To-Do.md');
const RENDERED = TEMPLATE_SRC.replace(/\{\{views_path\}\}/g, 'ranch/views').replace(/\{\{vault_identity_tag\}\}/g, 'demo-sauce');
const Bar = loadClass('platform/blueprints/to-do/helpers/todo-chrome-bar.js', 'ToDoChromeBar');
const install = require('../install.js');

const bar = (cls) => '```dataviewjs\nawait dv.view("ranch/views/customjs-guard", { class: "' + cls + '" });\n```\n';

(async () => {
  // ── Template ──────────────────────────────────────────────────────────────
  {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(TEMPLATE_SRC);
    ok('TSN-TEMPLATE-1 the To-Do template is a type: to-do-today note',
      !!fm && /^type: to-do-today$/m.test(fm[1]));
    ok('TSN-TEMPLATE-2 chrome bar, then the day view, then the marker as the last line',
      TEMPLATE_SRC.indexOf('class: "ToDoChromeBar"') > 0
      && TEMPLATE_SRC.indexOf('class: "ToDoChromeBar"') < TEMPLATE_SRC.indexOf('class: "ToDoDailyFilterView"')
      && TEMPLATE_SRC.endsWith(MARKER + '\n'));
    ok('TSN-TEMPLATE-3 no Templater syntax, so a plain copy of the template is the finished note',
      !TEMPLATE_SRC.includes('<%'));
  }

  // ── Manifest ──────────────────────────────────────────────────────────────
  {
    const m = JSON.parse(read('platform/blueprints/to-do/manifest.json'));
    ok('TSN-MANIFEST-1 the template installs to {{templates_path}}/To-Do.md',
      m.files.some((f) => f.source === 'templates/To-Do.md' && f.dest === '{{templates_path}}/To-Do.md' && !f.materialize_once));
    const nav = m.nav_buttons.find((b) => b.id === 'todo-today');
    ok('TSN-MANIFEST-2 the To Do button opens To-Do.md (creating it from the template), not a dated note',
      nav && nav.action.type === 'createFromTemplate'
      && nav.action.target === '{{module_directory}}/To-Do.md' && nav.action.template_source === 'To-Do.md');
    ok('TSN-MANIFEST-3 the to-do-today type has a breadcrumb entry',
      !!(m.breadcrumb && m.breadcrumb.types && m.breadcrumb.types['to-do-today']));
  }

  // ── resetBody / _resetToDoSingleBody ──────────────────────────────────────
  const fixtures = [];
  {
    const R = Bar.resetBody;
    ok('TSN-RESET-1 a note that is the template comes back byte for byte', R(RENDERED, RENDERED) === RENDERED);
    ok('TSN-RESET-2 an empty note becomes the template', R('', RENDERED) === RENDERED);

    const withMine = RENDERED + '\n## Scratch\n- call back Jo\n';
    ok('TSN-RESET-3 text below the marker is kept', R(withMine, RENDERED) === withMine);

    const broken = RENDERED
      .replace('type: to-do-today', 'type: to-do\nextra: 1')
      .replace(bar('ToDoDailyFilterView'), 'oops I typed here\n') + '\nmine\n';
    const fixed = R(broken, RENDERED);
    ok('TSN-RESET-4 a broken Sauce part above the marker is rebuilt; text below stays',
      fixed === RENDERED + '\nmine\n');

    const noMarker = '---\ntype: to-do\n---\n\n' + bar('ToDoChromeBar') + '\nnotes I wrote\n\n' + bar('ToDoDailyFilterView') + '\nmore notes\n';
    const fromNoMarker = R(noMarker, RENDERED);
    ok('TSN-RESET-5 a note with no marker keeps its own text, minus its frontmatter and its Sauce blocks',
      fromNoMarker === RENDERED + '\nnotes I wrote\n\n\n\nmore notes\n');
    ok('TSN-RESET-6 a template with no marker resets nothing', R(RENDERED, RENDERED.replace(MARKER, '')) === null);
    ok('TSN-RESET-7 every result is stable when reset again',
      [RENDERED, withMine, fixed, fromNoMarker].every((b) => R(b, RENDERED) === b));
    fixtures.push('', RENDERED, withMine, broken, noMarker, 'just text', '---\ntype: to-do\n---\n', RENDERED + MARKER + '\nx\n');
  }
  {
    const I = install._resetToDoSingleBody;
    ok('TSN-AGREE the installer and the To-Do menu rebuild every fixture the same way',
      typeof I === 'function' && fixtures.every((f) => I(f, RENDERED) === Bar.resetBody(f, RENDERED))
      && I('x', 'no marker') === null);
  }

  // ── Installer heal ────────────────────────────────────────────────────────
  const makeVault = (files) => {
    const store = new Map(Object.entries(files));
    const writes = [];
    const adapter = {
      exists: async (p) => store.has(p) || [...store.keys()].some((k) => k.startsWith(p + '/')),
      read: async (p) => { if (!store.has(p)) throw new Error('ENOENT ' + p); return store.get(p); },
      write: async (p, c) => { writes.push(p); store.set(p, c); },
      mkdir: async () => {},
    };
    return { tp: { app: { vault: { adapter } } }, store, writes };
  };
  const vars = { templates_path: 'ranch/templates' };
  const git = { commit: 'x', tag: '', dirty: false };
  const DATED = 'spice/to-do/2026/11-November/ToDo-2026-11-26.md';
  const DATED_BODY = '---\ntype: to-do\n---\n\n- [x] old work log\n';
  {
    const v = makeVault({ [DATED]: DATED_BODY });
    const h = [];
    await install.applyToDoSingleNoteHeal(v.tp, vars, h, git);
    ok('TSN-HEAL-1 a vault without the To-Do template is left alone', v.writes.length === 0 && h.length === 0);
  }
  {
    const v = makeVault({ 'ranch/templates/To-Do.md': RENDERED, [DATED]: DATED_BODY });
    const h = [];
    await install.applyToDoSingleNoteHeal(v.tp, vars, h, git);
    ok('TSN-HEAL-2 a missing To-Do.md is created from the installed template',
      v.store.get('spice/to-do/To-Do.md') === RENDERED && h.some((e) => e.action === 'created'));
    const before = v.writes.length;
    await install.applyToDoSingleNoteHeal(v.tp, vars, h, git);
    ok('TSN-HEAL-3 a second install writes nothing', v.writes.length === before);
    ok('TSN-HEAL-4 the dated notes are never written', !v.writes.some((p) => /ToDo-\d{4}/.test(p)) && v.store.get(DATED) === DATED_BODY);
  }
  {
    const broken = RENDERED.replace(bar('ToDoDailyFilterView'), '') + '\nkeep me\n';
    const v = makeVault({ 'ranch/templates/To-Do.md': RENDERED, 'spice/to-do/To-Do.md': broken });
    const h = [];
    await install.applyToDoSingleNoteHeal(v.tp, vars, h, git);
    const backup = v.writes.find((p) => p.startsWith('.sauce-backup/') && p.endsWith('spice/to-do/To-Do.md'));
    ok('TSN-HEAL-5 a broken To-Do.md is rebuilt, keeping what is below the marker',
      v.store.get('spice/to-do/To-Do.md') === RENDERED + '\nkeep me\n' && h.some((e) => e.action === 'healed'));
    ok('TSN-HEAL-6 the old note is backed up before it is rewritten',
      !!backup && v.store.get(backup) === broken && v.writes.indexOf(backup) < v.writes.lastIndexOf('spice/to-do/To-Do.md'));
  }
  {
    const src = read('platform/install.js');
    const start = src.indexOf('module.exports = async function (tp) {');
    const end = src.indexOf('async function installItem(');
    const body = src.slice(start, end);
    const call = body.indexOf('await applyToDoSingleNoteHeal(tp, variables, installedNow.history, git)');
    ok('TSN-HEAL-WIRED the heal runs post-loop in install(), after the per-item installs, so it runs on every update',
      start >= 0 && call > 0 && call > body.indexOf('await applyNoteChromeHeal(')
      && !src.slice(src.indexOf('async function installItem('), src.indexOf('\nasync function ', src.indexOf('async function installItem(') + 1)).includes('applyToDoSingleNoteHeal'));
  }

  // ── The To-Do menu ────────────────────────────────────────────────────────
  const makeApp = (files) => {
    const store = new Map(Object.entries(files));
    const calls = { opened: [], created: [], modified: [], adapterWrites: [], notices: [] };
    const fileObj = (p) => (store.has(p) ? { path: p } : null);
    const app = {
      vault: {
        getAbstractFileByPath: (p) => fileObj(p),
        read: async (f) => store.get(f.path),
        create: async (p, c) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); calls.created.push(p); return { path: p }; },
        modify: async (f, c) => { store.set(f.path, c); calls.modified.push(f.path); },
        adapter: {
          exists: async (p) => store.has(p),
          mkdir: async () => {},
          write: async (p, c) => { store.set(p, c); calls.adapterWrites.push(p); },
        },
      },
      workspace: { openLinkText: async (p) => { calls.opened.push(p); } },
      commands: { commands: { 'templater-obsidian:ranch/templates/Today To-Do.md': {} }, executeCommandById: (id) => calls.opened.push('CMD ' + id) },
    };
    return { app, store, calls };
  };
  const withGlobals = async (app, fn) => {
    const prev = { app: global.app, window: global.window, Notice: global.Notice, customJS: global.customJS };
    global.app = app;
    global.window = { moment: () => ({ format: () => '20261127-090000' }), customJS: {} };
    const notices = [];
    global.Notice = function (m) { notices.push(m); };
    global.customJS = { ChromeBar: { openNavTarget: () => {} } };
    try { return await fn(notices); } finally { Object.assign(global, prev); }
  };
  {
    const cfg = new Bar()._config();
    const one = cfg.detect({}, { type: 'to-do-today', file: { path: 'spice/to-do/To-Do.md' } });
    ok('TSN-BAR-1 the To-Do note is its own surface', one && one.context === 'to-do-today' && one.path === 'spice/to-do/To-Do.md');
    const spec = cfg.surfaceSpec({ context: 'to-do-today' });
    const dated = cfg.surfaceSpec({ context: 'to-do' });
    ok('TSN-BAR-2 its menu has New Task, Recurring, All To-Dos, Completed and Reset to Sauce layout',
      spec.primary && spec.primary.id === 'new-task' && spec.leaf === true
      && ['recurring', 'all-todos', 'completed-tasks', 'reset-layout'].every((id) => spec.overflow.some((e) => e.id === id))
      && spec.overflow.find((e) => e.id === 'reset-layout').label === 'Reset to Sauce layout');
    ok('TSN-BAR-3 an old dated note has no reset item', !dated.overflow.some((e) => e.id === 'reset-layout'));

    await withGlobals({}, async () => {
      const away = cfg.destinations({}, { context: 'to-do-hub', path: 'spice/to-do/All-ToDos.md' });
      const home = cfg.destinations({}, { context: 'to-do-today', path: 'spice/to-do/To-Do.md' });
      const today = away.find((e) => e && e.label === "Today's To-Do");
      ok('TSN-BAR-4 "Today\'s To-Do" points at To-Do.md, and is left out on To-Do.md itself',
        today && today._navTarget === 'spice/to-do/To-Do.md' && !home.some((e) => e && e.label === "Today's To-Do"));
    });

    {
      const { app, store, calls } = makeApp({ 'ranch/templates/To-Do.md': RENDERED });
      await withGlobals(app, () => cfg.dispatch({}, { context: 'to-do-hub', path: 'spice/to-do/All-ToDos.md' }, 'back-today'));
      ok('TSN-BAR-5 Back to Today creates a missing To-Do.md from the template and opens it, with no Templater command',
        store.get('spice/to-do/To-Do.md') === RENDERED && calls.opened.length === 1 && calls.opened[0] === 'spice/to-do/To-Do.md');
    }
    {
      const { app, calls } = makeApp({ 'ranch/templates/To-Do.md': RENDERED, 'spice/to-do/To-Do.md': RENDERED + '\nmine\n' });
      await withGlobals(app, () => Bar.openToday());
      ok('TSN-BAR-6 Back to Today opens an existing To-Do.md without writing it', calls.created.length === 0 && calls.modified.length === 0 && calls.opened[0] === 'spice/to-do/To-Do.md');
    }
    {
      const broken = '---\ntype: to-do-today\n---\n\nI broke the blocks\n' + MARKER + '\n\nmy list\n';
      const { app, store, calls } = makeApp({ 'ranch/templates/To-Do.md': RENDERED, 'spice/to-do/To-Do.md': broken });
      const r = await withGlobals(app, () => cfg.dispatch({}, { context: 'to-do-today', path: 'spice/to-do/To-Do.md' }, 'reset-layout'));
      const backup = calls.adapterWrites.find((p) => p.startsWith('.sauce-backup/to-do/To-Do.md.'));
      ok('TSN-BAR-7 Reset rebuilds the Sauce part of To-Do.md and keeps the text below the marker',
        r && r.action === 'reset' && store.get('spice/to-do/To-Do.md') === RENDERED + '\nmy list\n'
        && calls.modified.length === 1 && calls.modified[0] === 'spice/to-do/To-Do.md');
      ok('TSN-BAR-8 Reset copies the old note to .sauce-backup/to-do/ first', !!backup && store.get(backup) === broken);
    }
    {
      const { app, calls } = makeApp({ 'ranch/templates/To-Do.md': RENDERED, 'spice/to-do/To-Do.md': RENDERED });
      const r = await withGlobals(app, () => Bar.resetLayout('spice/to-do/To-Do.md'));
      ok('TSN-BAR-9 Reset on a note that already matches writes nothing', r.action === 'unchanged' && calls.modified.length === 0 && calls.adapterWrites.length === 0);
    }
    {
      const { app, calls } = makeApp({ 'spice/to-do/To-Do.md': 'x' });
      let notices = [];
      const r = await withGlobals(app, async (n) => { const out = await Bar.resetLayout('spice/to-do/To-Do.md'); notices = n; return out; });
      ok('TSN-BAR-10 Reset with no installed template says so and writes nothing',
        r.ok === false && calls.modified.length === 0 && notices.some((m) => /sauce update/.test(m)));
    }
  }

  // ── All To-Dos "Back to Today's To-Do" ────────────────────────────────────
  {
    const Hub = loadClass('platform/blueprints/to-do/helpers/todo-hub-actions.js', 'ToDoHubActions');
    const { app, store, calls } = makeApp({ 'ranch/templates/To-Do.md': RENDERED });
    let onClick = null;
    await withGlobals(app, async () => {
      global.window.customJS = { ToDoChromeBar: new Bar() };
      global.customJS = { AccentButton: { render: (_row, o) => { onClick = o.onClick; } } };
      const el = { createEl: () => el, style: {}, closest: () => null, firstChild: null, removeChild: () => {} };
      new Hub().render({ container: el });
      if (onClick) await onClick();
    });
    ok('TSN-HUB All To-Dos "Back to Today\'s To-Do" opens To-Do.md, not a dated note',
      typeof onClick === 'function' && calls.opened.length === 1 && calls.opened[0] === 'spice/to-do/To-Do.md'
      && store.has('spice/to-do/To-Do.md'));
  }

  // ── Command palette "Sauce: New task" ─────────────────────────────────────
  {
    const Init = loadClass('platform/blueprints/to-do/helpers/todo-create-task-init.js', 'ToDoCreateTaskInit');
    const commands = {};
    const opened = [];
    const prev = { window: global.window, customJS: global.customJS, Notice: global.Notice };
    global.window = { app: { commands: { addCommand: (c) => { commands[c.id] = c; } } }, moment: () => ({ format: () => '2026-11-27' }) };
    global.customJS = {
      TaskDialog: { open: (o) => opened.push(['TaskDialog', o]) },
      ToDoCreateTask: { open: (o) => opened.push(['ToDoCreateTask', o]) },
    };
    global.Notice = function () {};
    try {
      new Init().invoke();
      if (commands['sauce:new-task']) commands['sauce:new-task'].callback();
    } finally { Object.assign(global, prev); }
    ok('TSN-CMD "Sauce: New task" opens the task dialog for today, not the old dialog that wrote into a dated note',
      opened.length === 1 && opened[0][0] === 'TaskDialog' && opened[0][1].surface === 'daily' && opened[0][1].today === '2026-11-27');
  }

  // ── No way in still builds a dated path ───────────────────────────────────
  {
    const sources = {
      'todo-chrome-bar.js': read('platform/blueprints/to-do/helpers/todo-chrome-bar.js'),
      'todo-hub-actions.js': read('platform/blueprints/to-do/helpers/todo-hub-actions.js'),
      'space-daily-dashboard _openTodayToDo': (() => {
        const s = read('platform/blueprints/daily/helpers/space-daily-dashboard.js');
        const at = s.indexOf('async _openTodayToDo(');
        return s.slice(at, s.indexOf('\n  }\n', at));
      })(),
    };
    const stale = Object.entries(sources).filter(([, s]) => /ToDo-\$\{|Today To-Do/.test(s)).map(([k]) => k);
    ok('TSN-NO-DATED the To-Do menu, All To-Dos and the daily dashboard never build a ToDo-<date> path or run the Today To-Do template',
      stale.length === 0);
    if (stale.length) console.log('    still dated: ' + stale.join(', '));
  }

  // ── Workshop dogfood copies ───────────────────────────────────────────────
  {
    const same = (a, b) => read(a) === read(b);
    ok('TSN-DOGFOOD the workshop ranch copies match the sources',
      same('platform/blueprints/to-do/helpers/todo-chrome-bar.js', 'ranch/scripts/to-do/todo-chrome-bar.js')
      && same('platform/blueprints/to-do/helpers/todo-hub-actions.js', 'ranch/scripts/to-do/todo-hub-actions.js')
      && same('platform/blueprints/to-do/helpers/todo-create-task-init.js', 'ranch/scripts/to-do/todo-create-task-init.js')
      && same('platform/blueprints/daily/helpers/space-daily-dashboard.js', 'ranch/scripts/daily/space-daily-dashboard.js'));
  }

  console.log(`\n${results.filter(([, p]) => p).length}/${results.length} passed`);
  process.exit(results.every(([, p]) => p) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
