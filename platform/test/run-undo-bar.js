#!/usr/bin/env node
/**
 * run-undo-bar.js — SauceUndoBar (platform/mechanisms/task-entity/undo-bar.js),
 * the bar that offers Undo after a task move:
 *   - one bar at the bottom centre, message + Undo + close ×, styled with
 *     Obsidian variables and lifted above the phone's navbar and toolbar;
 *   - four seconds, paused while hovered or focused, then a fade;
 *   - a new bar replaces the old one, whose move can no longer be undone;
 *   - Undo, "Undone" for a second, "Couldn't undo: <reason>" on failure;
 *   - Cmd/Ctrl+Z only while the bar shows and focus is not in an editor or
 *     a text field.
 * A fake window with a manual clock drives the timers. Zero-dep; exit 0 iff
 * all pass.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
const ok = (n, c, detail) => { results.push([n, !!c]); console.log(`  ${c ? 'PASS' : 'FAIL'} — ${n}${c || !detail ? '' : ' :: ' + detail}`); };

const SRC = read('platform/mechanisms/task-entity/undo-bar.js');
const load = () => new Function(SRC + '\nreturn SauceUndoBar;')();

// ---------- a fake window: manual clock, timers, a small DOM ----------

function makeEl(doc, tag) {
  const el = {
    tagName: String(tag).toUpperCase(), className: '', children: [], parentNode: null, attributes: {},
    _text: '', _listeners: {}, disabled: false, type: '', isContentEditable: false, _closest: null,
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { this._listeners[t] = (this._listeners[t] || []).filter((f) => f !== fn); },
    fire(t, ev) { let out; for (const fn of (this._listeners[t] || []).slice()) out = fn(Object.assign({ target: this, preventDefault() {}, stopPropagation() {} }, ev || {})); return out; },
    closest(sel) { return this._closest && this._closest(sel) ? this : null; },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v == null ? '' : v); this.children = []; },
  };
  el.classList = {
    add: (c) => { const s = new Set(el.className.split(/\s+/).filter(Boolean)); s.add(c); el.className = Array.from(s).join(' '); },
    remove: (c) => { el.className = el.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
    contains: (c) => el.className.split(/\s+/).includes(c),
  };
  return el;
}

function makeWindow() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const notices = [];
  const doc = { _listeners: {} };
  doc.createElement = (t) => makeEl(doc, t);
  doc.head = makeEl(doc, 'head');
  doc.body = makeEl(doc, 'body');
  doc.activeElement = doc.body;
  const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
  doc.getElementById = (id) => all(doc.head).concat(all(doc.body)).find((n) => n.id === id) || null;
  doc.querySelectorAll = (sel) => {
    const want = String(sel).replace(/^\./, '');
    return all(doc.body).filter((n) => n.className.split(/\s+/).includes(want));
  };
  doc.addEventListener = (t, fn, capture) => { (doc._listeners[t] = doc._listeners[t] || []).push({ fn, capture: !!capture }); };
  doc.removeEventListener = (t, fn, capture) => { doc._listeners[t] = (doc._listeners[t] || []).filter((l) => !(l.fn === fn && l.capture === !!capture)); };
  doc.key = (ev) => {
    const e = Object.assign({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, ev);
    for (const l of (doc._listeners.keydown || []).slice()) l.fn(e);
    return e;
  };
  const win = {
    document: doc,
    performance: { now: () => now },
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms || 0), fn }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    Notice: function (m) { notices.push(String(m)); },
    notices,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
  return win;
}

const flush = () => new Promise((r) => setImmediate(r));
const bars = (win) => win.document.querySelectorAll('.sauce-undo-bar');
const parts = (bar) => ({
  msg: bar.children.find((c) => c.className === 'sauce-undo-bar-msg'),
  undo: bar.children.find((c) => c.className === 'sauce-undo-bar-undo'),
  close: bar.children.find((c) => c.className === 'sauce-undo-bar-close'),
});
const leaving = (bar) => bar.classList.contains('is-leaving');

(async () => {
  const saved = { window: global.window };
  try {
    // ----- the bar itself -----
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      const handle = Bar.show({ message: "Moved 'Bravo' under 'Alpha'", onUndo: async () => ({ ok: true }) });
      const list = bars(win);
      const p = list[0] ? parts(list[0]) : {};
      ok('UB-SHOW one bar in the body holds the message, an Undo button and a close ×, announced politely',
        list.length === 1 && handle && handle.el === list[0] && p.msg && p.msg.textContent === "Moved 'Bravo' under 'Alpha'"
        && p.undo && p.undo.textContent === 'Undo' && p.close && p.close.textContent === '×'
        && p.close.getAttribute('aria-label') === 'Close' && list[0].getAttribute('role') === 'status'
        && list[0].getAttribute('aria-live') === 'polite');
      const css = win.document.getElementById('sauce-undo-bar-css');
      const text = css ? css.textContent : '';
      ok('UB-CSS fixed at the bottom centre, Obsidian variables for both themes, 36px targets',
        /\.sauce-undo-bar \{ position: fixed; left: 50%; bottom: 40px; transform: translate\(-50%, 0\)/.test(text)
        && /background: var\(--background-primary\); color: var\(--text-normal\)/.test(text)
        && /border: 1px solid var\(--background-modifier-border\)/.test(text)
        && /color: var\(--text-accent\)/.test(text)
        && /min-height: 36px; min-width: 36px/.test(text)
        && !/#[0-9a-f]{3,6}\b/i.test(text));
      ok('UB-CSS-MOBILE on a phone it sits above the navbar, the safe area and an open toolbar',
        /body\.is-mobile \.sauce-undo-bar \{ bottom: calc\(var\(--navbar-height, 0px\) \+ env\(safe-area-inset-bottom, 0px\) \+ 12px\)/.test(text)
        && /body\.is-mobile\.mod-toolbar-open \.sauce-undo-bar \{ bottom: calc\(var\(--navbar-height, 0px\) \+ var\(--mobile-toolbar-height, 48px\) \+ env\(safe-area-inset-bottom, 0px\) \+ 12px\)/.test(text));
      Bar.show({ message: 'again' });
      ok('UB-CSS-ONCE the stylesheet is injected once', win.document.head.children.filter((c) => c.id === 'sauce-undo-bar-css').length === 1);
      Bar.hide();
    }

    // ----- the timer, the hover and focus pause -----
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      Bar.show({ message: 'm' });
      const bar = bars(win)[0];
      win.advance(3999);
      const stillUp = !leaving(bar) && bars(win).length === 1;
      win.advance(1);
      const fading = leaving(bar);
      win.advance(180);
      ok('UB-TIMER the bar stays four seconds, then fades and leaves the page',
        stillUp && fading && bars(win).length === 0 && Bar.current() === null);
    }
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      Bar.show({ message: 'm', duration: 4000 });
      const bar = bars(win)[0];
      win.advance(1000);
      bar.fire('mouseenter');
      win.advance(60000);
      const heldWhileHovered = !leaving(bar);
      bar.fire('mouseleave');
      win.advance(2999);
      const keepsTheRest = !leaving(bar);
      win.advance(1);
      ok('UB-HOVER-PAUSE hovering holds the bar; leaving it resumes with the time that was left',
        heldWhileHovered && keepsTheRest && leaving(bar));
    }
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      Bar.show({ message: 'm' });
      const bar = bars(win)[0];
      const p = parts(bar);
      win.advance(500);
      bar.fire('focusin');
      win.advance(60000);
      const held = !leaving(bar);
      bar.fire('focusout', { relatedTarget: p.close });
      win.advance(60000);
      const heldInside = !leaving(bar);
      bar.fire('focusout', { relatedTarget: win.document.body });
      win.advance(3500);
      ok('UB-FOCUS-PAUSE focus in the bar holds it, moving between its buttons keeps holding, focus leaving resumes',
        held && heldInside && leaving(bar));
    }

    // ----- one bar at a time -----
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      const calls = [];
      const first = Bar.show({ message: 'first', onUndo: async () => { calls.push('first'); return { ok: true }; } });
      const second = Bar.show({ message: 'second', onUndo: async () => { calls.push('second'); return { ok: true }; } });
      const list = bars(win);
      const shown = list.length === 1 ? parts(list[0]).msg.textContent : '';
      const oneKeyListener = (win.document._listeners.keydown || []).length === 1;
      await first.undo();
      const afterStale = calls.slice();
      win.document.key({ key: 'z', metaKey: true });
      await flush();
      ok('UB-REPLACE a new move replaces the bar; the replaced move can no longer be undone',
        list.length === 1 && shown === 'second' && Bar.current() === second && oneKeyListener
        && afterStale.length === 0 && JSON.stringify(calls) === JSON.stringify(['second']),
        JSON.stringify({ n: list.length, shown, afterStale, calls }));
    }

    // ----- Undo -----
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      let n = 0;
      Bar.show({ message: 'm', onUndo: async () => { n += 1; return { ok: true }; } });
      const bar = bars(win)[0];
      const p = parts(bar);
      p.undo.fire('click');
      p.undo.fire('click');
      await flush();
      const doneText = p.msg.textContent;
      const isDone = bar.classList.contains('is-done') && !leaving(bar);
      win.advance(999);
      const stillDone = !leaving(bar);
      win.advance(1);
      ok('UB-UNDO Undo runs once, the bar reads "Undone" for one second, then fades',
        n === 1 && doneText === 'Undone' && isDone && stillDone && leaving(bar) && win.notices.length === 0);
    }
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      Bar.show({ message: 'm', onUndo: async () => ({ ok: false, reason: 'the old parent is gone' }) });
      const bar = bars(win)[0];
      await Bar.current().undo();
      const n1 = win.notices.slice();
      const closed = leaving(bar);
      Bar.show({ message: 'm', onUndo: async () => { throw new Error('disk full'); } });
      await Bar.current().undo();
      const n2 = win.notices.slice(n1.length);
      Bar.show({ message: 'm', onUndo: async () => ({ ok: false, reason: 'x', notified: true }) });
      await Bar.current().undo();
      const n3 = win.notices.slice(n1.length + n2.length);
      ok('UB-UNDO-FAIL a failed undo shows "Couldn\'t undo: <reason>" once and the bar goes; a writer that already said so adds none',
        JSON.stringify(n1) === JSON.stringify(["Couldn't undo: the old parent is gone"]) && closed
        && JSON.stringify(n2) === JSON.stringify(["Couldn't undo: disk full"]) && n3.length === 0, JSON.stringify(win.notices));
    }
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      let n = 0;
      Bar.show({ message: 'm', onUndo: async () => { n += 1; return { ok: true }; } });
      const bar = bars(win)[0];
      parts(bar).close.fire('click');
      win.document.key({ key: 'z', metaKey: true });
      await flush();
      ok('UB-CLOSE the × closes the bar without undoing, and Cmd+Z no longer reaches it',
        leaving(bar) && n === 0 && (win.document._listeners.keydown || []).length === 0 && Bar.current() === null);
    }

    // ----- Cmd/Ctrl+Z -----
    {
      const win = makeWindow();
      global.window = win;
      const Bar = load();
      const doc = win.document;
      let n = 0;
      const fresh = () => { n = 0; Bar.show({ message: 'm', onUndo: async () => { n += 1; return { ok: true }; } }); };
      const press = async (ev, active) => {
        doc.activeElement = active || doc.body;
        const e = doc.key(ev);
        await flush();
        return e;
      };
      fresh();
      const cmd = await press({ key: 'z', metaKey: true });
      const cmdHit = n === 1 && cmd.prevented && cmd.stopped;
      fresh();
      await press({ key: 'Z', ctrlKey: true });
      const ctrlHit = n === 1;
      fresh();
      const shifted = await press({ key: 'z', metaKey: true, shiftKey: true });
      const plain = await press({ key: 'z' });
      const noRedo = n === 0 && !shifted.prevented && !plain.prevented;
      const input = doc.createElement('input');
      input.type = 'text';
      const area = doc.createElement('textarea');
      const editable = doc.createElement('div');
      editable.isContentEditable = true;
      const inEditor = doc.createElement('span');
      inEditor._closest = (sel) => /\.cm-editor/.test(sel);
      const results2 = [];
      for (const el of [input, area, editable, inEditor]) {
        const e = await press({ key: 'z', metaKey: true }, el);
        results2.push(e.prevented);
      }
      const editorsKeepIt = n === 0 && results2.every((p) => p === false);
      const box = doc.createElement('input');
      box.type = 'checkbox';
      await press({ key: 'z', metaKey: true }, box);
      const checkboxIsNoEditor = n === 1;
      ok('UB-KEY Cmd+Z and Ctrl+Z undo while the bar shows; Shift+Cmd+Z and a bare Z do not',
        cmdHit && ctrlHit && noRedo);
      ok('UB-KEY-GATED Cmd+Z in a text field, a textarea, a contenteditable or the editor stays with the editor; a checkbox is no editor',
        editorsKeepIt && checkboxIsNoEditor);
      fresh();
      win.advance(4180);
      const gone = await press({ key: 'z', metaKey: true });
      ok('UB-KEY-AFTER once the bar has gone, Cmd+Z is left alone', n === 0 && !gone.prevented && (doc._listeners.keydown || []).length === 0);
    }

    // ----- shipping -----
    {
      const manifest = JSON.parse(read('platform/mechanisms/task-entity/manifest.json'));
      const mirror = path.join(ROOT, 'ranch/scripts/task-entity/undo-bar.js');
      ok('UB-MANIFEST SauceUndoBar ships as a customJS class of task-entity, and its ranch mirror matches',
        manifest.customjs_classes.includes('SauceUndoBar')
        && manifest.files.some((f) => f.source === 'undo-bar.js' && f.dest === '{{scripts_path}}/task-entity/undo-bar.js')
        && fs.existsSync(mirror) && fs.readFileSync(mirror, 'utf8') === SRC);
      const Inst = load();
      const inst = new Inst();
      ok('UB-INSTANCE the stored instance delegates show / hide / current / isEditing / isUndoKey',
        ['show', 'hide', 'current', 'isEditing', 'isUndoKey'].every((k) => typeof inst[k] === 'function') && inst.DURATION === 4000);
    }
  } catch (e) {
    console.log('  FAIL — harness threw: ' + (e && (e.stack || e.message || e)));
    results.push(['harness', false]);
  } finally {
    global.window = saved.window;
  }
  const failed = results.filter(([, p]) => !p);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
