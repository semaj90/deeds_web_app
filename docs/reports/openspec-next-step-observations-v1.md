# OpenSpec Next-Step Observation Extraction

Date: 2026-10-23

## Outcome

`DIR-INDEX-07D` remains **PARTIAL**. A deterministic, source-span-bound advisory extraction now covers every row in the current workboard task snapshot. It does not establish an admitted workspace revision, canonical task state, or execution authority.

## Frozen run inputs

- Task-path reference manifest: `.tmp/atlas/directory-intelligence/openspec-source-path-edges/openspec-paths-final-20261023T005219Z/manifest.json`
- Task-path manifest-body SHA-256: `97f0940bd9888195761690ff406259f588976452c82fae436cf44fb95a138076`
- Task-path JSONL SHA-256: `66891005977f748f5748ca87d731089469a455a39d57afeaac2b05efef0e85aa`
- Task-path independent readback SHA-256: `2915a201cebf3122335c977fb037f4bf2657287e12722d080714c796b9aa6848`
- Directory summary Arrow SHA-256: `789216cd2a6cfb2cc88703cb3d87acd04bbfe52c0b25976ddcadd39a883c9909`
- Workboard task snapshot source-file hash-map SHA-256: `e519b83a5326b3fa65e1cdfe6886f6fd29e90e00549e1dd6ff090e5e707578b2`

## Results

- 13,241 task observations; 13,297 exact checkbox/field spans verified.
- 13,241 authored checkbox states, 12 explicit status labels, 41 proof/evidence labels, 1 owner label, and 2 blocker labels.
- No explicit dependency or safe-next-command labels were found by the extractor. These fields remain absent rather than inferred.
- 4,763 path references were linked by task reference; 1,331 are report-reference candidates based on `.tmp/` or `docs/reports/` prefixes, not receipt-validity claims.
- The linked path-edge run independently verified 4,763 reference spans, 3,674 exact repository file bindings, and 3,542 target content hashes. Unresolved references remain represented with their resolution statuses.

Observation manifest: `.tmp/atlas/directory-intelligence/openspec-next-step-observations/task-observations-graph-20261023T010254Z/manifest.json`

- Manifest-body SHA-256: `754f6097ee4c3decd63e576831169119011aa6c9ab76f4f60126649cb384eac6`
- Observation JSONL SHA-256: `ab983133eefef57eeacb1767c8184de9c003b7f61fa89f07d688e2e1c9c0bfc0`
- Independent readback: `.tmp/atlas/directory-intelligence/openspec-next-step-observations/task-observations-graph-20261023T010254Z/independent-readback.json`
- Independent readback SHA-256: `44db3ec1a0795296dbb43380508eb6bfc400b7ecad4a9eacb70cac480502e952`
- Readback verified 13,241 task rows, 13,297 observation spans, and 4,763 path-reference spans against the current task-source hash map.

## Validation and boundaries

Focused tests cover deterministic UTF-8 span extraction, CRLF handling, stale file/block rejection, and refusal to interpret ordinary prose or nested checklist content as parent-task fields. The test suite does not validate the semantics of prose labels. The workboard snapshot has a generation timestamp, so its raw serialized checksum changes between otherwise equivalent runs; the source hash-map digest is recorded separately. A `[~]` task checkbox is not included by the current workboard owner, so the ledger task remains `[ ]` and states PARTIAL in text.

The artifacts are advisory projections only. Current bytes are not bound to a workspace revision; task references are not canonical requirement identities; report-path candidates are not validated receipts; and extracted labels do not authorize actions. No production database, cache, Graphify state, ACE admission, or model was modified.
