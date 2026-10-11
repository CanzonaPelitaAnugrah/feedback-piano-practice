# Staff split pipeline audit

Audit of where practice notes are extracted, normalized, filtered, and where lower-staff identity can be lost. **No UI or app redesign; no fixes applied.**

---

## 1. Where practice notes are extracted (OSMD / MusicXML)

**File:** `src/hooks/useOsmdScore.ts`

- **Cursor API used:** `cursor.NotesUnderCursor?.()` and `cursor.GNotesUnderCursor?.()` (no instrument argument).
- **Actual source of the playable list:** Only **`GNotesUnderCursor()`** is used to build the list that gets filtered and sent to the practice engine. `NotesUnderCursor()` is used only for:
  - Initial guard: “is there anything at cursor?”
  - Fallback when `GNotesUnderCursor()` throws or returns empty: then `notesUnderCursor` (from `NotesUnderCursor()`) is returned **unfiltered** and only when `filtering` is false (i.e. staff and hand are “both”). So when staff/hand filtering is active, the fallback is an empty list.
- **Relevant code:** Lines 143–156, 249–251, 264–265. The variable `notesUnderCursor` in `updateExpectedNotes` is set to `filtered.notes`, which comes from `gFiltered.map((g) => g.sourceNote)` where `gFiltered` is derived from `cursor.GNotesUnderCursor()`.

**Conclusion:** Extraction is from **OSMD’s cursor** in `useOsmdScore.ts`. The only real source of staff-aware data is **`GNotesUnderCursor()`** (array of graphical notes with `sourceNote` and, when present, staff info). MusicXML is not read directly by this app; OSMD parses it and exposes the result via the cursor.

---

## 2. Where extracted notes are normalized / flattened into the playable list

**File:** `src/lib/osmdToMidi.ts`

- **Function:** `extractExpectedMidiNotes(notes: Note[]): number[]`
- **Behavior:** Takes an array of OSMD `Note` (source notes). For each note: skip rest, get first finite number from `halfTone` / `TransposedPitch` / `Pitch`, round and add to a Set. Returns sorted array of unique MIDI numbers.
- **Staff/voice/measure/part:** Not used. Only pitch (MIDI) is preserved. All staff/measure/voice/part identity is **dropped here**.

**File:** `src/hooks/useOsmdScore.ts` (call site)

- **Call:** `extractExpectedMidiNotes(notesUnderCursor as Note[])` at line 296.
- **Input:** `notesUnderCursor` at this point is already **filtered** by staff and hand (it is `filtered.notes` from `getNotesUnderCursorFilteredByStaffAndHandWithMeta`). So normalization receives only the notes that passed the filter; it does not see the full cursor set.

**Conclusion:** Normalization is in **`src/lib/osmdToMidi.ts`** (`extractExpectedMidiNotes`). The **flattening** (from many notes to one list of MIDI numbers) happens there. Staff/measure/voice/part are not in the normalized representation.

---

## 3. Fields available on extracted notes (before normalization)

**At the graphical layer (GNote from `GNotesUnderCursor()`):**

- **sourceNote:** OSMD `Note` (used for pitch; passed into `extractExpectedMidiNotes`).
- **staffLine:** Read in `getStaffIndexFromGNote()` — from `g.staffLine`, or `(g as any).StaffLine`, or parent chain: `parentVoiceEntry → parentStaffEntry → parentMeasure → ParentStaffLine` and index in `ParentMusicSystem.StaffLines`. If any of these are missing or throw, the function returns **undefined**.
- **handHint:** Optional string (`'right' | 'left'`) from OSMD/source; used for hand filtering.

**On the source note (OSMD `Note`) before normalization:**

- **midi:** Not stored as “midi”; derived from `halfTone` or `TransposedPitch.getHalfTone()` / `Pitch.getHalfTone()` in `osmdToMidi.ts` and in the debug loop in `useOsmdScore.ts`.
- **label:** Not a field; derived in the debug loop via `TransposedPitch?.ToStringShort(1)` or `Pitch?.ToStringShort(1)` (e.g. `"C4"`).
- **measureIndex / sequenceIndex / partIndex / voice index / voice id:** Not read or used anywhere in the app. OSMD’s data model has them (e.g. via measure, part, voice), but the app never reads them for filtering or display.
- **staffIndex:** Not on the `Note`; only on the **GraphicalNote** as `staffLine` (and via parent chain). So staff identity lives only on the GNote and is used only during filtering in `useOsmdScore.ts` before mapping to `sourceNote`.

**Conclusion:** For each “extracted” note we effectively have: **midi** (from halfTone), **label** (from pitch ToStringShort), and **staffIndex** only at the GNote level (and only when `getStaffIndexFromGNote` succeeds). measureIndex, sequenceIndex, partIndex, voice index/id, and hand/staff metadata beyond staffLine/handHint are not used.

---

## 4. Where “staff role” (upper/lower) is assigned or inferred

**File:** `src/hooks/useOsmdScore.ts` only. There is no separate “staffRole” field or type.

**Logic:**

1. **Staff index:** From `getStaffIndexFromGNote(g)` — raw OSMD staff index (e.g. 0, 1) or **undefined** if not available.
2. **Upper vs lower:** In `getNoteStaffInfo()`:
   - Collect distinct staff indices from all GNotes at cursor that have a defined index.
   - Sort by **average pitch** (ascending): lowest average = first = **bass = lower staff**, highest = last = **treble = upper staff**.
   - So “upper” and “lower” are **inferred from pitch**, not from a fixed 0/1 convention.
3. **Assignment to filter:**
   - `trebleStaff = sortedStaffIndices[sortedStaffIndices.length - 1]`
   - `bassStaff = sortedStaffIndices[0]`
   - `targetStaff = staffMode === 'upper' ? trebleStaff : bassStaff`
   - `gFiltered = gNotes.filter((g) => getStaffIndexFromGNote(g) === targetStaff)`

**Conclusion:** Staff “role” (upper vs lower) is **inferred** in **`getNoteStaffInfo()`** and then used in **`getNotesUnderCursorFilteredByStaffAndHandWithMeta()`** (same file). It is not stored on a note; it is derived from staff index + pitch-based ordering.

---

## 5. Whether any note defaults to upper when staff is unknown

**No.** Notes with **undefined** staff index (`getStaffIndexFromGNote` returns undefined):

- Do **not** match `targetStaff` when filtering by staff (so they are **excluded** when `staffMode === 'upper'` or `'lower'`).
- **Do** contribute to hand filtering only indirectly: `getHandFromGNote` returns undefined when staffLine is undefined, and `filterGNotesByHandMode` keeps notes when hand is undefined. So notes with unknown staff are **kept for hand filtering** (not forced to “upper”).
- In **getNoteStaffInfo**, notes with undefined staff do **not** contribute to `valid` or `staffIndices`. So if, at a given cursor position, **only** upper-staff notes have a defined staff index, then `staffIndices.length <= 1` → `isMultiStaff: false` → staff filter is **not** applied → **all** notes (including lower-staff ones with undefined index) are shown for both “upper” and “lower”. So in that case, “lower” does **not** default to upper; it shows everything. The failure mode for “lower” is different (see below).

---

## 6. Whether lower-staff notes are dropped during normalization

**No.** Normalization in `osmdToMidi.ts` does not see staff at all. It receives an array of source notes and turns them into MIDI numbers. It does not drop notes by staff.

Lower-staff notes can be **dropped earlier**, when building that array:

- In **`getNotesUnderCursorFilteredByStaffAndHandWithMeta`**, when `staffMode === 'lower'`, we keep only GNotes whose `getStaffIndexFromGNote(g) === bassStaff`. So:
  - If a lower-staff note has **undefined** staff index, it does **not** match `bassStaff` and is **dropped** for `staffMode === 'lower'`.
  - If **all** lower-staff notes at a position have undefined staff index, then `staffIndices` may only contain the upper staff index → `isMultiStaff` can be false → staff filter is not applied; then “lower” would show all notes (upper + lower), not “fail.”
- So the only way “lower” actually gets **no** notes (or too few) is:
  - **GNotesUnderCursor()** does not return those lower-staff graphical notes at all (OSMD/cursor behavior), or
  - Lower-staff notes have a **defined** staff index that is **different** from `bassStaff` (e.g. pitch-based ordering assigns a different staff to “bass” at this position), so they are filtered out when `staffMode === 'lower'`.

So **lower-staff notes are not dropped inside normalization**; they can be dropped in **filtering** in `useOsmdScore.ts` when staff index is missing or when upper/lower assignment (by pitch) disagrees with the score.

---

## 7. Whether the lower filter can produce an empty list and then silently fall back

**No silent fallback to upper or to “both” notes.**

- When the lower (or upper) filter yields **no** notes at the current cursor position:
  - **`getNotesUnderCursorFilteredByStaffAndHandWithMeta`** returns `notes: []` (and `totalAtCursor` = total GNotes count).
  - In **`updateExpectedNotes`**, when `notesUnderCursor.length === 0` (i.e. `filtered.notes.length === 0`), the code calls **`moveCursorToNextPlayablePosition`**, which repeatedly calls **`cursor.next()`** until either:
    - A position is found where the **same** staff/hand filter returns at least one note, or
    - **EndReached** → `onEndReached()` → `setIsEnd(true)`, `setExpectedNotes([])`, etc.
  - So when “lower” has no notes at a position, the app **skips** to the next position that has lower-staff notes, or to the end. It does **not** substitute upper-staff notes or unfiltered notes for “lower”.
- **Practice engine:** When `expectedNotes.length === 0`, it goes to IDLE and does not advance. There is no code path that says “if expectedNotes is empty, use the list from staffMode 'both' or 'upper'.”

So: **empty lower filter → skip to next playable position or end; no silent fallback.**

---

## Exact file summary

| Responsibility              | File(s) |
|----------------------------|--------|
| **Extraction** (OSMD cursor → GNotes + source notes) | `src/hooks/useOsmdScore.ts` (cursor.NotesUnderCursor / GNotesUnderCursor, then filtering) |
| **Normalization** (notes → playable MIDI list)       | `src/lib/osmdToMidi.ts` (`extractExpectedMidiNotes`) |
| **Filtering** (by staff and hand)                    | `src/hooks/useOsmdScore.ts` (`getNotesUnderCursorFilteredByStaffAndHandWithMeta`, `getNoteStaffInfo`, `getStaffIndexFromGNote`, `filterGNotesByHandMode`) |

There is no separate “filtering” file; filtering and extraction are in the same hook.

---

## Exact point(s) where lower-staff identity is lost or ignored

1. **`getStaffIndexFromGNote()` returns undefined**  
   **File:** `src/hooks/useOsmdScore.ts` (lines 23–42).  
   If OSMD does not set `staffLine` (or `StaffLine`) on the GraphicalNote and the parent-chain fallback (parentVoiceEntry → parentStaffEntry → parentMeasure → ParentStaffLine + StaffLines.indexOf) fails or throws, the note has **no** staff index. Then:
   - For `staffMode === 'lower'`, that note does not match `bassStaff` and is **excluded**.
   - So **lower-staff identity is lost** at the point where we rely on OSMD’s staff info and the fallback fails.

2. **GNotesUnderCursor() does not return lower-staff notes**  
   **File:** OSMD (cursor implementation); **app file:** `src/hooks/useOsmdScore.ts` (line 150).  
   If, for some scores or cursor positions, `GNotesUnderCursor()` returns only upper-staff graphical notes (e.g. due to MusicXML structure or OSMD iteration), then lower-staff notes **never** enter the pipeline. So lower-staff identity is **lost at the source** in the app’s only data source for staff-aware notes.

3. **Pitch-based upper/lower assignment**  
   **File:** `src/hooks/useOsmdScore.ts` (`getNoteStaffInfo`, lines 66–90).  
   “Lower” = staff with **lowest** average pitch at cursor; “upper” = **highest**. If in a given measure or system the bass staff has higher average pitch than the treble (e.g. one chord), then `bassStaff` and `trebleStaff` can be swapped for that position, and the “lower” filter will show the wrong staff. So lower-staff **identity can be wrong** (not lost) when pitch ordering disagrees with the score.

4. **Docstring vs implementation**  
   Line 218 says “Upper = staffIndex 0, lower = staffIndex 1” but the code uses **sorted** indices: first = bass = lower, last = treble = upper. So the comment is misleading (and in some layouts index 0 may be treble in OSMD). This does not by itself lose identity but can cause confusion when debugging.

---

## Sample debug output (conceptual)

You can add a small log right after getting `gNotes` and before filtering (e.g. at the start of `getNotesUnderCursorFilteredByStaffAndHandWithMeta` or in `updateExpectedNotes` when building debug labels) to inspect per-note:

**Upper staff note (typical):**

```ts
// For each g in gNotes, log something like:
{
  midi: 72,           // from getNoteHalfTone / Pitch
  label: "C5",        // from TransposedPitch.ToStringShort(1)
  staffIndex: 1,      // from getStaffIndexFromGNote(g) — e.g. treble = last in sorted
  // measureIndex, sequenceIndex, partIndex, voice: not available in app (not read from OSMD here)
}
```

**Lower staff note (typical):**

```ts
{
  midi: 48,
  label: "C3",
  staffIndex: 0,       // bass = first in sorted
}
```

**Lower staff note when identity is lost:**

```ts
{
  midi: 48,
  label: "C3",
  staffIndex: undefined,   // getStaffIndexFromGNote returned undefined → will be dropped for staffMode 'lower'
}
```

Suggested concrete logging point: inside `getNotesUnderCursorFilteredByStaffAndHandWithMeta`, after `const { sortedStaffIndices, isMultiStaff } = getNoteStaffInfo(gNotes)`, loop over `gNotes` and for each log: `getNoteHalfTone(g.sourceNote)`, label (from Pitch/TransposedPitch.ToStringShort), `getStaffIndexFromGNote(g)`, and whether the note is in `gFiltered` after staff filter. That will show exactly which notes have undefined staff and whether they are upper or lower by pitch.

---

## Summary

- **Extraction:** `src/hooks/useOsmdScore.ts` — from OSMD cursor (`GNotesUnderCursor()` is the source of staff-aware data).
- **Normalization:** `src/lib/osmdToMidi.ts` — `extractExpectedMidiNotes`; only MIDI is kept; no staff/measure/voice/part.
- **Filtering:** `src/hooks/useOsmdScore.ts` — same file as extraction; staff role inferred by pitch in `getNoteStaffInfo`, then filtered by `targetStaff` and hand.
- **Lower-staff identity lost/defaulted/ignored:** (1) `getStaffIndexFromGNote` returns undefined for some notes, so they are excluded when filtering by “lower”; (2) possible absence of lower-staff GNotes in `GNotesUnderCursor()` for some scores; (3) pitch-based upper/lower can swap in edge cases.
- **No** default to upper when staff is unknown; **no** dropping of lower-staff notes inside normalization; **no** silent fallback when the lower filter is empty (cursor advances or end is reached).
