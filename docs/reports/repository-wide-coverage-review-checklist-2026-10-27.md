# Repository-Wide Coverage Review Checklist

**Purpose:** Review the boundaries needed before claiming Graphify or Parent Atlas works across every admitted directory.

**Current verdict:** `NOT_PROVEN`; the target is read-only coverage verification, not safe-to-project admission.

## Evidence available

- PostgreSQL read-only identity census: 61,718 packet rows; registry-v1 tables absent; the selected repository UUID exists for `deeds-web-app`.
- The admitted Graphify execution has seven membership scopes: `repo:root` (29,026 sources) and six nested scopes (1,079 combined). Only the root scope has the selected UUID mapping.
- Neo4j read-only census: 622,527 distinct nodes, 687,900 node-label memberships across 37 labels, and 450,349 relationships across 38 endpoint-class combinations. Diagnostics include 40,384 packets missing `packet_key` and 13,241 features missing `feature_label`. A census is not an export or completeness proof.
- Latest Neo4j census receipt: `.tmp/atlas/neo4j-graph-coverage-v2/2026-10-27T21-14-27.819Z-d1cd3a63-63ce-40b6-bd01-fbcbdc8d4ddc.json`; digest `sha256:169a77e7b61fea64193dedbffc3cfc15b80ec7a743f102b0bb9ad0abd816d92b`. It remains `CENSUS_ONLY_NOT_EXPORTED`.
- Latest Canonical Gate V2 receipt: `.tmp/atlas/canonical-gate-runs/2026-10-27T21-19-58.607Z-439ace48-ef12-46f1-bcc6-009b47586834/canonical-gate-receipt-v2.json`; digest `sha256:b938c283a5df4c4944a8c94074fbc38c609e36085d786b977dcfa70fcafa8242`; receipt structure/checksum and every evidence-file digest reread passed; overall `FAIL`, first mandatory blocker `PACKET_IDENTITY` (`GRAPHIFY_EXECUTION_NOT_CANONICAL`), graph coverage `PARTIAL`, projection admission `UNKNOWN`, `canonicalAuthority=false`, and `writesPerformed=false`.
- Legacy graph-export validation receipt: `.tmp/atlas/graph-json-coverage-validation-20261027-v2.json`; verdict `FAIL` because packet/feature identity and coverage evidence are incomplete. Its valid edge references apply only to the retained 271-edge subset and do not establish graph coverage.
- OKF profile audit: 743 files accounted for; 387 checked and invalid, 356 excluded by profile/extension. Reasons are recorded per file; do not bulk-edit until profile selection is reviewed.

## Decisions for review

- [ ] **Directory scope:** Is “every directory” bounded strictly to files admitted by the sealed source-selection manifest, with generated, dependency, secret, and external paths excluded by explicit reason?
- [ ] **Nested repositories:** Should the six nested Graphify scopes be admitted as separate repositories, mapped to existing repository UUIDs, or remain excluded until an owner supplies mappings? Do not reuse the root UUID by inference.
- [ ] **Meaning of coverage:** Require exactly-once accounting for each admitted file, per-directory counts, parser applicability, and explicit exclusions/failures. A file with no applicable parser may be accounted for without claiming AST extraction.
- [ ] **Parser policy:** Confirm capability routing by file type (Tree-sitter, AST-grep, compiler/LSP, structured-document validator); unsupported formats need a reason, not silent omission.
- [ ] **OKF profiles:** Review why 387 files fail the current profile and why 356 are excluded. Confirm schema/profile assignment before changing source documents.
- [ ] **Graph export:** Approve explicit node/relationship coverage thresholds and a consistent-read strategy before treating a referentially valid subset as complete. Preserve missing-endpoint and excluded-edge diagnostics.
- [ ] **Identity boundary:** Keep repository UUID and source/packet identity in PostgreSQL-owned contracts; registry-v1 absence and noncanonical Graphify authority remain blockers to packet admission.
- [ ] **Alias cardinality:** Current legacy data has no observed alias collisions, but decide whether the contract permits many historical locators per canonical packet before enforcing one-to-one uniqueness.
- [ ] **Write boundary:** Keep DDL, packet upserts, Graphify promotion, Neo4j projection writes, and Qdrant indexing separately authorized after read-only proof.
- [ ] **Acceptance:** Require a unique checksummed `RepositoryWideCoverageReceiptV1`, deterministic replay, exact cohort reconciliation, per-directory status, and independently verified identity/revision bindings.

## Review conclusion

The architecture can be directory-independent, but current evidence does not show repository-wide Graphify coverage. Existing batch helpers consume supplied rows rather than discovering and reconciling the entire admitted inventory. Registry scope resolution currently covers only `repo:root`; graph evidence is a live aggregate census, not a complete revision-qualified export. Keep all review items open until the corresponding owner supplies evidence.

`likely_cause`: Existing analysis components are bounded to supplied cohorts or root-scope identity and have not been composed into a full admitted-inventory reconciliation.

`evidence`: Canonical Gate V2 receipt above; live PostgreSQL/Neo4j read-only census; `openspec/changes/atlas-directory-first-analysis-v1/tasks.md`; `docs/reports/packet-identity-registry-upsert-pipeline-review-2026-10-27.md`.

`patch_targets`: `scripts/validate/canonical-gate.mjs`; `scripts/atlas/export-neo4j-graph-json.mjs`; `scripts/atlas/validate-graph-json-contract.mjs`; registry planner/resolver/DDL/Drizzle owners; `openspec/changes/atlas-directory-first-analysis-v1/tasks.md`.

`safe_next_command`: `node scripts/validate/canonical-gate.mjs` (read-only; expected nonzero while mandatory blockers remain).

`smoke_command`: `node --test scripts/atlas/lib/neo4j-graph-coverage-v2.test.mjs`.

`report_path`: `docs/reports/repository-wide-coverage-review-checklist-2026-10-27.md`.
