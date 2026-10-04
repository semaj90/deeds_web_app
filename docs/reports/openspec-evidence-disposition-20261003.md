# OpenSpec Evidence Report Disposition — 2026-10-03

## Outcome

Audited the physical report set without moving or deleting any evidence and
without database, cache, vector, graph, or production writes. All 1,255 source
reports are `RETAIN_LOCAL` pending complete content, sensitivity, and replay
review. No old report was promoted based on its filename, timestamp, or apparent
completeness.

The generated inventory and this handoff are curated audit outputs: they
contain paths, checksums, byte sizes, Git state, limited source-revision fields,
and review boundaries—not copied report bodies. The inventory is 1,655,981
bytes, below the 10,000,000-byte (10 MB) gate. Its SHA-256 is
`d634e7311f9f4279ac2bfb755742771daa77c0cd249a58a28fe86fd33467a488`.

## Inventory

- Scope: all files below `docs/reports/openspec-evidence/` plus top-level
  `docs/reports/openspec-*` files.
- Snapshot: 1,255 files, 14,335,596,326 bytes (about 13.35 GiB); 325 files
  exceed 10,000,000 bytes.
- Git state: 534 tracked (514 clean, 20 modified), 341 untracked, and 380
  ignored; the ignored count includes files under the new date-scoped rules.
- Content identity: 1,252 unique SHA-256 checksums; two duplicate groups contain
  five files total. Duplicates are noted, not removed.
- Provenance: 242 reports declare a source commit different from the audit
  checkout; 1,013 have no source commit in the inspected metadata prefix.
- Review limits: the generator hashes complete files but reads only the first
  64 KiB for selected metadata. Complete report contents, repeatability, and
  source-content sensitivity were not reviewed. A `RETAIN_LOCAL` result is not
  an endorsement of report correctness.

## Disposition and exclusions

- `RETAIN_LOCAL`: all 1,255 existing report files. No source report met the
  independent review gate for `PROMOTE`, `ARCHIVE`, or `REGENERATE`.
- `PROMOTE`: the new structured inventory, this human-readable review, the
  generator, report index, and reusable prompt checkpoint. These outputs carry
  inventory metadata only and each passed the per-file staging size gate.
- No evidence was archived or regenerated. No source file was moved or deleted.
- `.gitignore` now excludes only
  `pipeline-20261003*/`, `pipeline-attempt-20261003T*/`, and
  `pipeline-current-worktree-20261003*.json` under this report directory. A
  tracked-path check found no existing tracked file matched those patterns.
  These rules preserve the local files; they do not clean them up.
- The full 1.66 MB manifest is the primary checksum inventory. Its duplicate
  paths and per-file dispositions are included there; the old reports remain
  untouched.

## Validation

From the repository root:

```powershell
node --check scripts/atlas/audit-openspec-report-disposition-v1.mjs
node scripts/atlas/audit-openspec-report-disposition-v1.mjs
git diff --check
```

The audit command completed and hashed all 1,255 files. The generated manifest
is below 10,000,000 bytes; validate every staged filesystem file and Git blob
against the same decimal 10 MB limit immediately before commit. Do not stage the
evidence tree.

## Remaining review gates

Review source-content sensitivity for candidates, verify deterministic replay
for summaries proposed for long-term promotion, and preserve all remaining raw
evidence locally. Only after those gates should further source reports be
promoted. The focused commit and push task remains open until staged scope,
committed blob sizes, and `origin/main` alignment are verified.
