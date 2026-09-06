## Ownership boundaries

| Surface | Owner | Constraint |
|---|---|---|
| Source/workspace lineage | Parent Atlas/PostgreSQL | Exact revision required; no placeholders |
| Canonical dense vector | PostgreSQL `semantic_768` | 768 dimensions; EmbeddingGemma native output |
| Semantic projection | Qdrant `_768_v2` | Rebuildable projection; point IDs are projection IDs |
| Canonical content hydration | PostgreSQL | Projection results hydrate through exact identity joins |
| Candidate coordinate | `CandidateOrdinalMapV1` | One admitted candidate universe for every representation |
| Graph coordinate | Graph projection artifact | `projectionOrdinal` remains separate until parity proves a bridge |
| OaK execution | Parent Atlas bounded executor | Exact implementation references; read-only first |
| Context | ACE `ContextManifest` | Consumes predecessor evidence; does not rerun retrieval |
| Learned AE | Separate derived representation | Never aliases native MRL IDs or canonical identity |

## Gate sequence

```text
LINEAGE-01/02
       ↓
RETRIEVAL-01G/01H
       ↓
PROJECTION-REGISTRY-01
       ↓
RETRIEVAL-01J dry-run
       ↓
DAG-RUNTIME-01A..01E
       ↓
NESTED-TRAIN-02
       ↓
NESTED-REP-01
```

The initial implementation state is shadow/read-only. A bounded write canary,
if later authorized, must be a separate promotion decision with exact target
resolution, rollback evidence, and readback.

## Representation contract

`semantic_768` is the canonical dense oracle. Native MRL representations are
derived by exact prefix truncation plus renormalization and use representation
IDs distinct from learned latent representations. Learned `latent_128` and
`latent_64` require a new immutable training receipt and checkpoint revision.

## DAG contract

The planner emits actions; the runtime binds each action to an exact callable
owner using `implementationRef`, operator identity, retained `boundArguments`,
and a matching parameter checksum. Receipts exclude timing/process/session
metadata from deterministic hashes. Mutation actions remain rejected.

## Qdrant projection reconciliation protocol (frozen — RETRIEVAL-01L, 2026-09-06)

This freezes the durable proposal/apply/readback/rollback protocol for Qdrant
projection ownership, generalizing the pattern that `RETRIEVAL-01L-08A`
(tasks.md) already proved end-to-end on the bounded 434-chunk `PKT-LINEAGE-08A`
cohort (`RETRIEVAL_01L_CANARY_READY`, zero payload/vector conflicts, proven
apply-idempotence via `--replay`). It does not authorize applying this
protocol to any other population (e.g. the separate, still-untouched
675-plus-434=1,109 `QDRANT_POINT_MISSING` rows tracked elsewhere in tasks.md) —
each future population requires its own explicit operator authorization to
execute the protocol below, same as 08A required.

**Two distinct operations, never conflated:**

1. **Payload reconciliation** (`audit-bridge-recon-dry-04-v1.mjs` /
   `apply-bridge-recon-dry-04-v1.mjs`) — patches metadata payload fields
   (`packet_key`, `canonical_chunk_id`, `source_ref`, `source_revision`,
   `workspace_revision`, `source_namespace`, `representation_id`) on a Qdrant
   point that already exists. Never touches vectors or point IDs. Verdicts:
   `STOP_NO_APPLY` (nothing eligible), `READY_FOR_AUTHORIZED_APPLY` (non-empty
   patch set), `NO_PATCHES_MISSING_POINTS_REMAIN` (fully reconciled, missing
   points are a separate population).
2. **Projection creation** (`freeze-retrieval-*-qdrant-projection-proposal-v1.mjs`
   / `apply-retrieval-*-qdrant-projection-v1.mjs` pattern) — creates a Qdrant
   point that does not exist yet. This is a real vector-index write (new
   `content` named-vector upsert), not a reconciliation patch, and has its own
   blast radius. Quantifying a missing-point population is never itself
   authorization to build or apply this kind of proposal.

**Required artifact chain for either operation (non-negotiable, per this
gate's own standing rule — "close only when governance freezes the future
protocol", not by re-deriving an unrecoverable historical proposal):**

1. **Audit** (read-only) — classifies every candidate against the live store;
   zero writes. Must report `writesPerformed: false`.
2. **Immutable proposal** — frozen from the audit output only, never from a
   second live query. Carries `proposalChecksum` (sha256 of the proposal body)
   and `targetPointSetChecksum` (sha256 of the exact point-ID set it targets).
   A proposal must refuse any candidate the audit did not itself admit (e.g.
   the 08A proposal refused any chunk without a verified PostgreSQL
   `semantic_768` row — 768-dim, content-hash-exact). Per this repo's Wire
   Format Layering Rule, raw vector floats are never inlined in the proposal —
   only a source reference (e.g. `chunkRowId`) that a later apply step
   dereferences fresh from PostgreSQL at apply time.
3. **Preimage check** — before mutating, apply reads the current state of
   every target point ID and records it (e.g. "0 unexpectedly pre-existing"
   for a creation proposal; the pre-patch payload for a reconciliation
   proposal). This is the rollback artifact.
4. **Authorized apply** — gated behind an explicit non-default signal (the
   08A precedent used an `ATLAS_AUTHORIZE_*` env var for payload reconciliation
   and a direct operator "yes" for projection creation); consumes only the
   frozen proposal, re-verifies the proposal's own recorded
   `targetPointSetChecksum` before touching anything, and records
   `consumedProposalChecksum` + `consumedTargetPointSetChecksum` in its
   receipt.
5. **Exact readback** — every mutated point is re-read immediately after
   apply and compared against the intended state. Receipt records
   `readbackExact` / `readbackMismatch` counts, not merely a success flag.
6. **Same-proposal replay** — the apply tool is run a second time against the
   identical proposal/state. A correct protocol implementation reports zero
   effective changes (`replayEffectiveChanges: 0` / `REPLAY_IDEMPOTENT_PROVEN`)
   — this is the idempotence proof, not a separate manual check.
7. **Terminal re-audit** — the audit tool (step 1) is rerun after apply to
   confirm the population's classification moved as expected (e.g.
   `EXACT_PATCH_REQUIRED`/missing → `ALREADY_RECONCILED`) with zero new
   conflicts.

**What does not satisfy this protocol**: reconstructing a patch set from an
older, no-longer-current dry-run report when the live audit already shows
zero patches remaining (this produces a trivial `targetCount: 0` and is not
idempotence evidence — see tasks.md's "Honest note on `--replay`" for the
concrete case this happened); treating a nonzero missing-point count as
self-authorizing; or promoting "final live state looks reconciled" as
equivalent to "the exact original proposal was durably replayable" (these are
different claims — the second failed for the historical 6,306-entry bulk
proposal specifically because no immutable proposal artifact was retained at
the time, which is the gap this freeze closes going forward).

**Governance status**: `RETRIEVAL-01L` closes as a protocol-freeze item with
this specification. It does not close, and this freeze does not authorize,
applying either operation to the remaining ~1,109 `QDRANT_POINT_MISSING`
population (675 pre-existing `embedding_eligible=false` rows, correctly out
of scope for projection creation, plus 434 rows now covered only insofar as
they overlapped the already-closed 08A cohort) — that remains a distinct,
separately-authorized future proposal cycle that MUST follow the seven steps
above.
