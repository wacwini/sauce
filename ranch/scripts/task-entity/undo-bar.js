class SauceUndoBar {

    // A small bar at the bottom centre of the window that offers Undo for
    // about four seconds after a task move (TaskMove): the message, an Undo
    // button and a close ×. It pauses while hovered or focused, then fades
    // out. Only one bar shows at a time: a new one replaces it, and the
    // replaced move can no longer be undone. Cmd/Ctrl+Z triggers Undo while
    // the bar shows and focus is not in an editor or a text field. On
    // mobile it sits above the bottom navbar and the editing toolbar.
    //
    // SauceUndoBar.show({ message, onUndo, duration = 4000 }) returns the
    // bar's handle { el, undo(), close() }. onUndo() may resolve
    // { ok: false, reason } (or throw) when the undo failed: the bar then
    // shows "Couldn't undo: <reason>" as a Notice, unless the result says
    // `notified: true` (the writer already showed it). A successful undo
    // shows "Undone" for one second.

    show(opts) { return SauceUndoBar.show(opts); }
    hide() { return SauceUndoBar.hide(); }
    current() { return SauceUndoBar.current(); }
    isEditing(el) { return SauceUndoBar.isEditing(el); }
    isUndoKey(event) { return SauceUndoBar.isUndoKey(event); }
    get DURATION() { return SauceUndoBar.DURATION; }

    static get DURATION() { return 4000; }
    static get DONE_MS() { return 1000; }
    static get FADE_MS() { return 180; }
    static get CSS_ID() { return 'sauce-undo-bar-css'; }

    static _win() {
        try { return typeof window !== 'undefined' ? window : null; } catch (_e) { return null; }
    }

    static _doc() {
        const w = SauceUndoBar._win();
        if (w && w.document) return w.document;
        try { return typeof document !== 'undefined' ? document : null; } catch (_e) { return null; }
    }

    // A monotonic reading for the pause bookkeeping; null when the host has
    // no performance clock (the bar then restarts the full time on resume).
    static _now() {
        const w = SauceUndoBar._win();
        try {
            const perf = (w && w.performance) || null;
            return perf && typeof perf.now === 'function' ? perf.now() : null;
        } catch (_e) { return null; }
    }

    static _later(fn, ms) {
        const w = SauceUndoBar._win();
        const st = (w && typeof w.setTimeout === 'function') ? w.setTimeout.bind(w) : (typeof setTimeout === 'function' ? setTimeout : null);
        return st ? st(fn, ms) : null;
    }

    static _cancel(id) {
        if (id == null) return;
        const w = SauceUndoBar._win();
        const ct = (w && typeof w.clearTimeout === 'function') ? w.clearTimeout.bind(w) : (typeof clearTimeout === 'function' ? clearTimeout : null);
        try { if (ct) ct(id); } catch (_e) {}
    }

    static _notice(msg) {
        try {
            const w = SauceUndoBar._win();
            const N = (w && typeof w.Notice === 'function' && w.Notice) || (typeof Notice === 'function' ? Notice : null);
            if (N) new N(msg, 5000);
        } catch (_e) { /* a Notice never breaks the bar */ }
    }

    static _setClass(el, cls, on) {
        try { if (el && el.classList) { if (on) el.classList.add(cls); else el.classList.remove(cls); } } catch (_e) {}
    }

    /** True when `el` takes typing: a text field, a select, or anything inside an editor. */
    static isEditing(el) {
        if (!el) return false;
        const tag = String(el.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag === 'INPUT') {
            const type = String(el.type || (typeof el.getAttribute === 'function' && el.getAttribute('type')) || 'text').toLowerCase();
            return ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].indexOf(type) < 0;
        }
        if (el.isContentEditable === true) return true;
        try {
            if (typeof el.closest === 'function' && el.closest('.cm-editor, [contenteditable=""], [contenteditable="true"]')) return true;
        } catch (_e) {}
        return false;
    }

    /** True for Cmd+Z or Ctrl+Z with no Shift or Alt (Shift+Cmd+Z is redo). */
    static isUndoKey(event) {
        if (!event || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return false;
        return String(event.key || '').toLowerCase() === 'z' || event.code === 'KeyZ';
    }

    static get _CSS() {
        return [
            '.sauce-undo-bar { position: fixed; left: 50%; bottom: 40px; transform: translate(-50%, 0); z-index: var(--layer-notice, 60);',
            '  display: flex; align-items: center; gap: 6px; max-width: min(560px, calc(100vw - 32px)); box-sizing: border-box;',
            '  padding: 4px 4px 4px 14px; border-radius: var(--radius-m, 8px); border: 1px solid var(--background-modifier-border);',
            '  background: var(--background-primary); color: var(--text-normal); box-shadow: var(--shadow-l, 0 6px 24px rgba(0, 0, 0, 0.25));',
            '  font-size: var(--font-ui-small, 13px); line-height: 1.3; opacity: 1; transition: opacity 180ms ease, transform 180ms ease; }',
            '.sauce-undo-bar.is-entering { opacity: 0; transform: translate(-50%, 6px); }',
            '.sauce-undo-bar.is-leaving { opacity: 0; transform: translate(-50%, 6px); pointer-events: none; }',
            '.sauce-undo-bar-msg { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.sauce-undo-bar button { min-height: 36px; min-width: 36px; padding: 0 12px; margin: 0; border: none; box-shadow: none;',
            '  background: transparent; border-radius: var(--radius-s, 6px); cursor: pointer; font-size: inherit; }',
            '.sauce-undo-bar .sauce-undo-bar-undo { color: var(--text-accent); font-weight: var(--font-semibold, 600); }',
            '.sauce-undo-bar .sauce-undo-bar-close { color: var(--text-muted); padding: 0 8px; font-size: 16px; }',
            '.sauce-undo-bar button:hover { background: var(--background-modifier-hover); }',
            '.sauce-undo-bar button:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }',
            '.sauce-undo-bar.is-done .sauce-undo-bar-undo { display: none; }',
            'body.is-mobile .sauce-undo-bar { bottom: calc(var(--navbar-height, 0px) + env(safe-area-inset-bottom, 0px) + 12px); }',
            'body.is-mobile.mod-toolbar-open .sauce-undo-bar { bottom: calc(var(--navbar-height, 0px) + var(--mobile-toolbar-height, 48px) + env(safe-area-inset-bottom, 0px) + 12px); }',
            '@media (prefers-reduced-motion: reduce) { .sauce-undo-bar { transition: none; } }',
        ].join('\n');
    }

    static _injectCss(doc) {
        try {
            if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
            let el = typeof doc.getElementById === 'function' ? doc.getElementById(SauceUndoBar.CSS_ID) : null;
            if (!el) {
                el = doc.createElement('style');
                el.id = SauceUndoBar.CSS_ID;
                doc.head.appendChild(el);
            }
            if (el.textContent !== SauceUndoBar._CSS) el.textContent = SauceUndoBar._CSS;
        } catch (_e) { /* an unstyled bar still works */ }
    }

    /** The bar's handle while one shows, else null. */
    static current() {
        const s = SauceUndoBar._state;
        return s && s.phase !== 'closed' ? s.handle : null;
    }

    /** Take the bar away at once (no fade). */
    static hide() {
        const s = SauceUndoBar._state;
        if (s) SauceUndoBar._close(s, false);
        const doc = SauceUndoBar._doc();
        try {
            const stale = doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('.sauce-undo-bar') : [];
            for (const el of Array.from(stale || [])) { try { el.remove(); } catch (_e) {} }
        } catch (_e) {}
    }

    /**
     * Show the bar for `duration` ms (default 4000), replacing any bar that
     * shows. Returns the handle { el, undo(), close() }, or null when there
     * is no document.
     */
    static show(opts) {
        const o = opts || {};
        SauceUndoBar.hide();
        const doc = SauceUndoBar._doc();
        if (!doc || typeof doc.createElement !== 'function' || !doc.body) return null;
        SauceUndoBar._injectCss(doc);
        const duration = Number(o.duration) > 0 ? Number(o.duration) : SauceUndoBar.DURATION;
        const el = doc.createElement('div');
        el.className = 'sauce-undo-bar is-entering';
        try { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); } catch (_e) {}
        const msg = doc.createElement('span');
        msg.className = 'sauce-undo-bar-msg';
        msg.textContent = String(o.message == null ? '' : o.message);
        try { msg.setAttribute('title', msg.textContent); } catch (_e) {}
        const undoBtn = doc.createElement('button');
        undoBtn.className = 'sauce-undo-bar-undo';
        undoBtn.textContent = 'Undo';
        const closeBtn = doc.createElement('button');
        closeBtn.className = 'sauce-undo-bar-close';
        closeBtn.textContent = '×';
        try {
            undoBtn.setAttribute('type', 'button');
            closeBtn.setAttribute('type', 'button');
            closeBtn.setAttribute('aria-label', 'Close');
            closeBtn.setAttribute('title', 'Close');
        } catch (_e) {}
        el.appendChild(msg);
        el.appendChild(undoBtn);
        el.appendChild(closeBtn);

        const s = {
            el, msg, undoBtn, closeBtn, doc,
            onUndo: typeof o.onUndo === 'function' ? o.onUndo : null,
            phase: 'shown', remaining: duration, deadline: null, timer: null,
            hover: false, focus: false, keyHandler: null,
        };
        s.handle = { el, undo: () => SauceUndoBar._undo(s), close: () => SauceUndoBar._close(s, true) };
        SauceUndoBar._state = s;

        undoBtn.addEventListener('click', (ev) => { try { ev.stopPropagation(); } catch (_e) {} SauceUndoBar._undo(s); });
        closeBtn.addEventListener('click', (ev) => { try { ev.stopPropagation(); } catch (_e) {} SauceUndoBar._close(s, true); });
        el.addEventListener('mouseenter', () => { s.hover = true; SauceUndoBar._pause(s); });
        el.addEventListener('mouseleave', () => { s.hover = false; SauceUndoBar._resume(s); });
        el.addEventListener('focusin', () => { s.focus = true; SauceUndoBar._pause(s); });
        el.addEventListener('focusout', (ev) => {
            const to = ev && ev.relatedTarget;
            try { if (to && typeof el.contains === 'function' && el.contains(to)) return; } catch (_e) {}
            s.focus = false;
            SauceUndoBar._resume(s);
        });
        s.keyHandler = (ev) => {
            if (s.phase !== 'shown' || !SauceUndoBar.isUndoKey(ev)) return;
            if (SauceUndoBar.isEditing(doc.activeElement)) return;
            try { ev.preventDefault(); ev.stopPropagation(); } catch (_e) {}
            SauceUndoBar._undo(s);
        };
        try { doc.addEventListener('keydown', s.keyHandler, true); } catch (_e) {}

        doc.body.appendChild(el);
        SauceUndoBar._later(() => SauceUndoBar._setClass(el, 'is-entering', false), 16);
        SauceUndoBar._start(s, duration);
        return s.handle;
    }

    static _start(s, ms) {
        SauceUndoBar._cancel(s.timer);
        s.remaining = ms;
        const now = SauceUndoBar._now();
        s.deadline = now == null ? null : now + ms;
        s.timer = SauceUndoBar._later(() => { s.timer = null; if (s.phase === 'shown') SauceUndoBar._close(s, true); }, ms);
    }

    static _pause(s) {
        if (s.phase !== 'shown' || s.timer == null) return;
        SauceUndoBar._cancel(s.timer);
        s.timer = null;
        const now = SauceUndoBar._now();
        if (now != null && s.deadline != null) s.remaining = Math.max(0, s.deadline - now);
    }

    static _resume(s) {
        if (s.phase !== 'shown' || s.hover || s.focus || s.timer != null) return;
        SauceUndoBar._start(s, s.remaining > 0 ? s.remaining : SauceUndoBar.FADE_MS);
    }

    static async _undo(s) {
        if (!s || s.phase !== 'shown') return undefined;
        s.phase = 'busy';
        SauceUndoBar._cancel(s.timer);
        s.timer = null;
        try { s.undoBtn.disabled = true; } catch (_e) {}
        let r;
        try {
            r = s.onUndo ? await s.onUndo() : { ok: false, reason: 'nothing to undo' };
        } catch (e) {
            r = { ok: false, reason: String((e && e.message) || e) };
        }
        if (r && r.ok === false) {
            if (!r.notified) SauceUndoBar._notice("Couldn't undo: " + String(r.reason || 'unknown error'));
            SauceUndoBar._close(s, true);
            return r;
        }
        if (s.phase === 'closed') return r;
        s.phase = 'done';
        try { s.msg.textContent = 'Undone'; s.msg.setAttribute('title', 'Undone'); } catch (_e) {}
        SauceUndoBar._setClass(s.el, 'is-done', true);
        s.timer = SauceUndoBar._later(() => { s.timer = null; SauceUndoBar._close(s, true); }, SauceUndoBar.DONE_MS);
        return r;
    }

    static _close(s, fade) {
        if (!s || s.phase === 'closed') return;
        s.phase = 'closed';
        SauceUndoBar._cancel(s.timer);
        s.timer = null;
        try { if (s.keyHandler) s.doc.removeEventListener('keydown', s.keyHandler, true); } catch (_e) {}
        if (SauceUndoBar._state === s) SauceUndoBar._state = null;
        const remove = () => { try { s.el.remove(); } catch (_e) {} };
        if (!fade) { remove(); return; }
        SauceUndoBar._setClass(s.el, 'is-leaving', true);
        if (SauceUndoBar._later(remove, SauceUndoBar.FADE_MS) == null) remove();
    }
}
