/**
 * PeoplePicker (CustomJS) — the one attendee picker.
 *
 * Every place that picks people for a note uses this: the New meeting
 * dialog, Edit attendees on a meeting, and EntityCreate's `people-multi`
 * prompt. It renders into any host: a chip row of the people picked so
 * far, a search field, a scrolling list of the people under spice/people/
 * not picked yet (the People hub excluded) and a "＋ Add new person" button
 * that creates a person stub for a name nobody has yet.
 *
 * It is built to be used from the keyboard: the best match is highlighted
 * (↑/↓ move it), Enter picks it, or adds the typed name when nobody
 * matches, Backspace in an empty search removes the last person, and focus
 * stays in the search after every pick so the next name can be typed.
 *
 * Names are trimmed and their inner whitespace collapsed. A name that
 * cannot be a note filename (/ \ : * ? " < > | # ^ [ ], or a leading dot)
 * is refused with a caption instead of leaving a broken wikilink. Nothing
 * here throws out of a click.
 *
 * Markup reuses TaskDialog's classes (sauce-task-link-chip, sauce-task-chip-x,
 * sauce-task-picker-results / -row, sauce-task-quiet, sauce-task-caption), so
 * inside a TaskDialog.openShell dialog it looks like the task dialog. Its own
 * layout rules are injected once as PICKER_CSS.
 *
 * BARE CLASS ONLY — the CustomJS loader evals the file as one expression.
 * customJS stores an INSTANCE, so every static has an instance delegate.
 */
class PeoplePicker {

    cleanName(raw) { return PeoplePicker.cleanName(raw); }
    isHostile(raw) { return PeoplePicker.isHostile(raw); }
    listPeople(app) { return PeoplePicker.listPeople(app); }
    stubBody(name, iso) { return PeoplePicker.stubBody(name, iso); }
    rows(people, selected, query) { return PeoplePicker.rows(people, selected, query); }
    enterAction(people, selected, query, active) { return PeoplePicker.enterAction(people, selected, query, active); }
    addState(people, query) { return PeoplePicker.addState(people, query); }
    createStub(app, name, now) { return PeoplePicker.createStub(app, name, now); }
    mount(host, opts) { return PeoplePicker.mount(host, opts); }
    get PICKER_CSS() { return PeoplePicker.PICKER_CSS; }

    static get PEOPLE_DIR() { return 'spice/people/'; }

    /** Characters a person note's filename (and so its wikilink) cannot hold. */
    static get HOSTILE_RE() { return /[\\/:*?"<>|#^[\]]/; }

    /** True when `raw`, once trimmed, cannot be a person filename. */
    static isHostile(raw) {
        const s = String(raw == null ? '' : raw).trim();
        return !!s && (PeoplePicker.HOSTILE_RE.test(s) || s.charAt(0) === '.');
    }

    /** Trimmed name with inner whitespace collapsed; '' when empty or path-hostile. */
    static cleanName(raw) {
        const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
        if (!s || PeoplePicker.isHostile(s)) return '';
        return s;
    }

    /** Basenames of spice/people/*.md (the People hub excluded), sorted. [] on any failure. */
    static listPeople(app) {
        try {
            return app.vault.getMarkdownFiles()
                .filter((f) => f.path.startsWith(PeoplePicker.PEOPLE_DIR) && f.basename !== 'People')
                .map((f) => f.basename)
                .sort((a, b) => a.localeCompare(b));
        } catch (_e) {
            return [];
        }
    }

    /** The person stub a new name gets (same body Edit attendees writes). */
    static stubBody(name, iso) {
        return `---\ntype: person\ncreated_at: "${iso}"\naliases: []\n---\n\n# [[${name}]]\n\n## Notes\n-\n`;
    }

    /**
     * The list rows: the people in `people` not yet selected (the picked ones
     * are the chips), narrowed to names containing every word of `query`.
     * Best match first: the exact name, then names with a word starting with
     * the query, then the rest, each alphabetical.
     *   → [{ name, selected: false }]
     */
    static rows(people, selected, query) {
        const sel = selected instanceof Set ? selected : new Set(selected || []);
        const q = String(query == null ? '' : query).replace(/\s+/g, ' ').trim().toLowerCase();
        const words = q.split(' ').filter(Boolean);
        const rank = (n) => {
            const lc = n.toLowerCase();
            if (!q) return 2;
            if (lc === q) return 0;
            if (lc.indexOf(q) === 0 || lc.split(/\s+/).some((w) => w.indexOf(words[0]) === 0)) return 1;
            return 2;
        };
        return Array.from(new Set(people || [])).filter((n) => n && !sel.has(n))
            .filter((n) => words.every((w) => n.toLowerCase().indexOf(w) >= 0))
            .map((n) => ({ n, r: rank(n) }))
            .sort((a, b) => (a.r - b.r) || a.n.localeCompare(b.n))
            .map((x) => ({ name: x.n, selected: false }));
    }

    /**
     * What Enter in the search does, given the highlighted row `active`:
     *   { kind: 'pick', name }  — the exact name, else the highlighted match
     *   { kind: 'add', name }   — nobody matches: create this person
     *   { kind: 'clear' }       — the name is already picked: just clear the search
     *   { kind: 'none' }        — empty or a name that cannot be a person
     */
    static enterAction(people, selected, query, active) {
        const sel = selected instanceof Set ? selected : new Set(selected || []);
        const q = PeoplePicker.cleanName(query).toLowerCase();
        if (!q) return { kind: 'none' };
        const exact = (people || []).find((n) => String(n).toLowerCase() === q);
        if (exact) return sel.has(exact) ? { kind: 'clear' } : { kind: 'pick', name: exact };
        const rows = PeoplePicker.rows(people, sel, query);
        if (rows.length) {
            const i = Number.isInteger(active) && active >= 0 && active < rows.length ? active : 0;
            return { kind: 'pick', name: rows[i].name };
        }
        const st = PeoplePicker.addState(people, query);
        return st.canAdd ? { kind: 'add', name: st.name } : { kind: 'none' };
    }

    /**
     * Whether the typed text can become a new person.
     *   { canAdd, name, reason: '' | 'empty' | 'exists' | 'hostile' }
     */
    static addState(people, query) {
        const typed = String(query == null ? '' : query).trim();
        if (!typed) return { canAdd: false, name: '', reason: 'empty' };
        if (PeoplePicker.isHostile(typed)) return { canAdd: false, name: '', reason: 'hostile' };
        const name = PeoplePicker.cleanName(typed);
        const lc = name.toLowerCase();
        if ((people || []).some((n) => String(n).toLowerCase() === lc)) return { canAdd: false, name, reason: 'exists' };
        return { canAdd: true, name, reason: '' };
    }

    /**
     * Create spice/people/<name>.md unless it exists. `now` is a moment (or
     * anything with format()); without one the stub carries an ISO time.
     * Resolves true when the person note exists afterwards, false otherwise.
     * Never throws.
     */
    static async createStub(app, name, now) {
        const clean = PeoplePicker.cleanName(name);
        if (!clean || !app || !app.vault) return false;
        const path = PeoplePicker.PEOPLE_DIR + clean + '.md';
        try {
            if (app.vault.getAbstractFileByPath(path)) return true;
            let iso = '';
            try { iso = (now && typeof now.format === 'function') ? now.format('YYYY-MM-DDTHH:mm:ssZ') : new Date().toISOString(); }
            catch (_e) { iso = ''; }
            // gesture-write-ok: creates one new person stub, never rewrites an existing note.
            await app.vault.create(path, PeoplePicker.stubBody(clean, iso));
            return true;
        } catch (_e) {
            return false;
        }
    }

    /**
     * Render the picker into `host`.
     *   opts.app        — Obsidian app (defaults to the global)
     *   opts.people     — candidate names (defaults to listPeople(app)); the
     *                     array is shared, so a host can see added people
     *   opts.selected   — a Set or array of names already picked (a Set is shared)
     *   opts.onChange   — called with the picked names after every change
     *   opts.onAdd      — async (name, api) → true when the person now exists.
     *                     Defaults to createStub. On true the picker selects
     *                     the name, clears the search and redraws.
     *   opts.now        — moment for the default stub's created_at
     *   opts.placeholder, opts.autofocus
     * Returns { root, input, list, chips, addBtn, note, people, selected,
     *           names(), redraw(), refreshAdd(), add(), whenIdle() }.
     */
    static mount(host, opts) {
        const o = opts || {};
        const app = o.app || ((typeof window !== 'undefined' && window.app) || (typeof globalThis !== 'undefined' && globalThis.app) || null);
        const people = Array.isArray(o.people) ? o.people : PeoplePicker.listPeople(app);
        const selected = o.selected instanceof Set ? o.selected : new Set((o.selected || []).filter(Boolean));
        PeoplePicker._injectCss(host);

        const TD = (typeof globalThis !== 'undefined' && globalThis.customJS) ? globalThis.customJS.TaskDialog : null;
        const fieldCss = (TD && TD.FIELD_CSS) || 'width:100%; min-width:0; box-sizing:border-box;';

        const root = host.createDiv({ cls: 'sauce-people-picker' });
        const chips = root.createDiv({ cls: 'sauce-task-link-chips sauce-people-picker-chips' });
        const input = root.createEl('input', { type: 'text', cls: 'sauce-people-picker-search' });
        input.placeholder = o.placeholder || 'Search or add a person…';
        try { input.setAttribute('aria-label', 'Search people'); } catch (_e) {}
        try { input.setAttribute('autocomplete', 'off'); } catch (_e) {}
        input.style.cssText = fieldCss;
        const list = root.createDiv({ cls: 'sauce-task-picker-results sauce-people-picker-list' });
        try { list.setAttribute('role', 'listbox'); } catch (_e) {}
        const addBtn = root.createEl('button', { cls: 'sauce-task-quiet sauce-people-picker-add', text: '＋ Add new person' });
        try { addBtn.setAttribute('type', 'button'); } catch (_e) {}
        const note = root.createDiv({ cls: 'sauce-task-caption sauce-people-picker-note' });

        let chain = Promise.resolve();
        // The highlighted row (Enter picks it, ↑/↓ move it); back to the top
        // whenever the search changes.
        let active = 0;
        let navigated = false;
        const names = () => Array.from(selected);
        const changed = () => { if (typeof o.onChange === 'function') { try { o.onChange(names()); } catch (_e) {} } };
        const refocus = () => { try { if (input.isConnected !== false) input.focus(); } catch (_e) {} };
        // A press on a chip's ✕ or a row would move focus off the search;
        // keep it there so the next name can be typed straight away.
        const keepFocus = (el) => {
            try { el.addEventListener('mousedown', (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); }); } catch (_e) {}
        };
        const pick = (name) => {
            selected.add(name);
            input.value = '';
            active = 0;
            navigated = false;
            redraw();
            changed();
            refocus();
        };

        const renderChips = () => {
            chips.empty();
            for (const name of selected) {
                const chip = chips.createDiv({ cls: 'sauce-task-link-chip sauce-people-picker-chip' });
                chip.createSpan({ text: name });
                const x = chip.createEl('button', { cls: 'sauce-task-chip-x', text: '✕' });
                try { x.setAttribute('type', 'button'); x.setAttribute('aria-label', 'Remove ' + name); } catch (_e) {}
                keepFocus(x);
                x.onclick = () => { selected.delete(name); redraw(); changed(); refocus(); };
            }
            chips.style.display = selected.size ? '' : 'none';
        };
        const renderList = () => {
            list.empty();
            const rows = PeoplePicker.rows(people, selected, input.value);
            if (active >= rows.length) active = Math.max(0, rows.length - 1);
            if (!rows.length) {
                const st = PeoplePicker.addState(people, input.value);
                const text = st.canAdd ? 'No one matches. Press Enter to add “' + st.name + '”'
                    : (String(input.value || '').trim() ? (st.reason === 'exists' ? 'Already added' : 'No one matches')
                        : (people.length ? 'Everyone is added' : 'No people yet'));
                list.createDiv({ cls: 'sauce-task-picker-empty', text });
                return;
            }
            rows.forEach((r, i) => {
                const on = i === active;
                const row = list.createDiv({ cls: 'sauce-task-picker-row sauce-people-picker-row' + (on ? ' is-active' : '') });
                try { row.setAttribute('role', 'option'); row.setAttribute('aria-selected', on ? 'true' : 'false'); } catch (_e) {}
                row.createSpan({ cls: 'sauce-people-picker-name', text: r.name });
                keepFocus(row);
                row.onclick = () => pick(r.name);
                if (on && typeof row.scrollIntoView === 'function') { try { row.scrollIntoView({ block: 'nearest' }); } catch (_e) {} }
            });
        };
        const refreshAdd = () => {
            const st = PeoplePicker.addState(people, input.value);
            addBtn.textContent = st.canAdd ? '＋ Add new person “' + st.name + '”' : '＋ Add new person';
            addBtn.disabled = !st.canAdd;
            addBtn.style.display = st.canAdd ? '' : 'none';
            const text = st.reason === 'hostile' ? 'A name can’t contain / \\ : * ? " < > | # ^ [ ] or start with a dot.' : '';
            note.textContent = text;
            note.style.display = text ? '' : 'none';
        };
        const redraw = () => { renderChips(); renderList(); refreshAdd(); };

        const add = () => {
            const st = PeoplePicker.addState(people, input.value);
            if (!st.canAdd) { refreshAdd(); return chain; }
            const name = st.name;
            const run = async () => {
                let ok = false;
                try {
                    ok = typeof o.onAdd === 'function'
                        ? await o.onAdd(name, api)
                        : await PeoplePicker.createStub(app, name, o.now);
                } catch (_e) { ok = false; }
                if (ok === true) {
                    if (people.indexOf(name) < 0) { people.push(name); people.sort((a, b) => a.localeCompare(b)); }
                    selected.add(name);
                    if (PeoplePicker.cleanName(input.value).toLowerCase() === name.toLowerCase()) input.value = '';
                    active = 0;
                    redraw();
                    changed();
                    refocus();
                }
                return ok === true;
            };
            const result = chain.then(run, run);
            chain = result.then(() => undefined, () => undefined);
            return result;
        };

        input.oninput = () => { active = 0; navigated = false; renderList(); refreshAdd(); };
        // Keyboard: ↑/↓ move the highlight; Enter picks the exact name or the
        // highlighted match, or adds the typed name when nobody matches, and
        // never submits the dialog around the picker; Backspace in an empty
        // search removes the last person picked. Focus stays in the search.
        input.addEventListener('keydown', (ev) => {
            if (!ev || ev.isComposing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                const n = PeoplePicker.rows(people, selected, input.value).length;
                if (!n) return;
                if (ev.preventDefault) ev.preventDefault();
                active = ev.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n;
                navigated = true;
                renderList();
                return;
            }
            if (ev.key === 'Backspace') {
                if (input.value || !selected.size) return;
                if (ev.preventDefault) ev.preventDefault();
                const last = Array.from(selected).pop();
                selected.delete(last);
                redraw();
                changed();
                return;
            }
            if (ev.key !== 'Enter') return;
            if (ev.preventDefault) ev.preventDefault();
            if (ev.stopPropagation) ev.stopPropagation();
            if (!String(input.value || '').trim()) {
                // An empty search picks only a row the arrows moved to.
                const rows = navigated ? PeoplePicker.rows(people, selected, '') : [];
                if (rows[active]) pick(rows[active].name);
                return;
            }
            const act = PeoplePicker.enterAction(people, selected, input.value, active);
            if (act.kind === 'pick') { pick(act.name); return; }
            if (act.kind === 'clear') { input.value = ''; active = 0; redraw(); refocus(); return; }
            if (act.kind === 'add') { add(); return; }
            refreshAdd();
        });
        keepFocus(addBtn);
        addBtn.onclick = () => add();

        const api = {
            root, input, list, chips, addBtn, note, people, selected,
            names, redraw, renderChips, refreshAdd, add,
            whenIdle: () => chain,
        };
        redraw();
        if (o.autofocus) setTimeout(() => { try { input.focus(); } catch (_e) {} }, 30);
        return api;
    }

    static _injectCss(host) {
        try {
            const doc = (host && host.ownerDocument) || (typeof document !== 'undefined' ? document : null);
            const head = doc && doc.head;
            if (!head || typeof doc.createElement !== 'function') return;
            const ID = 'sauce-people-picker-css';
            let el = Array.from(head.children || []).find((c) => c && c.id === ID) || null;
            if (!el) {
                el = doc.createElement('style');
                el.id = ID;
                head.appendChild(el);
            }
            if (el.textContent !== PeoplePicker.PICKER_CSS) el.textContent = PeoplePicker.PICKER_CSS;
        } catch (_e) { /* unstyled is still usable */ }
    }

    /**
     * Picker layout. The list scrolls inside the dialog (overscroll contained),
     * a long name ellipsizes instead of widening the dialog, and on a phone the
     * list is shorter so the search field stays above the keyboard.
     */
    static get PICKER_CSS() {
        return [
            '.sauce-people-picker { display: flex; flex-direction: column; gap: 8px; min-width: 0; }',
            '.sauce-people-picker-chips { min-width: 0; }',
            '.sauce-people-picker-chip { min-width: 0; max-width: 100%; }',
            '.sauce-people-picker-chip > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.sauce-people-picker-list.sauce-task-picker-results { margin-top: 0; max-height: 200px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }',
            '.sauce-people-picker-row { display: flex; align-items: center; gap: 8px; min-width: 0; }',
            '.sauce-people-picker-row.is-active { background: var(--background-modifier-hover); color: var(--text-normal); }',
            '.sauce-people-picker-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            'button.sauce-people-picker-add { align-self: flex-start; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.sauce-people-picker-note { margin-top: 0; color: var(--text-error); }',
            '@media (max-width: 600px) { .sauce-people-picker-list.sauce-task-picker-results { max-height: 168px; } }',
            'body.is-phone .sauce-people-picker-list.sauce-task-picker-results { max-height: 168px; }',
            '',
        ].join('\n');
    }
}
