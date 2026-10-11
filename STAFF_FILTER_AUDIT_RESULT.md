# Staff-filtering bug audit — result

Audit-only. No fixes or UI changes. This document records where extraction, normalization, filtering, and completion/empty-state live, how to read the new audit logs, and a conclusion on the likely bug cause.

---

## 1. Exact file(s) for extraction

**File:** `src/hooks/useOsmdScore.ts`

- **Where:** Notes are taken from the OSMD cursor in `getNotesUnderCursorFilteredByStaffAndHandWithMeta`:
  - `cursor.NotesUnderCursor?.()` — used only to decide “is there anything at cursor?” and as fallback when `GNotesUnderCursor()` fails (and only when not filtering).
  - **Actual source of the practice list:** `cursor.GNotesUnderCursor?.()` (array of graphical notes with `sourceNote` and staff info).
- **Conversion to practice notes:** `buildPracticeNotesFromGNotes(gFiltered, sortedStaffIndices, isMultiStaff)` (same file, ~159–183). For each GNote: `getMidiFromNote(g.sourceNote)`, `getStaffIndexFromGNote(g)`, `getStaffRoleFromStructure(...)`. Notes with `staffRole === undefined` are **dropped** here (not added to the list).
- **MIDI per note:** `src/lib/osmdToMidi.ts` — `getMidiFromNote(note)` (used inside `buildPracticeNotesFromGNotes`). The bulk helper `extractExpectedMidiNotes` is **not** used in the staff-filtered path; the playable list is built from `practiceNotes` in the hook.

---

## 2. Exact file(s) for normalization / flattening

**Files:**

- **`src/hooks/useOsmdScore.ts`**  
  - **Flattening to a playable list:** `buildPracticeNotesFromGNotes` produces `PracticeNoteWithSource[]` (one item per note that has a valid MIDI and a defined `staffRole`). So “normalization” from many GNotes to a list of practice notes (with midi, staffIndex, staffRole) happens here. Notes without `staffRole` are dropped at this step.
- **`src/lib/osmdToMidi.ts`**  
  - **Pitch → MIDI:** `getMidiFromNote(note)` is the only normalization used in this path (no staff/measure/part; just halfTone → rounded MIDI).

There is no separate “flatten to unique MIDI list” step before staff filtering; the UI’s expected notes come from `filtered.practiceNotes` (after staff filter) in `updateExpectedNotes`, then `uniqueMidi = Array.from(new Set(clean)).sort(...)`.

---

## 3. Exact file(s) for staff filtering

**File:** `src/hooks/useOsmdScore.ts` only.

- **Staff structure:** `getNoteStaffInfo(gNotes)` (lines ~77–106).  
  - `sortedStaffIndices = [0, 1, ...]` in **document order** (first staff = index 0, second = index 1).  
  - Comment: “first = upper staff (e.g. treble), second = lower staff (e.g. bass)”. So in this code, **staff index 0 → upper**, **staff index 1 → lower**.
- **Role assignment:** `getStaffRoleFromStructure(staffIndex, sortedStaffIndices, isMultiStaff)` (lines ~145–155).  
  - `sortedStaffIndices[0] === staffIndex` → `'upper'`  
  - `sortedStaffIndices[1] === staffIndex` → `'lower'`  
  - Otherwise (or if `staffIndex === undefined`) → `undefined` (note is dropped in `buildPracticeNotesFromGNotes`).
- **Filtering by selected mode:** In `getNotesUnderCursorFilteredByStaffAndHandWithMeta`:  
  - `staffRoleTarget = staffMode === 'upper' ? 'upper' : staffMode === 'lower' ? 'lower' : null`  
  - `filteredItems = staffRoleTarget ? practiceNoteItems.filter((i) => i.practiceNote.staffRole === staffRoleTarget) : practiceNoteItems`  
  So “upper” mode keeps only `staffRole === 'upper'`; “lower” keeps only `staffRole === 'lower'`.

---

## 4. Exact file(s) for completion / empty-state logic

**File:** `src/App.tsx`

- **Message when no notes for selected staff:** Lines 429–441.  
  - `staffFilterNoNotesMessage` is set when `expectedNotes.length === 0 && endStaffMode`.  
  - If `isEnd`: “No more upper-staff notes remaining.” / “No more lower-staff notes remaining.”  
  - If not `isEnd`: “No upper-staff notes found in this score.” / “No lower-staff notes found in this score.”  
  So the **empty-state copy** (“No upper-staff notes found…”) is decided in **App.tsx** from `expectedNotes.length === 0` and `endStaffMode === 'upper'` (and the same for lower).

**File:** `src/hooks/useOsmdScore.ts`

- **When does `endStaffMode` get set?** In `updateExpectedNotes`: when `notesUnderCursor.length === 0` (i.e. no notes after staff/hand filter), the code calls `moveCursorToNextPlayablePosition`. If that reaches end without finding any position with notes for the current filter, `onEndReached` runs and sets `setEndStaffMode(staffMode === 'both' ? null : staffMode)` and `setExpectedNotes([])`, etc. So **completion/empty-state for “no notes for this staff”** is decided in the hook when the cursor search for a playable position hits end; the UI then reads `endStaffMode` and `expectedNotes.length` in **App.tsx** to show the message.

---

## 5. Audit logging added (no other changes)

In **`src/hooks/useOsmdScore.ts`**, inside `getNotesUnderCursorFilteredByStaffAndHandWithMeta`:

1. **`[STAFF_AUDIT] First 20 GNotes at cursor (before buildPracticeNotes)`**  
   Logged once per cursor position when the function runs. For the first 20 GNotes (after hand filter), each item has:
   - `sequenceIndex`, `midi`, `label`, `measureIndex` (undefined; not read from OSMD here), `partIndex` (0), **`rawStaffIndexFromOsmd`**, **`assignedStaffRole`**  
   So you can see:
   - Notes with `rawStaffIndexFromOsmd: undefined` → they will be dropped in `buildPracticeNotesFromGNotes` (no staffRole).
   - Notes with `assignedStaffRole: undefined` (e.g. staff index not in `sortedStaffIndices[0]` or `[1]`) → also dropped.

2. **`[STAFF_AUDIT] First 20 extracted notes (at cursor)`**  
   First 20 entries of **practiceNoteItems** (after buildPracticeNotes). Each has:
   - `sequenceIndex`, `midi`, `label`, `measureIndex` (undefined), `partIndex`, **`rawStaffIndexFromOsmd`**, **`staffRole`**  
   So you see only notes that survived the “has staffRole” step.

3. **`[STAFF_AUDIT] Staff filter counts`**  
   Per cursor position:
   - **`selectedStaffMode`** — current mode (`'both' | 'upper' | 'lower'`).
   - **`totalNoteCountAtCursor`** — `gNotes.length`.
   - **`extractedCountAfterHandFilter`** — `gFiltered.length`.
   - **`practiceNoteItemsCount`** — count after buildPracticeNotes (notes with valid staffRole).
   - **`filteredCountBoth`** — same as practiceNoteItemsCount.
   - **`filteredCountUpper`** — count with `staffRole === 'upper'`.
   - **`filteredCountLower`** — count with `staffRole === 'lower'`.

**How to get sample logs:** Load a score, choose “Upper staff” (or “Lower staff”), and advance through a few positions. Open devtools Console and look for `[STAFF_AUDIT]`. Sample interpretation:

- If **upper** mode shows “No upper-staff notes…” and logs show `filteredCountUpper: 0` but `filteredCountLower > 0` and some notes have high pitch (e.g. treble):
  - Check **`rawStaffIndexFromOsmd`** for those treble-pitch notes. If it is **undefined**, the bug is **dropped upper notes** (c).
  - If treble-pitch notes have **`rawStaffIndexFromOsmd: 1`** and **`assignedStaffRole: 'lower'`**, then document order in this score is “staff 0 = bass, staff 1 = treble”, but we map 0→upper, 1→lower → **inverted staff tagging** (a).
- If **`filteredCountUpper`** and **`filteredCountLower`** are both 0 but **`totalNoteCountAtCursor`** or **`practiceNoteItemsCount`** > 0, then all notes have a staff role that is neither 'upper' nor 'lower' (e.g. 'single' or wrong indices) → possible **wrong filter condition** (b) or **inverted tagging** (a).
- If counts look correct at first but the UI still shows “No upper-staff notes” until you advance, consider **stale filtered list / stale state** (d).

---

## 6. Conclusion (audit-only)

From the code and the behavior you described (“Upper staff mode often says: No upper-staff notes found”; “Lower staff mode can produce real target notes like G1”):

- **Extraction:** Only in **`src/hooks/useOsmdScore.ts`** (cursor, `buildPracticeNotesFromGNotes`).
- **Normalization / flattening:** **`src/hooks/useOsmdScore.ts`** (building practice notes and dropping notes without `staffRole`); **`src/lib/osmdToMidi.ts`** for MIDI only.
- **Staff filtering:** **`src/hooks/useOsmdScore.ts`** only (staffRole vs `staffRoleTarget`).
- **Completion / empty-state:** **`src/App.tsx`** (message from `endStaffMode` and `expectedNotes.length`); **`src/hooks/useOsmdScore.ts`** (setting `endStaffMode` when cursor search finds no playable position for current staff mode).

**Likely bug type:**

- **(a) Inverted staff tagging:** The code assumes document order “first staff = upper (treble), second = lower (bass)”. In some scores/OSMD layouts, the first staff may be bass and the second treble. Then we assign staff 0 → “upper” and staff 1 → “lower”, so treble notes get `staffRole === 'lower'` and bass get `staffRole === 'upper'`. That would explain “lower” showing bass (e.g. G1) and “upper” finding no notes (if the score has no staff-0 notes, or only staff-1 notes).
- **(c) Dropped upper notes:** If `getStaffIndexFromGNote` returns **undefined** for treble-staff notes (e.g. missing `staffLine` or parent chain), those notes are dropped in `buildPracticeNotesFromGNotes` and never get `staffRole === 'upper'`. So “upper” would often be empty while “lower” (staff 1) still has notes.

**Recommended conclusion:** **(e) Combination** — most plausible are **(a) inverted staff tagging** (document order 0/1 not matching treble/bass) and/or **(c) dropped upper notes** (undefined `staffIndex` for treble). The new audit logs will show which:

- **Inverted tagging:** Treble-pitch notes in the log with `assignedStaffRole: 'lower'` and `rawStaffIndexFromOsmd: 1`.
- **Dropped upper notes:** Treble-pitch notes in the first audit log with `rawStaffIndexFromOsmd: undefined` and `assignedStaffRole: undefined`, and missing from the second log.

No fix applied in this audit; use the logs above to confirm and then fix in a follow-up step.
