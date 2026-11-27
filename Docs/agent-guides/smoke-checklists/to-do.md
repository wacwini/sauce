---
purpose: Manual in-Obsidian smoke checklist for the to-do blueprint.
load_when: Cycle close that touches to-do's template / dialog / widget surface.
---

# to-do smoke checklist

Run on a deployed consumer vault after `brew upgrade sauce && sauce update --bump-pins`.

## The To-Do note
- [ ] `spice/to-do/To-Do.md` exists after `sauce update` and is `type: to-do-today`
- [ ] The **To Do** nav button, the ⋯ menu's **Today's To-Do**, All To-Dos' **Back to Today's To-Do** and the daily dashboard's Tasks title all open `To-Do.md`; none of them creates a `ToDo-<date>.md`
- [ ] `To-Do.md` shows today; the week strip and month calendar switch days in place
- [ ] Renders without console errors; no stuck "Loading..." states
- [ ] `+ New Task` button present + clickable; **Sauce: New task** in the command palette opens the same dialog
- [ ] Delete one of the two code blocks above `[//]: # (TODO_CHROME_END)`, type a line below the marker, then ⋯ → **Reset to Sauce layout** → the blocks come back, your line stays, and the old copy is in `.sauce-backup/to-do/`
- [ ] ⋯ → **Reset to Sauce layout** again → "already matches", nothing written
- [ ] Older `ToDo-<date>.md` notes are unchanged and still open

## +New Task dialog
- [ ] Both tabs render (Today + Recurring)
- [ ] Today tab: empty title → Create button disabled
- [ ] Today tab: valid title → Create button enables → click → task lands in today's daily
- [ ] Recurring tab: empty/invalid recurrence → Create disabled
- [ ] Recurring tab: valid "every day" → Create enables → click → registry entry appears in `Recurring Tasks.md`
- [ ] Link picker (both tabs): pick a note → `[[Note Name]]` inserted at cursor
- [ ] URL inserter (both tabs): label + URL → `[label](url)` inserted at cursor

## Widgets
- [ ] ToDoDailyRecurring renders today's recurring tasks (no raw `<dataviewjs>` text shown)
- [ ] ToDoDailyCarryover renders carryover tasks
- [ ] ToDoDailyProjectGroups: markdown links in task text render as `<a>` elements (not raw `[label](url)`)  ← bug (c) verification
- [ ] ToDoDailyProjectGroups: wikilinks render as `<a class="internal-link">` (not raw `[[Name]]`)  ← bug (c) verification
- [ ] ToDoDailyUnassignedMeetings: same markdown rendering verification as above
- [ ] Click a meeting-sourced task → opens the source meeting note

## Mid-day-added recurring task (bug b verification)
- [ ] Open today's `ToDo-<date>.md` (sentinel should be set after first render)
- [ ] Edit `spice/to-do/Recurring Tasks.md` → add a new recurring task line
- [ ] Cmd+R the today daily → new task appears in the recurring section  ← would have FAILED pre-v0.7.0
- [ ] Verify the sentinel comment now has the form `<!-- recurring-materialized-<date>: <hashes> -->`

## Sentinel heal migration (one-time, post-install)
- [ ] Before install: `grep -l 'recurring-materialized-2026' spice/to-do/2026/06-June/` finds files with date-only sentinels
- [ ] After `sauce update --bump-pins`: same grep shows date-only sentinels rewritten to `: ` (empty set) form
- [ ] On next Obsidian render, the set populates with current hashes

## Console
- [ ] DevTools console empty of red errors after rendering each surface

## Result-doc note
Paste "Manual smoke: COMPLETED on <vault>" or "N/A — no UI change" into the cycle's result doc.
