/**
 * ToDoHubActions (CustomJS) — renders a single AccentButton row on the
 * spice/to-do/All-ToDos.md hub note. The button label is
 * "← Back to Today's To-Do"; clicking opens the one To-Do note,
 * spice/to-do/To-Do.md (ToDoChromeBar.openToday creates it from the installed
 * template when it is missing), the same note the todo-today nav-button opens.
 *
 * Empties dv.container before rendering to avoid dual-fire duplicate rows.
 * Embeds-safe.
 */
class ToDoHubActions {
    async render(dv) {
        if (dv.container.closest('.markdown-embed')) return;
        try { if (dv.container.closest('.markdown-preview-view')?.querySelector('.todo-chrome-root')) return; } catch (_e) {}

        const myGen = (dv.container.__toDoHubRenderGen || 0) + 1;
        dv.container.__toDoHubRenderGen = myGen;

        while (dv.container.firstChild) dv.container.removeChild(dv.container.firstChild);

        const backIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;

        const row = dv.container.createEl('div');
        row.style.cssText = 'display: flex; gap: 12px; margin: 0.5em auto; justify-content: center; align-items: stretch; max-width: 600px; flex-wrap: wrap;';

        const goToday = () => {
            // The one To-Do note (spice/to-do/To-Do.md) always shows today.
            const bar = window.customJS && window.customJS.ToDoChromeBar;
            const Bar = bar && bar.constructor;
            if (Bar && typeof Bar.openToday === 'function') return Bar.openToday();
            app.workspace.openLinkText('spice/to-do/To-Do.md', '');
        };

        customJS.AccentButton.render(row, { label: "Back to Today's To-Do", icon: backIcon, onClick: goToday, flex: true });
    }
}
