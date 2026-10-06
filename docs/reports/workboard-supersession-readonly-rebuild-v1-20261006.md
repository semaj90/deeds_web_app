# Workboard supersession read-only rebuild

Status: `CURRENT_CORPUS_COMPOSED / SUPERSESSION_NOT_CONFIRMED`

The existing task-card, report-manifest, and triage builders ran twice with
explicit outputs under ignored `.tmp/active-goal-*`. No shared report was
overwritten. Independent readback verified all 94 task-file hashes and
deterministic workspace head, task-population checksum, task identity/revision/
state tuples, manifest artifact/checksum tuples, and triage lifecycle states.

Current frozen inputs:

- TaskCards: 10,660 tasks; population `sha256:a043c37cd49c70f7907429611288d042e8bdac4b1cae5853e831ca7af3e76434`.
- Task state counts: 1,355 `CURRENT`, 8,953 `REVIEW_REQUIRED`, 352 `WAITING`; 6,908 checked tasks lack proof.
- Report manifest: 1,265 artifacts; 0 current receipt-output associations; 0 archive candidates.
- Triage: 0 confirmed supersessions; 0 archive-eligible artifacts; no reviewed successor receipt supplied.

Replay passed for workspace head, task population, task-card tuples, manifest
artifact/checksum tuples, triage states, and current task-file hashes. All six
builder outputs stayed in ignored `.tmp/`. No task state, report source, archive,
SeaweedFS, database, vector, or cache was modified. This is not an approval to
suppress tasks or archive artifacts. Keep task 2.3 open pending reviewed,
revision-bound successor evidence and separate archive readback.

Validation: `node --test scripts/atlas/lib/openspec-task-triage-corpus-v1.test.mjs` passed 8/8; the four focused Workboard suites passed 41/41 before the final two negative assertions were added to an existing test; the updated triage suite passed 8/8.
