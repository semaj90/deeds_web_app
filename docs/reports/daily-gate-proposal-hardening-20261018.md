# Daily gate and proposal-boundary hardening — 2026-10-18

The preceding goal turn made concrete progress: it extended the live read-only
PostgreSQL audit and bounded lexical plan benchmark. This continuation advances
the existing daily failure-to-board path rather than introducing another task owner.

## Fresh daily admission evidence

Ran the existing canonical projection fabric audit in a read-only PostgreSQL
transaction, with local reports isolated under
`.tmp/atlas-daily-gate-20261018-continuation/`. The audit completed and rolled back.
Its verdict remains `NOT_SAFE_TO_PROJECT`, with six of eleven predicates below PASS:

- SYMBOLS_RESOLVED — PARTIAL_PROVEN
- SEMANTIC_OWNER_PROVEN — PARTIAL_PROVEN
- LATENT_FAMILY_PROVEN — PARTIAL_PROVEN
- PROJECTIONS_CHECKSUM_ALIGNED — NOT_PROVEN
- BITFROST_KEYS_DERIVABLE — NOT_PROVEN
- ACE_EVIDENCE_GROUNDED — NOT_PROVEN

Used the existing admission-summary helper to extract these failures and the
existing offline error planner to produce seven proposals, including the scoped
GEPA evidence correction below. No inference, service restart, GPU lease, or
canonical store mutation was performed. This is an admission audit, not a
completed daily Graphify indexing run.

## Existing board writer strengthened

`scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs` now validates the proposal
envelope and candidates using Zod. It rejects executed/DONE or mutation-authorized
input, duplicate fingerprints, malformed existing boards, artifact path collisions
and existing receipt paths. Mapped tasks explicitly remain PROPOSED,
non-dispatchable, noncanonical and mutation-forbidden, with the input file checksum.

`--dry-run` leaves board bytes unchanged; `--receipt` records local evidence without
overwriting prior receipts. Apply checks for changes during preparation, writes
through a uniquely named temporary file and rename, then independently reads back
the bytes and records before/after checksums. This is not a distributed lock across
unrelated board writers; concurrent writers still require coordination.

The preview retained seven existing diagnostic tasks and proposed seven current
ones. Applied through the existing JSON board owner with `--merge`: fourteen
diagnostic proposals total. A preimage, preview and apply receipt are preserved in
the local artifact directory. This JSON projection is not the separate 166-row
durable PostgreSQL Kanban population; no executable task was admitted or dispatched.

## Polyglot proof claim corrected

Preserved `docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json` unchanged.
Source review of `python/prove_polyglot_aten_dspy_gepa_oak_v1.py` shows:

- Real tensor operations exist: selected vector hash verification, optional pinned
  CUDA transfer, contiguous concatenation and finite-value checks.
- Plane 4 constructs OPTION/RLM strings and a dictionary; its score is local
  arithmetic (0.6 for audit flags plus 0.4 for compression), not DSPy/GEPA execution.
  There is no OaK HTTP call, RLM execution or canonical ContextManifest admission.
- The LUT producer makes seeded fixture vectors and injected dependency chains.
  They are not canonical EmbeddingGemma vectors or admitted ontology relations.
- The reported savings are heuristic byte compression, not tokenizer savings or
  semantic preservation. Bandwidth/queue-depth constants and a strategy label do
  not prove measured NVMe I/O or double-buffer scheduling.
- The receipt's PASS and timestamp are hardcoded; it cannot establish the claimed
  framework versions or execution date.

Independent CPU-only byte readback confirms the 153,600-byte bank, four selected
slices, and concatenated bytes match the historical hashes. The bank checksum is
`00c838c8fb5098161ec919421299bafdefc9521bc250df629787ba59da534afd`;
concatenation checksum is
`46a05542c1a8bcc7663b2e3e9346043a5d21f448562c8bcb10d807ebd1c23581`.
This does not replay GPU timing or validate live optimizer/framework execution.

Reopened ACE-GEPA-01 and qualified the overlapping ledger claims. Real DSPy LM
wiring, OaK validation, manifest admission, reviewed labels, source lineage and
production promotion remain separate open gates. The optional planner's direct
`--synthesize` path is not an admitted ContextManifest path; it was not invoked.

## Artifacts and validation

- `atlas-canonical-projection-fabric-audit-2026-10-18.{json,md}`
- `polyglot-byte-readback.json`
- `diagnostics.txt`, `repair-plan.json`
- `board-preimage.json`, `board-preview.json`, `board-apply.json`

All paths above are under `.tmp/atlas-daily-gate-20261018-continuation/`.
Eleven focused coordinator/board/daily-admission tests passed, including rejection,
missing-input failure and no-overwrite negative controls. Independent replay produced
the same deterministic plan checksum; independent board readback matched the apply
receipt and verified all seven fresh proposals remain non-executable.

Live Playwright desktop/mobile tests passed at 1280 and 390 pixels. They compare
the existing file-backed proposals with actual rendered cards, assert PROPOSED
status/reason codes/evidence and absence of execution buttons, check card/page
horizontal bounds, and exercise mobile sidebar expansion/collapse without changing
the desktop preference. The mobile layout-bound assertion also passed independently.
Screenshot inspection exposed the previous 210-pixel expanded sidebar consuming
the mobile workspace. The sidebar now defaults to a compact rail on small screens;
manual expansion overlays rather than squeezing content. Board columns, metadata,
IDs and labels wrap, and the heading explicitly distinguishes diagnostic proposals
from durable PostgreSQL Kanban and the OpenSpec source index.

Screenshots are retained under `playwright-width/` and `playwright-layout/` in the
artifact directory; earlier failed screenshots are preserved in sibling directories.
The full Svelte check completed with zero errors and ten existing warnings in eight
other files. Direct compilation of all three changed Svelte files also passed with
zero compiler warnings. No broad production-readiness claim follows from these checks.

## Follow-up readback and integrated browser run

The OpenSpec task-source locator projection was refreshed again after the ledger
update using snapshot
`sha256:3841be3f72d60a224aeaf1cb4d46adf8d988183ff65f6756bee079de9e7e303c`.
The bounded apply and an independent read-only PostgreSQL query agree on 5,582
indexed source references; all 191 ambiguous identities remain ambiguous, with
zero canonical task promotions and zero executable Kanban writes. Invalid rows:
zero. The independent query also confirmed the separate durable PostgreSQL Kanban
population remains 166 rows. This census is diagnostic-only for the broader
OpenSpec evidence portfolio; its source-locator projection does not admit tasks.
The source-index importer’s plan manifest and database readback use different
serialized row shapes, so their raw manifest checksums are not directly compared;
the importer’s canonical post-commit verifier passed, followed by the independent
snapshot/count query.

An integrated live Chromium run then passed all four cases: daily diagnostic board
at 1280 and 390 pixels, same-origin TurboVec health, and the task-source index with
interactive snapshot tabs. Runtime health and UI assertions passed; this does not
close the six canonical projection gates or prove a successful daily Graphify run.

The live `:8095/health` endpoint was also probed read-only. It reports LangExtract
available at `/usr/local/lib/python3.13/site-packages/langextract/__init__.py`
(version 1.6.0), but does not expose requested/active runtime mode; its loaded
sidecar digest predates the local health change. The local health owner now reports
requested runtime, active runtime and mismatch state. Four runtime-mode combinations
(shim requested/active, official requested while shim active, and official active)
passed in a direct WSL runtime check. The Python `pytest` package is unavailable in
both the Windows and configured WSL interpreters, so the pytest file itself could
not be run. The live sidecar reports `torch=false`, `nx_cugraph=false`, `cugraph=false`,
`cuvs=false` and `cupy=false`; no live accelerator execution is claimed, and the
service was not restarted.

Review also exposed an unsafe gap in the ACE proposal renderer: it previously
accepted missing evidence text by constructing placeholder cards, derived packet
keys from arbitrary evidence references, and assigned confidence 1.0. The renderer
now requires explicit evidence bindings containing source ref, packet key, source
revision, content and checksum; it checks source revision against the manifest and
verifies the content checksum. It uses an advisory concept label and confidence
0.0, and fails closed when bindings are absent or inconsistent. Focused test status
passed 9/9. The helper remains a contract boundary; no live
producer-to-renderer-to-Bifrost caller has been demonstrated. OpenSpec task 15.4 is
marked PARTIAL to reflect that boundary.

Structured closeout:
- likely_cause: Unvalidated board inputs, placeholder evidence bindings, and fixture/framework claim conflation undermined the daily repair path.
- evidence: Fresh six-gate admission failure; seven-proposal replay/readback; 5,538 distinct OpenSpec task locators read back with zero canonical promotion; four integrated live Chromium tests and nine focused ACE renderer tests passed.
- patch_targets: Existing board writer/tests, AI dashboard/sidebar/layout, bounded E2E test, ACE proposal renderer/tests, and repair-fabric tasks ledger.
- safe_next_command: `openspec validate parent-atlas-agentic-repair-fabric --strict`
- smoke_command: `npx vitest run src/lib/server/atlas/context/ace-context-proposal-renderer-v1.spec.ts --reporter=dot`
- report_path: `docs/reports/daily-gate-proposal-hardening-20261018.md`
