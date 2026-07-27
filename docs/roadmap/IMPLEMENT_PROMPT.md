# Prompt — implementer

Paste the block below into each implementing session, substituting the issue number.
**One session implements exactly one issue.**

---

```
You are implementing ONE issue in the repository `andreasnonslid/phil`.

THE ISSUE: #<ISSUE_NUMBER>

STEP 1 — Load context, in this order, and read each one fully:
  1. `docs/roadmap/AGENT_BRIEF.md`   — repo architecture, data contract, hard guardrails
  2. issue #<ISSUE_NUMBER>            — your complete specification
  3. only the files named in the issue's `**Files**` section

Do not explore the repository beyond those files. The issue is complete by construction;
if you feel you need more context, that is a signal to STOP (see step 5).

STEP 2 — Check you are unblocked.
Read the issue's `**Depends on:**` line. If it names issues that are still open, stop
immediately: comment on your issue saying which dependency is unmet, add the `blocked`
label, and end. Do not implement around a missing dependency.

STEP 3 — Implement.
  - Branch: use the exact branch name from the issue's `**Branch:**` line.
  - Follow the `**Task**` steps in order. They contain every decision you need; you are not
    expected to design anything.
  - Respect the `**Out of scope**` list absolutely. Do not fix unrelated bugs, do not
    refactor neighbouring code, do not reformat. If you spot a real problem outside scope,
    note it in the PR description instead of fixing it.
  - Keep the diff as small as the task allows.

STEP 4 — Verify before you open the PR.
  - Run `python3 -m http.server 8000` and check every box in the "How to verify your work"
    checklist in AGENT_BRIEF.md, plus everything in the issue's `**Verify**` section.
  - If you changed any file under `data/`, confirm it still parses and the entry count is
    what the issue says it should be.
  - Re-read the issue's `**Acceptance criteria**` and confirm each one is genuinely true.
    Do not tick a box you have not actually checked.

STEP 5 — Open the PR, or stop honestly.
  - If everything passes: commit, push with `git push -u origin <branch>`, and open a PR
    whose body contains `Closes #<ISSUE_NUMBER>`, the completed verification checklist, and
    a note of anything you deliberately left out.
  - If the issue is ambiguous, contradicts the code you found, or is clearly larger than one
    session: STOP. Push nothing. Comment on the issue explaining precisely what is wrong and
    how you would split it. A blocked issue costs nothing; a wrong guess propagates into
    every issue built on top of this one.

NEVER:
  - Add a build step, package manager, framework, or CDN dependency.
  - Rewrite a whole file under `data/` — always read, modify in place, write back, and
    assert the entry count.
  - Change deep-link URL formats.
  - Work on more than one issue in this session.
```

---

## Choosing what to run next

Pick any open issue whose `Depends on` issues are all closed, preferring lower wave numbers.
When several are available, prefer `size:S` for the cheapest models and reserve `size:L` for
a stronger one.

`E6` (data quality) issues are always safe to slot in: they are pure JSON edits, touch no
code, and cannot conflict with feature work.
