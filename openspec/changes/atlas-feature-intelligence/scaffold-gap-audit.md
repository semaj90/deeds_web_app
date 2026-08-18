# Parent Atlas feature-intelligence / HyperGraphRAG gap audit

Date: 2026-08-18

Status semantics:
- `WRITTEN` — source/migration/test/proof code exists.
- `WIRED` — intended production owner can reach the surface, but runtime proof has not passed.
- `PROVEN` — requires executed build/runtime/database/GPU evidence.
- `RED` — required proof or active integration is still missing/unexecuted.

**Nothing added in this tranche is marked PROVEN.**

## P0 identity/evidence continuity — reconciled state

| Area | State | Current surface / remaining proof |
| --- | --- | --- |
| Native Consiliency structural provenance | WIRED / RED runtime | provenance-v2 8095 + Graphify native adapter |
| GIS symbol registry / versions / aliases | WRITTEN / RED DB proof | symbol registry repository + manual DDL |
| PostgreSQL schema introspection | WRITTEN / RED live DB | repeatable-read/read-only catalog snapshot; search_path=pg_catalog |
| Column catalog provenance | WRITTEN | `catalog_oid=NULL`; locator=`pg_class OID + attrelid + attnum` provenance |
| Schema object registry | WRITTEN / RED DB proof | stable IDs separate from catalog OIDs/locators |
| Reviewed schema/test rename/move continuity | WRITTEN / RED DB proof | `ReviewedIdentityAliasV1` + decision ledger + atomic alias projection |
| Test registry + immutable execution receipts | WRITTEN / RED live report | Vitest JSON → nomination/execution → registry/evidence |
| Static assertion identity | WRITTEN / RED frontend build | test declaration locator → assertion extractor → assertion registry |
| OpenSpec repository ingestion | WRITTEN | explicit roots + content-addressed document revisions |
| OpenSpec persistence + rename lineage | WRITTEN / RED DB proof | rename receipt persisted with evidence payload |
| OpenSpec default batch atomicity | WRITTEN / RED DB proof | caller-owned PostgreSQL transaction when `allow_partial=false` |
| WorkflowActionEvent adapters | WRITTEN / RED active orchestrator | workflow sequence/lane/tool owned by orchestrator; retrieval sequence stays metadata |
| Derived retrieval candidate runtime identity | FAIL-CLOSED | candidate IDs remain metadata, never canonical resource refs |
| ACE artifact workflow adapter | WRITTEN / RED active orchestrator | packet/relationship/evidence identity preserved |

## PostgreSQL schema evidence

`postgres-schema-introspector.ts` now:

- runs one `REPEATABLE READ, READ ONLY` transaction;
- pins `search_path` to `pg_catalog`;
- records `server_version_num` in the receipt;
- uses PostgreSQL deparsers for constraints/indexes/expressions/functions/triggers;
- keeps `catalog_oid` and `catalog_locator` out of `object_key` and `definition_hash`;
- models a column with `catalog_oid=NULL` and revision-local locator `{class_oid: pg_class, object_oid: attrelid, object_sub_id: attnum}`.

Proof runner:

```text
node scripts/atlas/prove-live-schema-introspection.mjs
```

Default is resolve/readback only. Registry creation requires both `--apply` and `--allow-create` so reviewed rename/move aliases may be applied first.

## Test / assertion evidence

Current path:

```text
Vitest JSON reporter file
        ↓
compileVitestJsonReport()
        ↓
TestCaseNominationV1 + TestExecutionObservationV1
        ↓
test registry resolution
        ↓
stable_test_id
        ↓
ast-grep static test()/it() declaration locator
        ↓
explicit expect/assert calls within test span
        ↓
AssertionNominationV1
        ↓
assertion registry
        ↓
stable_assertion_id
        ↓
atlas.test-evidence.v1
        ↓
atlas_evidence → atlas_evidence_entities
```

Vitest `assertionResults[]` rows remain test-case execution results; they do not own individual static `expect()`/`assert()` identity. Duplicate identical static assertion fingerprints are occurrence-scoped and require explicit review before canonical creation.

Proof runner:

```text
node scripts/atlas/prove-vitest-evidence.mjs --generate
```

Database materialization requires `--apply`; creation of unresolved tests additionally requires `--allow-create-tests`. The runner warns that rename/move review should happen before new test creation.

## Reviewed identity continuity

`ReviewedIdentityAliasV1` records:

- stable ID;
- old/new key;
- rename/move transition;
- old/new source refs and revisions;
- evidence refs;
- reviewer identity;
- workflow action ID;
- registry and producer revisions.

The database ledger `atlas_identity_alias_decisions` stores the review decision. Test/schema alias rows are projections of that decision. Application uses one PostgreSQL transaction, locks the stable registry row, verifies that `old_key` is either the canonical key or an existing alias for the same stable ID, writes the decision + alias, then re-resolves the new nomination and verifies continuity.

This supports chained reviewed renames/moves without changing the stable identity.

## OpenSpec

Current default materialization path is all-or-nothing:

```text
repository ingestion
  ↓ all documents parse
BEGIN
  ↓
materialize document evidence + entity facts
  ↓
materialize next document ...
COMMIT
```

`allow_partial=true` deliberately switches to per-document materialization. OpenSpec rename transitions are retained inside the canonical evidence payload via the compilation receipt rather than disappearing after parsing.

## Workflow ownership

`retrievalReceiptToWorkflowAction()` now requires the orchestrator to supply:

- workflow/action/DAG identity;
- global workflow sequence;
- actual lane;
- optional transport/tool identity.

`RetrievalActionReceiptV1.sequence` is retained as `metadata.retrieval_sequence`; it is not global workflow ordering. Revision-scoped `candidate_ids` remain metadata. Only canonical relationship/evidence/tool/resource identities may enter workflow canonical references.

**Active HyperRAG/ACE call-site remains RED:** the checked-in packet pipeline owns packet materialization and trace information but does not currently own `workflowId + actionId + dagNodeId + global sequence`. Do not fabricate those values to claim wiring.

## Database proof v2

```text
node scripts/atlas/prove-feature-intelligence-database.mjs
```

Migration/proof surface now includes:

- feature/evidence/N-ary relationship tables;
- dynamic evidence-entity hyperedge index;
- symbol registry;
- schema registry + `catalog_locator`;
- test registry/execution receipts;
- reviewed identity alias decision ledger;
- static assertion registry.

`--fixture` writes proof rows inside a transaction and rolls them back. **Current state remains RED because the runner has not been executed against the workstation database.**

## P0 execution gates still RED

- [ ] Build `packages/parent-atlas` with strict TypeScript.
- [ ] Run `npm --prefix packages/parent-atlas run test:feature-intelligence:all`.
- [ ] Run Python structural provenance tests.
- [ ] Run static structural wiring audit.
- [ ] Launch provenance-v2 8095 and run live AST/LangExtract proof.
- [ ] Run native structural materializer dry-run, then approved apply/readback.
- [ ] Run database proof inspection; on approved target run `--apply --fixture`.
- [ ] Run `prove-live-schema-introspection.mjs` on bounded schemas and review unresolved/ambiguous nominations before any `--allow-create`.
- [ ] Generate a real Vitest JSON report and run `prove-vitest-evidence.mjs`.
- [ ] Ground resolved Vitest tests back to static declaration spans and run assertion extraction/registry proof.
- [ ] Run OpenSpec repository batch materialization and capture its atomic receipt.
- [ ] Identify or implement the active workflow orchestrator that owns workflow/action/DAG/global-sequence identity, then wire retrieval/ACE event emission there.

## Remaining downstream RED work after P0 proof

```text
atlas_evidence_entities
      ↓
dynamic SQL hyperedges
      ↓
review / canonical relationship promotion
      ↓
relationship semantic_768
      ↓
exact pgvector/cuVS oracle
      ↓
Qdrant HNSW + CAGRA challengers
      ↓
Recall@K / latency / VRAM receipts
      ↓
incidence graph → NetworkX / Neo4j / cuGraph
      ↓
CPU PPR ↔ cuGraph PPR parity
      ↓
AcePacketV2 + workflow artifact
```

Then materialize the pinned feature matrix and attach revisioned TurboVec/SVD/KMeans/SOM/XGBoost/CrossEncoder/QLoRA receipts as derived signals only.

## Invariants

- Consiliency IDs are upstream provenance; GIS owns stable Atlas symbol identity.
- PostgreSQL OIDs/subobject locators are revision provenance, not stable schema identity.
- Vitest owns execution truth, not stable test or assertion identity.
- OpenSpec parser structure owns requirement/scenario/task identity; LangExtract does not.
- ast-grep observes static structure but cannot mint canonical application truth.
- Reviewed alias continuity happens before `allow_create` for a potentially renamed/moved object.
- Qdrant IDs, CAGRA ordinals, Neo4j IDs, feature-matrix rows and retrieval candidates are not canonical IDs.
- HNSW/CAGRA proximity edges are not application relationships.
- Dynamic SQL hyperedges remain candidates until explicit relationship promotion.
- PageRank/PPR, TurboVec, low-rank/SVD, clustering, SOM/manifold and learned rankers affect ranking/routing, not truth.
- `CanonicalAcePacketEnvelope` remains packet identity owner; `AcePacketV2` attaches validated N-ary evidence without replacing it.
