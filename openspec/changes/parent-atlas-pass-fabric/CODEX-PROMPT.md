# Parent Atlas Pass Fabric — Execution Prompt (Codex/Claude Code)

Paste this as the opening prompt for a fresh coding-agent session. It is
self-contained — the agent should NOT need to re-derive the audit findings
below, only verify them against current code before acting.

---

## Mission

You are working in `deeds-web-app` (SvelteKit + Postgres + Qdrant + Neo4j +
Valkey legal-AI platform, "Parent Atlas" codebase-intelligence subsystem).
The system has many analysis capabilities (AST/lexical/entity extraction,
graph metrics, hypergraph events, OKF schema validation, ACE context
assembly, replay corpora, worker scheduling) already designed or partially
built. **The gap is not another algorithm — it is proof that every derived
artifact is traceable to a canonical identity, a specific revision, and a
specific execution episode, and that re-running the same input twice
produces the same result (idempotency) without corrupting history.**

Your job is a **proof ladder**, not a feature build. Each gate either PASSES
with evidence or is marked NOT_PROVEN — never assume completion from a
dry-run or from a file existing. See "Status language" below.

## Hard rule: verify before acting

Every finding below was true as of 2026-08-11. Before touching code:
1. Re-run the `grep`/`\d` commands shown to confirm the finding still holds
   (schemas drift, other sessions may have changed things).
2. If a finding no longer matches reality, STOP and report the discrepancy
   instead of proceeding on stale assumptions. This project has been burned
   repeatedly by agents claiming completion without re-verifying.

## Status language (ENFORCED — see root CLAUDE.md)

Use only: `CREATED`, `WIRED`, `DRY_RUN_PROVEN`, `APPLY_PROVEN`, `NOT_PROVEN`.
Never claim "production-ready" or "complete" from a dry-run. Never promote a
lane's status without a matching successful tool-call/query result attached
as evidence (see root CLAUDE.md § "Agent Execution Integrity").

## What is already proven (do not redo)

- `sveltekit-frontend/src/lib/server/analysis/worker.ts` +
  `analysis-jobs.ts`: `claimBatch()` with `FOR UPDATE SKIP LOCKED`, gate-fill
  math (`freeSlots = concurrency - active - pending`), `pg_notify`/`LISTEN`
  wake, crash recovery (`resetStaleJobs`), exponential backoff — all
  APPLY_PROVEN via direct source read. Do not re-implement.
- `analysis_pass_results` table exists live (11,076 rows) but is **orphaned**
  — `grep -r "analysis_pass_results" sveltekit-frontend/src` returns zero
  callers. Confirmed via live Postgres `\d analysis_pass_results`.
- `source_revision TEXT` and `pass_revision TEXT` columns added (nullable,
  additive, applied live).
- Partial unique index applied: `analysis_pass_results_identity_uq ON
  (packet_key, source_revision, pass_type, pass_revision, input_hash) WHERE
  source_revision IS NOT NULL AND pass_revision IS NOT NULL` — safe, does
  not touch legacy rows.
- Full-population duplicate classification run (not just top-N eyeball):
  1,272 duplicate groups total. **97% (1,225/1,272) = `pass_type='summarization'`,
  same model/prompt/temperature, 5 distinct outputs each** — this is real
  non-deterministic LLM execution history, NOT retry/ingestion-bug noise.
  **Do not delete or collapse these rows.** 47 groups (`embedding`: 37,
  `cache_push`: 10) remain unclassified — check these before assuming the
  same pattern.

## The four true P0 blockers (converged from two independent audits)

1. **Canonical `atlas_packets` writer is unproven.** `grep -r "packet_key\s*="`
   across `sveltekit-frontend/src/lib/server` finds only READS
   (`ace-packet-reader.ts`, `ace-materializer.ts`) — zero INSERT/UPSERT into
   `atlas_packets`. No `identity-worker.ts` file could be located (glob
   timed out; may be archived/deleted — check `deeds_labs/archive/` per
   root CLAUDE.md Archival Rules before assuming it never existed).
2. **`analysis_pass_results` is history, not a single-materialization
   cache** — see classification above. Needs a `PassIdentity` /
   `PassExecution` split (see contracts below) before any uniqueness
   invariant can be trusted.
3. **No immutable graph snapshot + no proven multi-hop traversal.** Prior
   audit found the neighborhood tool accepts `hops: 1-3` as a parameter but
   the underlying query only traverses a single `IMPORTS` edge — multi-hop
   is UI-parameter-only, not implemented.
4. **No frozen replay dataset.** Without one, every learned-ranking
   experiment (RFF, XGBoost, HMM, GPU reranker, ACE prediction) can appear
   to "improve" results with no stable baseline to compare against.

## Revised execution order (supersedes any earlier PF1→PF14 linear reading)

```
PF0-3   ALREADY DONE — queue/worker mechanics (verify only, don't redo)
PF4A    DONE — classify analysis_pass_results duplicates (see above)
PF4B    Freeze the split: analysis_pass_results = append-only execution
        receipts. Add analysis_pass_current = one eligible row per
        PassIdentity (build as a VIEW first, not a new physical table —
        cheap, reversible, provable before committing to a table).
PF4C    Prove pass_key semantics BEFORE freezing any uniqueness key.
        pass_key already combines packet_key+pass_type+input_hash+
        prompt_hash+model_name+temperature+max_tokens — check git history /
        original callers for whether it was DESIGNED as the full
        producer-config identity. If so, canonical key may be
        (packet_key, source_revision, pass_key, input_hash) instead of
        introducing a redundant (pass_type, pass_revision) pair.
PF4D    Dependency DAG for passes:
          type PassDependency = { passId: string; requires: string[];
            invalidatesOn: string[] }
        e.g. semantic_768 requires ast_symbols + lexical; event_projection
        requires SemanticCodeCard. Without this, job-level concurrency is
        safe but pass-level semantic validity is not proven.
PF4E    Invalidation propagation engine. Distinct from job cancellation —
        when source_revision changes, explicitly cascade staleness:
        source → AST stale → semantic card stale → semantic_768 stale →
        event projections stale → feature rows stale → recommendation stale.
        Build as an explicit dependency-driven engine, not scattered
        ad-hoc staleness checks.
PF4F    Result eligibility gate:
          type ResultEligibility = { revisionCompatible: boolean;
            dependenciesSatisfied: boolean; producerAllowed: boolean;
            schemaValid: boolean; stale: boolean }
        This is the actual gate between raw pass_results rows and the
        analysis_pass_current materialization from PF4B.
PF4G    Deterministic join / materialization stage. Worker completion order
        must NOT affect the joined MaterializedPacketFeatureSet result —
        prove this with a replay test (see PF-G8 below).
PF4H    Feature availability masks — missing PageRank ≠ PageRank=0, missing
        semantic ≠ similarity=0. Every downstream ranker consumes an
        explicit availability bit, never an implicit zero.
─────────────────────────────────────────────────────────────────────
PF-G0   NOW (after PF4A-H, per latest priority call): prove/rebuild the
        canonical atlas_packets writer. Source → deterministic
        PacketIdentity → INSERT/UPSERT atlas_packets(packet_key,
        source_revision, representation_revision). Check
        deeds_labs/archive/ for a prior identity-worker.ts before
        rebuilding from scratch (Archival Rules — nothing is deleted here,
        only archived).
─────────────────────────────────────────────────────────────────────
PF5     okf-resolved AtlasPassDefinition registry (owner, truthClass,
        executionClass, orderingScope, requires[]) — generalizes the
        CPU_LOCAL/NLP_HTTP/GPU_BATCH/LLM_SERIAL_BOUNDED resource-class idea
        from PF6/7 into a schema-backed registry. Build the registry AFTER
        the concrete 4-class version (PF6/7) proves out, not before.
PF6     CPU worker pool (clamp(availableParallelism(), 2, 6))
PF7     Move structural/lexical/entropy passes onto the worker pool
PF8     Compiler expansion (ast-grep write-path, lexical schema, entity
        truth-class split, remaining extractors) — this is the original
        "Layer 2 compiler output expansion" work, now correctly sequenced
        AFTER identity + ledger + invalidation are proven, not before.
```

## Core contracts to implement (TypeScript, exact shapes)

```typescript
// Logical identity vs. a single attempt to compute it — this split is the
// single most important correction from the whole audit.
type PassIdentity = {
  packetKey: string;
  sourceRevision: string;
  passType: string;      // or passKey, pending PF4C
  passRevision: string;
  inputHash: string;
};

type PassExecution = {
  executionId: string;
  identity: PassIdentity;
  attempt: number;
  backend?: string;
  backendVersion?: string;
  modelName?: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failed';
};

type PassDependency = {
  passId: string;
  requires: string[];       // upstream pass IDs this pass needs
  invalidatesOn: string[];  // events that stale this pass's results
};

type ResultEligibility = {
  revisionCompatible: boolean;
  dependenciesSatisfied: boolean;
  producerAllowed: boolean;
  schemaValid: boolean;
  stale: boolean;
};
```

## Validation gates (add to existing G1-G7 in SPEC.md)

- **G8 — deterministic replay**: same `source_revision` processed twice
  (regardless of which worker finishes first) → same packet IDs, same
  event set, same feature inputs, same baseline ranking. This is the gate
  that actually proves PF4G + idempotency work together, not just that
  they don't crash.

## Explicitly out of scope for THIS session (do not pull in)

- Layer 3 (SOM/PageRank/graph metrics), Layer 4 (OKF/Firecrawl/TorchInductor/
  ACE LOD/HMM/GPU export/research lane/multivector retrieval), Layer 5-9
  (feature convergence, recommendation approximation, Kanban integration,
  replay corpora, operational correctness at the Redis-batching/backpressure
  level) — all real, all captured, but belong to separate OpenSpec changes.
  Full raw content preserved at:
  `C:\Users\james\.claude\projects\C--Users-james-Videos-deeds-web-app\memory\SESSION-198-EXPANDED-PROOF-LADDER-RAW.md`
  Triage these into `parent-atlas-graph-retrieval-proof`,
  `parent-atlas-graph-analysis-contract`, or
  `parent-atlas-nlp-sidecar-feature-compiler` (check for overlap first) —
  or a new `parent-atlas-provenance-ladder` change if none fit. Do NOT build
  any of this in the current session unless explicitly asked.

## POS-tagger / ontology / n-ary concept retrieval stack (separate future work)

The user has also asked for: a POS tagger feeding ontology-linked n-ary
concept tuples, sourced from manifold-topology coordinates, joined with
KNN-AST semantic concepts, ranked via a policy blending summaries +
source_ref + screenshots + citations + PageRank + BM42/BM25, with MCP tool
calls used correctly throughout. **This is a Layer 2/3/4 capability, not a
Pass Fabric mechanics item — it depends on PF4A-H (ledger) and PF-G0
(identity) being proven first**, since without those, "ontology-linked
tuple" outputs have no verifiable packet/revision lineage to attach to.
Do not build this until PF4/PF-G0 land — track it as a follow-up phase in
whichever spec ends up owning Layer 2/3 (see "out of scope" above). If asked
to scope it now, produce a design doc only, not code — the POS/ontology/BM25
work needs `AnalysisPassResult` persistence + canonical packet identity as
load-bearing prerequisites, and building it first would repeat the same
"attach good data to unproven identity" mistake this whole audit exists to
prevent.

## First concrete action

Start at PF4B. Write the `analysis_pass_current` VIEW (not a table — cheap,
reversible) selecting one eligible row per `PassIdentity` from
`analysis_pass_results`, using whatever tie-break rule you decide for the
1,225 multi-output summarization groups (likely `MAX(created_at)` = most
recent, but confirm this is the right semantic before committing — "most
recent" and "canonical" are not automatically the same thing for
non-deterministic outputs). Report the view definition + a sample query
result before proceeding to PF4C.
