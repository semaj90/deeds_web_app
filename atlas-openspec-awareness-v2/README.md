# Parent Atlas OpenSpec Awareness Board V2

V2 turns the read-only OpenSpec execution-controller board into an **awareness/control-plane projection** for code topology, runtime readiness, agent protocols, human feedback, and challenger recommendations.

It does **not** change the authority model:

```text
OpenSpec task + admitted completion envelope
        -> execution controller
        -> ACTIONABLE / WAITING / DEFERRED / PROVEN
        -> deterministic ranker among ACTIONABLE only
        -> advisory topology / cluster / cache / learned signals
        -> agent execution
        -> proof receipt
        -> controller reconciliation
        -> promotion only after live authority/readback gates pass
```

## Added in V2

### Directory / file / Graphify awareness

- `scripts/atlas/lib/repo-walk.mjs`
- `scripts/atlas/lib/import-graph.mjs`
- `scripts/atlas/lib/graphify-evidence.mjs`
- `scripts/atlas/lib/taxonomy.mjs`
- `scripts/atlas/audit-openspec-directory-graph-v1.mjs`
- `scripts/atlas/cluster-openspec-file-graph-v1.py`

The directory audit produces:

- repository file inventory;
- lexical import edges;
- cross-directory relation edges;
- explicit Graphify relation edges when a Graphify artifact contains file-qualified `from/to` fields;
- explicit `tree_node`/`treeNodeId`/`node_id` observations mapped to repository files;
- deterministic topic/domain taxonomy labels;
- structural file features for KMeans.

Graphify artifacts are size-capped by `ATLAS_GRAPHIFY_MAX_BYTES` (default 256 MiB). Oversized artifacts are reported as skipped rather than blindly parsed.

**Important:** lexical imports, Graphify observations, and KMeans clusters are navigation/routing evidence. They do not establish canonical ownership.

### Deterministic taxonomy + KMeans challenger

Baseline topics now include:

1. Identity & lineage
2. Chunk / AST / symbol
3. Semantic / ANN
4. Graph & topology
5. Clustering & taxonomy
6. Fusion / context / prefill
7. Residency & cache
8. Agent protocols
9. Human feedback / learning
10. Agent workflow & repair
11. Governance & promotion
12. Admin UI / SSR
13. PostgreSQL / data plane

The Python KMeans helper uses structural features (`file size`, import in/out degree, path depth, observed tree-node/Graphify/OpenSpec markers, topic one-hot). It is deterministic by seed and explicitly emits `authority: CHALLENGER_NAVIGATION_ONLY`.

### Runtime readiness audit

`scripts/atlas/audit-atlas-runtime-readiness-v1.mjs` emits explicit gates for:

- canonical lineage readiness;
- Qdrant collection/vector/payload schema proof;
- Qdrant lineage-tag readback proof;
- ANN-03 live Qdrant/cuVS parity;
- Redis/Valkey centroid-cache proof;
- BitFrost bucket-warming proof;
- ACE packet readiness;
- ContextManifest contract;
- prefill/synthesis readiness;
- ACP runtime proof;
- A2A runtime proof;
- human-decision receipt readiness;
- PyTorch/learning-lane evaluation proof;
- directory graph audit presence.

A filename is not proof. Qualifying reports must contain the expected content. For example, Qdrant lineage-tag proof requires observed payload/readback evidence for packet, symbol-version, workspace/source revision, and representation identity fields.

States:

- `PROVEN`: qualifying current evidence exists.
- `READY`: prerequisites are complete but the final proof has not run.
- `PARTIAL`: contract/config/fixture evidence exists but live proof is missing.
- `WAITING`: a named upstream authority/dependency prevents proof.
- `UNPROVEN`: no sufficient evidence.

### ACE packet / prefill helpers

- `scripts/atlas/build-ace-packet-draft-v1.mjs`
- `src/lib/server/atlas/openspec-board/ace-prefill-readiness.ts`

Draft creation requires:

- request ID;
- packet key;
- workspace/source/graph/feature revisions;
- canonical IDs;
- evidence refs;
- resource budget;
- matching ContextManifest request identity when provided.

Output state is only `READY_FOR_PROOF`. It does not authorize cache mutation, prefill, synthesis, or promotion.

### ACP / A2A

The current Atlas runtime already has explicit protocol names/adapters. V2 preserves the important distinction:

```text
protocol configured in contract != runtime protocol compliance
```

`ACP_ADAPTER_PROVEN` and `A2A_ADAPTER_PROVEN` remain `PARTIAL` until a health/capability success receipt exists.

### Human-in-the-loop + PyTorch shadow learning

- `src/lib/server/atlas/openspec-board/human-feedback.ts`
- `scripts/atlas/build-human-agent-feedback-dataset-v1.mjs`
- `scripts/atlas/prepare-human-feedback-tensors-v1.py`
- `scripts/atlas/train-shadow-preference-head-v1.py`

Human decisions are revision/evidence-qualified receipts. The dataset export rejects rows without stable task identity, evidence hash, and recognized decision.

The PyTorch helper creates deterministic hashed tensors and can train a small preference head only after >=20 examples. The output is always:

```text
authority = SHADOW_ONLY
promotionAuthorized = false
```

It is not an RL policy and cannot change task execution state. A future RL/GRPO/PPO lane should consume the same receipt dataset and produce separate training/evaluation/promotion receipts.

### Challenger tournament

`scripts/atlas/build-openspec-challenger-tournament-v1.mjs` compares deterministic next-action ranking with the low-rank challenger. Rank deltas are displayed, but every row has `eligibleForAuthority: false`.

This provides the requested tournament view without allowing a recommender to reorder the hard promotion spine.

### SSR / SvelteKit / Bits UI board

V2 adds:

- `src/lib/server/atlas/openspec-board/awareness.ts`
- `src/lib/components/atlas/OpenSpecAwarenessPanel.svelte`
- updated `/atlas/studio/openspec/+page.server.ts`
- updated `/atlas/studio/openspec/+page.svelte`
- expanded report fingerprinting in `report-reader.ts`

The page remains SSR-first:

```text
server-only report reads
  -> SSR snapshot
  -> report fingerprint SSE
  -> invalidate('atlas:openspec-board')
  -> fresh server load
```

The new Bits UI v2 panel has views for:

- runtime readiness;
- DAG/directory links;
- file clusters;
- ACP/A2A/HITL/learning;
- ranker challenger tournament;
- OpenSpec progression.

The browser still does not read `docs/reports` directly and does not mutate OpenSpec or runtime state.

## PostgreSQL 18 / Drizzle ORM

The V1 optional `atlas_openspec_board_snapshots` schema remains valid as a **historical read-model**. V2 does not make PostgreSQL current authority for OpenSpec state.

Recommended later history tables, if wanted:

- board snapshots by semantic checksum;
- readiness-gate snapshots;
- human-decision receipts;
- challenger-evaluation receipts.

Do not store current task authority independently from the controller; that would create dual ownership.

## One-command awareness audit

After the existing execution-controller/blocker reports are current:

```bash
npm run atlas:docs:awareness
```

Equivalent pipeline:

```bash
node scripts/atlas/audit-openspec-directory-graph-v1.mjs . docs/reports/openspec-directory-graph-v1.json
python scripts/atlas/cluster-openspec-file-graph-v1.py docs/reports/openspec-directory-graph-v1.json docs/reports/openspec-file-kmeans-v1.json 12 1337
node scripts/atlas/audit-atlas-runtime-readiness-v1.mjs . docs/reports docs/reports/atlas-runtime-readiness-v1.json
node scripts/atlas/build-openspec-challenger-tournament-v1.mjs docs/reports docs/reports/openspec-challenger-tournament-v1.json
node scripts/atlas/audit-openspec-progress-v2.mjs docs/reports docs/reports/openspec-progress-audit-v2.json
```

Before it, keep running the existing authority reports:

```bash
npm run atlas:docs:execution-controller
npm run atlas:docs:blocker-audit
```

## OpenSpec progression

```text
1   tasks.md census
2   implementation-order report
3   CompletionEnvelope + ExecutionController
4   blocker ownership / retry suppression
5   fixture and read-only proofs (e.g. ANN-03 fixture)
6   directory/file relation graph + Graphify observations
7   deterministic taxonomy + structural KMeans challenger
8   runtime readiness audit (Qdrant/Valkey/BitFrost/ACE/prefill/protocols)
9   ACTIONABLE-only deterministic ranker
10  low-rank / learned challenger tournament
11  SSR Parent Atlas OpenSpec board                 <-- V2 projection
12  concurrency-wave dispatch + warm plan
13  ACP/A2A/internal agent execution
14  human approval where required
15  proof/readback receipts
16  controller reconciliation
17  live authority + candidate freeze + ANN parity
18  promotion
```

## Current integration size

On the connected GitHub `main` branch at audit time:

- `src/lib/server/atlas`: 33 files;
- `src/lib/server/db`: 32 files;
- Atlas routes already include `/atlas`, `/atlas/runs`, and `/atlas/studio` surfaces;
- targeted Parent Atlas/retrieval searches surfaced at least 110 unique related files (a lower bound, and biased by older Qdrant/docs content).

The board itself should touch only a small direct surface (~15–25 files including scripts/helpers/tests), not the entire retrieval neighborhood.

The connected `main` branch is older than the current workstation OpenSpec/controller state, so merge these files into the local checkout and validate there rather than treating GitHub `main` as current authority.

## Validation included

`tests/test-awareness-v2.mjs` currently verifies:

- lexical file import mapping;
- Graphify artifact + tree-node extraction;
- deterministic structural KMeans;
- Qdrant lineage-tag content validation;
- ACP configured-but-unproven => `PARTIAL`;
- missing BitFrost proof => `UNPROVEN`;
- deterministic vs low-rank tournament ordering without authority;
- progress aggregation;
- human-feedback dataset acceptance/rejection.

Run:

```bash
node tests/test-awareness-v2.mjs
```

Expected: `awareness-v2: 12/12 PASS`.

## Repository skill

Install/copy:

`skills/parent-atlas-openspec-progress/SKILL.md`

It gives Claude/Codex/agents a single fail-closed audit workflow and prevents directory graphs, KMeans, cache warmth, or learned scores from being mistaken for execution authority.
