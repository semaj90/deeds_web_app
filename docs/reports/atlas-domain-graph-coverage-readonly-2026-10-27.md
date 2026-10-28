# Atlas Domain and Graph Coverage — Read-Only Audit (2026-10-27)

## Verdict

The urgent `domain_class` null-backfill claim is **not supported by the live database**: `public.atlas_packets` contains 61,718 rows and all 61,718 have a non-empty `domain_class`. The pasted denominator of 58,365 and missing count of 21,021 do not match this read. Coverage is not semantic validation: the observed labels include case/alias variants such as `Graph`/`graph` and `Database`/`database`, so taxonomy normalization and evidence-backed correctness remain open.

This was a PostgreSQL 18.4 read-only audit using `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, a 20-second statement timeout, and `ROLLBACK`. No rows were changed. Coverage counts below come from one aggregate statement; values/label distribution are inventory, not proof that producers or graph runs are current.

## Live PostgreSQL Snapshot

| Field | Present | Missing/empty | Assessment |
|---|---:|---:|---|
| `feature_id` | 61,718 / 61,718 | 0 | Populated; identity/feature validity not independently established here |
| `feature_label` | 61,660 / 61,718 | 58 rows with ID but no label | Paired feature identity is incomplete for 58 rows; distinct ID↔label cardinality was not established by this audit |
| `domain_class` | 61,718 / 61,718 | 0 | No null backfill warranted; taxonomy semantics and source evidence unproven |
| `tree_node_id` | 61,659 / 61,718 | 59 | 99.90%; do not rerun a blanket backfill |
| `title_id` | 61,660 / 61,718 | 58 | 99.91%; provenance not audited |
| `community_id` | 61,660 / 61,718 | 58 | 99.91%; 12,050 distinct non-null IDs; current Louvain run lineage not proven |
| `page_rank_score` | 61,659 / 61,718 | 59 | 99.90%; values range 0–0.39824516; current graph/run-to-packet lineage not proven |
| non-empty `concept_ids` | 58,360 / 61,718 | 3,358 without non-empty values | 3,357 SQL NULL and 1 empty array; not evidence that extraction is running or that concepts are grounded |

The 24 most frequent `domain_class` values include `Graph` (7,716), `graph` (2,350), `documentation` (6,782), `Other` (5,441), `MachineLearning` (2,341), `database` (2,515), and `Database` (180). This suggests a taxonomy consistency review, not a missing-value fill.

## Feature Identity and SvelteKit Canaries

Feature identity is a pair: `feature_label` is the human-readable name and `feature_id` is its corresponding stable/grouping identifier. The live database has 61,718 IDs and 61,660 labels; this audit did not prove a one-to-one ID↔label mapping.

The repository has an evidence-extraction helper at `scripts/atlas/lib/extract-repository-feature-evidence.mjs` and a proposal CLI at `scripts/atlas/build-derived-feature-identity.mjs`. The default identity remains the existing v1 behavior (existing non-generic label, summary, then path/basename). An opt-in `--proposal-v2` consumes the extractor's AST/document context and emits a separate non-mutating proposal; code evidence is regex-fallback, not live VS Code/LSP or 8095 Tree-sitter. The v2 path proposed `Post` / `sveltekit-frontend.post` at confidence 0.91 with status `GENERIC_REPLACEMENT_RECOMMENDED` and `canonicalMutation:false`. The source belongs to the selected cohort; snapshot bytes independently match its selected digest and 4,420-byte length. Admission reconciliation now proves the 30,105-source selected manifest against the tournament receipt and full 30,327-source snapshot. The corrected current authority audit reports `CURRENT_SNAPSHOT_PROVEN` for one execution; this proves selected-source execution lineage only, not canonical graph authority or label correctness. Treat the output as a review candidate. Earlier v1 three-file path-fallback results remain historical and are not v2 results.

Keep the concepts distinct: repository analysis proposes `feature_label` and `feature_id` from source/symbol/function evidence; `domain_class` is a separate taxonomy assignment validated against the versioned taxonomy/OAK owner. A feature ID slug alone must not be treated as domain-class evidence.

## Receipt Index and Limits

| Receipt | Recorded proof | What it does not prove |
|---|---|---|
| `docs/reports/domain-classification-readiness-audit.json` (2026-09-10) | Historical readiness inventory reports `domain_class=100%`, `tree_node_id=99.9%`, `pagerank=99.9%`, and `used_concepts=96.55%` for its own scope | Current database state, taxonomy correctness, or a shared denominator with the current 61,718-row read |
| `docs/reports/phase2c-entity-extraction-receipt.json` (2026-08-11) | Regex entity extractor returned five entity types on one 187-character sample | Corpus-scale LangExtract completion or grounded concept coverage |
| `docs/reports/phase2d-feature-layer-backfill-receipt.json` (2026-08-11) | Bounded 50-row exact-join apply; receipt reports 61,709 feature-domain facts and 150 ontology tuples afterward | Currentness, full-corpus domain validity, or approval for another backfill |
| `docs/reports/ast-entity-okf-domain-dry-run-v1.json` | Read-only proposal: 4,365 identities resolved, 3,535 classified (80.99%), 830 fallback, zero writes | Canonical taxonomy promotion or current live packet coverage |
| `docs/reports/parent-atlas-oak-capability-audit-v1.json` (2026-08-31) | OAK capability is `BOUNDED_PARTIAL`; several ontology/DAG capabilities remain open | Current live OAK term/relationship validation |
| `docs/reports/pagerank-networkx-custom-parity-v1.json` (2026-10-15) | Read-only custom-vs-NetworkX parity on graph revision `dff900…` (162,234 nodes); canonical authority false, no writes | Current Neo4j graph revision, packet-level score lineage, or PostgreSQL sync completion |
| `docs/reports/pagerank-promotion-gate-validation-v1.json` (2026-08-29) | A specific PageRank run passed validation; consumer promotion false and canonical authority false | Current packet-level synchronization or current graph snapshot parity |

## Recommended Feature Workboard Tasks

Keep all items open until their acceptance evidence exists. Do not infer completion from populated columns or old receipts.

- [ ] **FEATURE-IDENTITY-SVELTEKIT-01 — Analyze the admitted SvelteKit source cohort.** Admission reconciliation is proven for the 30,105-source selection. Feed revision-bound AST/LSP/exported-symbol evidence to proposal-v2; detect collisions; abstain on generic/path-only labels unless reviewed; and compare proposals to packet labels without writing. Current one-file output uses regex-fallback evidence and remains a review proposal, not a verified label.
- [ ] **DOMAIN-TAXONOMY-01 — Validate existing domain labels.** Inventory `domain_class` values and aliases; resolve each through the versioned PostgreSQL taxonomy/OAK owner; report unknown, deprecated, ambiguous, and case variants. Do not treat a feature-ID slug as domain-class evidence.
- [ ] **DOMAIN-FANOUT-02 — Build a source-grounded classification proposal.** Fan out only from revision-bound parser/LSP observations, AST entities, and grounded concept spans, including validated feature identity. Each proposal carries exact source/workspace revisions, byte spans, extractor/taxonomy revisions, confidence, and abstention reason. OAK validates term IDs/relations; it does not create source identity.
- [ ] **GRAPH-NEO4J-03 — Qualify graph-derived features.** Bind Louvain/community and PageRank outputs to one graph snapshot, algorithm/configuration, node identity map, and checksum. Resolve outputs back to canonical packet/source identities; unmatched or ambiguous graph nodes remain diagnostic.
- [ ] **PACKET-READBACK-04 — Prove one exact packet path.** Independently verify source → symbol/entity → packet → chunk → graph feature → retrieval/ACE identity and revisions before any broader cohort. Keep Postgres canonical; Neo4j is a rebuildable projection.
- [ ] **CONCEPT-COVERAGE-05 — Reconcile concept extraction.** Compare the 58,360 non-empty packet arrays to grounded extraction receipts and distinguish valid concepts, legacy/unqualified values, empty arrays, and missing values. Do not restart or enqueue a corpus job based solely on the 261-row historical claim.
- [ ] **WRITER-GATE-06 — Rehearse any repair without applying.** For each proposed update, require an owner-specific dry-run, exact current revision/identity cohort, conflict counts, idempotency, rollback plan, and independent readback. A populated-column count is not authorization.

### Architecture Alignment

`8095 Tree-sitter/AST-grep/LSP` produces source-bound observations → the canonical resolver binds source/symbol/packet/chunk identities → PostgreSQL owns canonical taxonomy, identity, and eligibility → OAK validates ontology terms and relations → Neo4j stores a revision-qualified graph projection → community/PageRank/domain features remain derived proposals until their graph and packet lineage is independently verified → SearchRuntime/ACE consume only qualified evidence. DSPy/GEPA may evaluate classification prompts against reviewed held-out data; they must not rewrite taxonomy facts or promote predictions.

**Gate result:** domain null coverage is resolved (`0` missing), but paired feature-label completeness has a 58-row gap. Selected-source admission and one terminal execution now reconcile for 30,105/30,105 rows; the audit keeps canonical graph authority false. Label/ID correctness, domain semantic validity, OAK-backed taxonomy alignment, current Neo4j/Louvain/PageRank lineage, and concept provenance remain **UNKNOWN / NOT PROVEN**. No backfill, Neo4j write, LangExtract batch, Graphify run, or projection promotion was performed in this refresh.
