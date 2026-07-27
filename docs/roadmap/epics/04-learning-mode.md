# E4 — Learning mode

317 hand-written `tldr` paragraphs currently sit behind a collapsible button, read once and
never again. The same data supports a different product: not a reference you look things up
in, but something you can practise against. This epic needs **no new data** — every question
type below is generated from fields that already exist.

Scope discipline matters here more than anywhere else in the program: this is a second mode
sharing one codebase with the browser, and it must not degrade the browsing experience.

---

### `E4-01` — Quiz mode shell, routing and scoring

**Labels:** `epic:learning`, `area:viewer`, `size:L`
**Branch:** `claude/e4-01-quiz-shell`
**Depends on:** E1-01
**Blocks:** E4-02, E4-03, E4-04

**Context**

This issue builds the frame that the question types plug into, and ships with **no question
types of its own** — `E4-02` and `E4-03` provide those. Keeping the frame separate is what
lets several small sessions add question types in parallel afterwards.

Like everything else in the viewer, it must be topic-agnostic and driven by `meta`.

**Files**

- `viewer.html` — quiz container
- `assets/viewer.js` — quiz mode
- `assets/viewer.css` — styles

**Task**

1. Route quiz mode as `?d=<topic>&mode=quiz`. Entering it hides the list UI and the detail
   view; leaving it restores the previous state.
2. Define a question-type registry: each type is an object with an `id`, a `label`, a
   `canGenerate(pool, meta)` predicate, and a `generate(pool, meta)` returning
   `{ prompt, choices, answerIndex, explanationEntryId }`. Register types in an array so a
   later issue adds one by appending to it and touching nothing else.
3. Build the round flow: pick 10 questions from the registered types, present one at a time,
   accept an answer, show immediately whether it was right, reveal the correct answer with a
   link to the relevant entry's detail view, then advance. End with a score summary and
   options to play again or return to browsing.
4. Draw the question pool from entries matching the **current filters**, so you can drill just
   Ethics or just the 19th century. Show which pool is in use. If the pool has fewer than 8
   entries, refuse to start and say why.
5. Persist cumulative stats in `localStorage` under `phil_quiz_v1`: per topic, questions
   answered, correct, and per-entry correct/incorrect counts. `E4-04` reuses the per-entry
   counts.
6. If no registered type can generate a question for the current topic, show an explanatory
   empty state rather than an error. This is the expected state when this issue lands alone.
7. Add a "Quiz" entry point to the list view near the Random button.
8. Keyboard support: number keys select an answer, Enter advances.

**Acceptance criteria**

- [ ] `?d=phil&mode=quiz` enters quiz mode; leaving restores the list with filters intact.
- [ ] With no question types registered, the empty state appears and nothing throws.
- [ ] A stub question type registered temporarily in the console produces a full 10-question
      round with a score summary. Describe this test in the PR.
- [ ] Filtering to a field before starting restricts the pool, and the pool is described on
      screen.
- [ ] A pool under 8 entries is refused with a clear message.
- [ ] Stats persist across reload; a "reset stats" control clears them.
- [ ] Keyboard answering works, in both themes, at 375px width.

**Out of scope**

- Any actual question type.
- Timers, streaks, leaderboards, or accounts.

**Verify**

Walk a full round using a temporary stub type, reload, and confirm stats persisted.

---

### `E4-02` — Question type: identify the entry from its tl;dr

**Labels:** `epic:learning`, `area:viewer`, `size:M`
**Branch:** `claude/e4-02-guess-from-tldr`
**Depends on:** E4-01
**Blocks:** none

**Context**

The first real question type: show a `tldr` with identifying details removed, offer four
names, ask which one it describes. All 317 `phil` entries have a `tldr`; `hist-chars` has
partial coverage improving through `E6-03`; `hist-events` has none, so `canGenerate` must
return false there.

**Files**

- `assets/viewer.js` — register the question type

**Task**

1. Register a type with id `tldr-identify`. `canGenerate` requires at least 8 pool entries
   with a non-empty `tldr`.
2. Redact the answer from the prompt: remove the entry's `name`, every whitespace-separated
   part of it longer than 3 characters, and any surname appearing before a comma, replacing
   each with `———`. A question that gives away its answer is a broken question.
3. Build three distractors from the same pool, preferring entries sharing a tag value with the
   answer (same field, tradition, region or role, per `meta.cardTags`) so the choice is not
   trivial. Fall back to random pool entries when too few share a tag.
4. Shuffle the four choices. Show each choice as `name` plus `dates`.
5. On reveal, show the unredacted `tldr` and link to the entry's detail view.
6. Never generate the same answer entry twice in one round.

**Acceptance criteria**

- [ ] On `?d=phil&mode=quiz`, questions of this type generate and are answerable.
- [ ] Redaction is effective: sample 20 generated prompts and confirm none contains the
      answer's name or surname. State this in the PR.
- [ ] Distractors are plausible — usually sharing a field or tradition with the answer.
- [ ] `canGenerate` returns false for `hist-events`, and quiz mode there shows the empty state
      rather than breaking.
- [ ] The reveal shows the full unredacted text and a working entry link.
- [ ] No repeated answer within a round.

**Out of scope**

- Difficulty levels or adaptive selection.
- Free-text answering.

**Verify**

Play three full rounds on `?d=phil`, and confirm `?d=hist-events&mode=quiz` degrades cleanly.

---

### `E4-03` — Question type: put entries in chronological order

**Labels:** `epic:learning`, `area:viewer`, `size:M`
**Branch:** `claude/e4-03-chronology-question`
**Depends on:** E4-01
**Blocks:** none

**Context**

Every entry in every topic has `y`, so unlike `E4-02` this type works on all three — it is the
only question type `hist-events` can offer. Ordering three items is also a genuinely useful
thing to practise, and a place where the index teaches something a list cannot.

**Files**

- `assets/viewer.js` — register the question type

**Task**

1. Register a type with id `chronology`. `canGenerate` requires at least 8 pool entries with a
   numeric `y`.
2. Pick three entries whose `y` values are **at least 15 years apart** from each other, so the
   answer is unambiguous, and present them in random order.
3. Ask the reader to choose the correct ordering, oldest first. Present the four choices as
   orderings of the three names — this reuses the shell's multiple-choice mechanism rather
   than requiring drag and drop.
4. Do not reveal `dates` on the choices; that is the answer. Reveal them at the answer stage
   alongside links to all three entries.
5. For topics where `y` is a birth year, phrase the prompt accordingly, using
   `meta.itemNounSingular`. Do not assume the `phil` phrasing.
6. Handle BCE years correctly — `y` is negative and more negative is earlier. Verify with an
   ancient trio explicitly.

**Acceptance criteria**

- [ ] This type generates on all three topics, including `hist-events`.
- [ ] Chosen entries are always ≥15 years apart.
- [ ] A trio spanning BCE and CE is ordered correctly; state the tested case in the PR.
- [ ] Dates are hidden in the question and shown in the reveal.
- [ ] Prompt wording is driven by `meta`, not hardcoded to philosophers.
- [ ] Mixed rounds interleave this type with `tldr-identify` where both can generate.

**Out of scope**

- Drag-and-drop ordering.
- Orderings of more than three entries.

**Verify**

Play a round on each topic and confirm at least one BCE-spanning question orders correctly.

---

### `E4-04` — Flashcard drill over favourites with spaced repetition

**Labels:** `epic:learning`, `area:viewer`, `size:L`
**Branch:** `claude/e4-04-flashcards`
**Depends on:** E4-01
**Blocks:** none

**Context**

Favourites (`phil_favs_v1`) is currently just a filter — a list you star things onto and then
mostly ignore. This turns it into a study deck: name on the front, `tldr` on the back, self-
graded, with a simple scheduler that surfaces weak cards more often.

Keep the scheduler simple and legible. This is a static site with no account; a small
localStorage-backed algorithm is the right size.

**Files**

- `viewer.html` — flashcard container
- `assets/viewer.js` — flashcard mode and scheduler
- `assets/viewer.css` — card styles

**Task**

1. Route as `?d=<topic>&mode=cards`. The deck is the current topic's favourites; if there are
   none, explain how to add them and link back to the list.
2. Front shows `name` and `dates`; flipping reveals `desc`, `tldr`, and a link to the detail
   view.
3. After each flip, offer three self-grades: `Again`, `Good`, `Easy`.
4. Implement a Leitner-style scheduler with five boxes and intervals of 1, 2, 4, 8 and 16
   days. `Again` sends a card to box 1; `Good` advances one box; `Easy` advances two. Store
   per-card box and next-due date in `localStorage` under `phil_cards_v1`, keyed by entry id.
5. Each session serves due cards first, then unseen cards, up to 20. Show progress as
   `n of m` and a count of cards due today.
6. Seed a card's initial box from the per-entry correct/incorrect counts recorded by `E4-01`,
   so quiz performance carries over. Cards with no history start in box 1.
7. Add a "Study favourites" entry point next to the existing favourites filter.
8. Keyboard support: space flips, 1/2/3 grade.

**Acceptance criteria**

- [ ] With favourites starred, `?d=phil&mode=cards` serves them as flippable cards.
- [ ] With none, an explanatory empty state links back to the list.
- [ ] Grading `Again` reschedules the card for the same session; `Easy` advances two boxes.
- [ ] Scheduler state survives reload and is keyed by entry id, not name.
- [ ] The due-today count is correct after a simulated date change. Describe how you tested it.
- [ ] Unstarring a favourite removes it from the deck without losing its stored progress.
- [ ] Keyboard shortcuts work, in both themes, at 375px.

**Out of scope**

- SM-2 or any full SRS algorithm.
- Syncing, export, or cross-device state.
- Building decks from anything other than favourites.

**Verify**

Star eight entries, run a session grading a mix, reload, and confirm the schedule persisted.
