# Parent-Atlas + Atlas-Core Integration Guide

**Date**: June 26, 2026  
**Status**: Ready for integration  
**Scope**: Wire canonical packet identity into semantic indexing CLI

---

## Overview

`packages/parent-atlas` is the CLI utility for codebase semantic indexing and search integrations.

`packages/atlas-core` provides the canonical packet identity contract that all systems must use.

This guide shows how to integrate them.

## Canonical-first implementation order

For Parent Atlas work, `scripts/atlas/` is the canonical repository-level implementation and rehearsal surface. Implement and validate behavior there first, including source-qualified receipts and safe database boundaries. Only after that succeeds should the reusable `packages/parent-atlas` TypeScript API be updated as a typed mirror or shared package implementation. Keep behavioral parity tests in both locations; package compilation alone does not prove the canonical CLI path, and canonical script tests alone do not prove the package API.

The semantic recommendation helpers follow this boundary:

- Canonical implementations: `scripts/atlas/lib/grounded-recommendation-v1.mjs` and `scripts/atlas/lib/semantic-search-hits-v1.mjs`.
- Typed package mirrors: `src/core/grounded-recommendation-v1.ts` and `src/core/semantic-search-hits-v1.ts`.
- Canonical-first check: `node --test scripts/atlas/lib/grounded-recommendation-v1.test.mjs scripts/atlas/lib/semantic-search-hits-v1.test.mjs`.
- Package mirror check from the repository root: `node sveltekit-frontend/node_modules/typescript/bin/tsc -p packages/parent-atlas/tsconfig.json` followed by `node sveltekit-frontend/node_modules/vitest/vitest.mjs run --root . --config .tmp/atlas/vitest-parent-atlas-grounded.config.mjs`.

Neither helper grants canonical authority: semantic hits must keep stable source identity separate from Qdrant point IDs, and recommendations must use identity- and revision-bound evidence. Database corpus audits stay read-only unless a separately reviewed migration and explicit write admission exist.

### OpenSpec to Kanban closeout boundary (2026-11-08)

Keep the execution rehearsal in the monorepo `scripts/atlas/` surface and validate the main-repository caller before changing this package. The SvelteKit prefill writer now binds source and cohort revisions, verifies the full payload digest before commit, and repeats readback from a fresh connection after commit. Its current focused suite is mock-only (15/15); it is not scratch database proof. The writer rejects any database except PostgreSQL 18 `legal_ai_live_integration_scratch` on loopback port 5434.

The previous scratch outcome receipt is a simulated `NO_RESULT`; it does not establish a Kanban claim, task attempt, verification success, or completion. The scratch inventory has 2,479 `nextsteps:` task rows but no exact prefill task-ID matches, validation commands, or dependency rows. Keep R3 execution proof open until a source-qualified task binding is found and the existing `claimKanbanTask()` / `completeKanbanTask()` path records independent attempt and test receipts with fresh database readback. Do not add a second package-level claim or receipt owner.

The canonical claim owner now supports an expected source-revision fence, and `scripts/atlas/execute-kanban-task-bridge-v1.mjs` labels dry-run candidates `ELIGIBLE_UNCLAIMED`. It reports a real claim only after the board owner returns a claim token and a fresh task readback verifies the active run and revision. A PostgreSQL 18.4 scratch run on the previously observed 16-task nextsteps cohort found 5 bounded DAG-ready candidates, but all 5 lacked a matching prefill source/cohort revision and a runnable validation command; no writes occurred. Claim and completion proof remain open until a source-qualified task binding and reviewed verification command exist. The latest gate receipt and exact test commands are recorded in the monorepo OpenSpec ledger.

The monorepo identity crosswalk now compares frozen source artifacts directly: all 6,527 OpenSpec IDs and 3,105 nextsteps IDs are unique, with 0 exact matches and 0 shared hash suffixes. Treat them as separate identity cohorts; do not create aliases from task text, line numbers, or matching suffixes. The canonical read-only audit and its report are in `scripts/atlas/audit-nextsteps-openspec-cohort-identity-v1.mjs` and `docs/reports/nextsteps-openspec-prefill-identity-crosswalk-v1.json`.

Current R4 qualification is blocked. Live `legal_ai_db` has 274,428 populated 768-D vectors and 64 existing 768-D coarse centroids. A bounded exact-lineage diagnostic found 2,178 vector chunks among 500 historical workspace bindings, including 2,156 with proven packet revision/checksum bindings, but zero had both model and representation revisions on the vector rows. The source-authority receipt for that workspace is stale. A fresh source-owner reconciliation also found a dirty worktree (30,618 sources versus 30,327 in the admitted snapshot), 833 changed shared files, 1,383 current-only files, 1,092 snapshot-only files, and no exact current execution owner. Do not train or assign a canonical 64×64 residual codebook from this unqualified corpus. The bounded lineage and source-owner receipts and next gate are maintained in the monorepo OpenSpec task ledger.

Follow-up read-only source reconciliation on 2026-11-08 captured a new workspace snapshot (`sha256:0878085ba4eda395b961fe869da7b568882c204a1d1075966a2727c3d50274c5`, 31,665 sources across 7 repositories), independently verified exact byte readback for 31,665/31,665 files, and passed canonical-source inventory hygiene (31,444 selected sources; no known-junk recurrence). The source-selection report is `SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED` with `authority:false` and no writes. This does not resolve the older vector cohort's stale authority or establish a workspace revision/execution owner. Projection and canonical writes remain gated on `WORKSPACE-REVISION-TOURNAMENT-SOURCE-AUTHORITY-01`; details and receipts are recorded in the monorepo OpenSpec task ledger.

---

## What Changed

### 1. Parent-Atlas Dependency

**File**: `packages/parent-atlas/package.json`

```json
{
  "dependencies": {
    "@deeds/atlas-core": "workspace:*",
    "ioredis": "^5.3.2",
    "pg": "^8.11.3"
  }
}
```

### 2. Canonical Packet Bridge

**File**: `packages/parent-atlas/src/core/canonical-packet-bridge.ts` (NEW)

Bridges atlas-core types into parent-atlas validators and adapters.

**Exports**:
- `extractPacketIdentityFromRow()` — Safe extraction from Postgres row
- `validatePacketIdentityFromRow()` — Soft validation (for logging)
- `verifyPacketIdentityConsistency()` — Hard validation (triple match check)
- `createEnvelopeFromRow()` — Create AtlasMemoryEnvelope for audit trail
- Re-exports all canonical types from atlas-core (types + functions)

---

## Integration Pattern

### In Validators (packet-validator-materializer.ts, etc.)

**Before**:
```typescript
// Defined locally
export interface AtlasPacketRegistry {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  ...
}

// Manual validation
function validatePacket(row: any): string[] {
  const errors: string[] = [];
  if (!row.packet_key) errors.push('missing packet_key');
  if (!row.source_ref) errors.push('missing source_ref');
  // ... etc
  return errors;
}
```

**After**:
```typescript
import { extractPacketIdentityFromRow, validatePacketIdentityFromRow } from './canonical-packet-bridge.js';

// Use canonical type (via bridge)
const identity = extractPacketIdentityFromRow(row); // Hard fail on invalid
const errors = validatePacketIdentityFromRow(row);  // Soft check for logging

// Use canonical validation
if (errors.length > 0) {
  console.warn(`Packet validation failed: ${errors.join('; ')}`);
}
```

### In Adapters (qdrant.ts, neo4j.ts, valkey.ts)

**Before**:
```typescript
// Inconsistent identity handling
await qdrant.upsert({
  id: row.qdrant_point_id,
  payload: {
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    feature_id: row.feature_id,
  },
  // ... other fields
});
```

**After**:
```typescript
import { createEnvelopeFromRow, verifyPacketTriple } from './canonical-packet-bridge.js';
import { bitfrostKey } from '@deeds/atlas-core/types';

// Create envelope with canonical identity
const envelope = createEnvelopeFromRow(row, traceId, 'packet');

// Verify consistency before writing
const { consistent, mismatches } = verifyPacketIdentityConsistency(
  identity,
  row
);
if (!consistent) {
  throw new Error(`Packet consistency violation: ${mismatches.join('; ')}`);
}

// Write to mirrors with canonical shape
await qdrant.upsert({
  id: row.qdrant_point_id,
  payload: {
    packet_key: envelope.packet_key,
    source_ref: envelope.source_ref,
    feature_id: envelope.feature_id,
    trace_id: envelope.trace_id,
  },
});

// Cache keys follow canonical pattern
const packetKey = bitfrostKey('packet', envelope.packet_key);
const glyphKey = bitfrostKey('glyph', envelope.glyph_id);
// ...
```

### In Gates (identity.ts, lineage.ts, final.ts)

**Before**:
```typescript
// Manual gate checks
function runIdentityGate(): GateReport {
  // Hardcoded packet field checks
  const packetKeyCount = await pg.query('SELECT COUNT(DISTINCT packet_key) FROM atlas_packets');
  const sourceRefCount = await pg.query('SELECT COUNT(DISTINCT source_ref) FROM atlas_packets');
  // ...
}
```

**After**:
```typescript
import { extractPacketIdentityFromRow } from './canonical-packet-bridge.js';

function runIdentityGate(): GateReport {
  // Use canonical validator
  const rows = await pg.query('SELECT * FROM atlas_packets LIMIT 100');
  
  const validPackets = [];
  const invalidPackets = [];
  
  for (const row of rows) {
    const errors = validatePacketIdentityFromRow(row);
    if (errors.length === 0) {
      validPackets.push(row);
    } else {
      invalidPackets.push({ row, errors });
    }
  }
  
  return {
    passed: invalidPackets.length === 0,
    metrics: {
      valid: validPackets.length,
      invalid: invalidPackets.length,
    },
    details: invalidPackets,
  };
}
```

### In Pipelines (ingest.ts, enrich-karpathy.ts, etc.)

**Before**:
```typescript
// Duplicate validation scattered across pipeline
async function runIngest(): Promise<void> {
  const packets = await fetchPackets();
  
  for (const packet of packets) {
    // Local validation
    if (!packet.packet_key || !packet.source_ref) {
      console.warn('Skipping packet with missing identity');
      continue;
    }
    
    // ... process packet
  }
}
```

**After**:
```typescript
import { extractPacketIdentityFromRow, createEnvelopeFromRow } from './canonical-packet-bridge.js';

async function runIngest(): Promise<void> {
  const packets = await fetchPackets();
  
  for (const packet of packets) {
    // Use canonical extraction
    try {
      const identity = extractPacketIdentityFromRow(packet);
      
      // Create envelope for audit trail
      const envelope = createEnvelopeFromRow(packet, traceId);
      
      // Process with full audit context
      await processPacket(envelope);
    } catch (err) {
      console.error(`Failed to ingest packet: ${err.message}`);
    }
  }
}
```

---

## File-by-File Checklist

**Priority** (use canonical identity first):

1. **core/packet-validator-materializer.ts**
   - [ ] Replace `AtlasPacketRegistry` interface with `PacketIdentity`
   - [ ] Update `validatePacket()` to use canonical validator
   - [ ] Add envelope creation for telemetry

2. **adapters/qdrant.ts**
   - [ ] Use `bitfrostKey()` for consistent cache key naming
   - [ ] Write envelope-shaped payloads
   - [ ] Verify triple consistency before upsert

3. **adapters/valkey.ts**
   - [ ] Use `bitfrostKey()` pattern for all cache keys
   - [ ] Store envelope trace_id on every write
   - [ ] Add validation before cache write

4. **adapters/neo4j.ts**
   - [ ] Use canonical identity for node properties
   - [ ] Verify triple consistency before relationship creation
   - [ ] Include trace_id in node metadata

5. **adapters/postgres.ts**
   - [ ] Use canonical types for schema queries
   - [ ] Include envelope in audit log writes

6. **gates/identity.ts**
   - [ ] Use canonical validator for all checks
   - [ ] Report on validation error categories

7. **gates/lineage.ts**
   - [ ] Use envelope trace_id for lineage tracking
   - [ ] Verify triple consistency across hops

8. **gates/final.ts**
   - [ ] Use canonical validator as final sanity check
   - [ ] Report envelope envelope distribution

9. **pipelines/ingest.ts**
   - [ ] Extract canonical identity from source
   - [ ] Create envelope for audit trail
   - [ ] Verify before writing to Postgres

10. **pipelines/enrich-karpathy.ts**
    - [ ] Use canonical identity for GPU work
    - [ ] Create reward envelope
    - [ ] Write grpo_reward_score to Postgres

---

## No Breaking Changes

The bridge is **additive only**:
- Existing code continues to work
- New code uses canonical types
- Gradual migration (one file at a time)
- Each gateway/pipeline can migrate independently

---

## Build & Test

```bash
# Build parent-atlas
cd packages/parent-atlas
npm run build

# Run existing CLI commands (unchanged API)
npm run gate:identity
npm run gate:lineage
npm run ingest

# Check TypeScript (should pass with zero new errors)
npm run build -- --noEmit
```

---

## Integration Timeline

### Phase 1 (Session 83)
- [ ] Wire atlas-core dependency into parent-atlas package.json ✅
- [ ] Create canonical-packet-bridge.ts ✅
- [ ] Update core/packet-validator-materializer.ts
- [ ] Test: `npm run gate:identity` passes with canonical validator

### Phase 2 (Session 84)
- [ ] Update all adapters (qdrant, valkey, neo4j, postgres)
- [ ] Test: `npm run enrich:karpathy` writes canonical envelopes

### Phase 3 (Session 85)
- [ ] Update all gates (identity, lineage, final)
- [ ] Update all pipelines (ingest, enrich, cache, mapreduce)
- [ ] Full integration test: `npm run gate:production` passes

---

## Key Principles

1. ✅ **Canonical Identity Only** — No more local `packet_key`, `source_ref`, `feature_id` duplication
2. ✅ **Envelope Everywhere** — Every operation creates/carries envelope for audit trail
3. ✅ **Verify Triple** — Always check packet_key + source_ref + feature_id consistency
4. ✅ **Cache Key Pattern** — Use `bitfrostKey(kind, id)` for all Redis keys
5. ✅ **Trace ID** — Include trace_id on every envelope/write
6. ✅ **Hard Fail on Invalid** — Missing identity fields throw error, not silent skip

---

## Reference

**Canonical Types** (from `packages/atlas-core`):
- `PacketIdentity` — Core identity type
- `PacketKey`, `SourceRef`, `FeatureId` — Branded types
- `AtlasMemoryEnvelope` — Unified carrier
- `GlyphRecord` — Postgres schema for derived memory

**Bridge Functions** (from `canonical-packet-bridge.ts`):
- `extractPacketIdentityFromRow()` — Hard extract from row
- `validatePacketIdentityFromRow()` — Soft validation (for logging)
- `verifyPacketIdentityConsistency()` — Triple verification
- `createEnvelopeFromRow()` — Create audit envelope
- `bitfrostKey()` — Consistent cache key naming
- `verifyPacketTriple()` — Verify triple match

---

**Status**: Ready for implementation.  
**Next Step**: Migrate core/packet-validator-materializer.ts to use canonical identity.

### Current OpenSpec source integrity gate

The canonical monorepo audit `scripts/atlas/audit-cohort-6527-current-source-v1.mjs` currently fails closed: 6,524 of 6,527 pinned source blocks still match, while two NLUT task blocks changed after the snapshot and one SPZ task locator points to a test-result bullet. See `docs/reports/openspec-cohort-6527-current-source-audit-v1.json`. No package-level implementation mirror or database ingest is eligible until the canonical task snapshot is regenerated and all source bindings validate.

The source audit now recovers the SPZ task's exact recorded block hash at the unique current location `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md#L406` (the pinned locator was `#L404`). It still finds two changed NLUT blocks with no old-hash match. Overall status remains fail-closed pending a refreshed source-qualified NLUT binding.

Correction: the two NLUT source-hash differences are checkbox-state transitions only; current wording and stable task keys match the pinned fuse text. The canonical source audit now emits a separately revisioned binding artifact and independently verifies 6,527/6,527 unique keys/source hashes. It records NLUT-06 `[x]`, NLUT-07 `[~]`, and the exact SPZ locator recovery from line 404 to 406. See `docs/reports/openspec-cohort-6527-current-source-bindings-v1.json` and `.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl` (revision `sha256:de32847bda8bee924335d1354da03e2361267abc0cdef31fefc115dcd1265f84`). This source binding does not authorize task completion or database writes; the older pinned status snapshot is still stale.

Current source binding refresh (2026-11-09): the two NLUT block-hash differences are checkbox-state updates only, not task-text changes. The canonical script produced a separate current binding artifact with unique readback for all 6,527 IDs and exact source block hashes; it records 2 state updates and one exact SPZ locator recovery. Details and revision are in `docs/reports/openspec-cohort-6527-current-source-bindings-v1.json`. This does not authorize task completion or database writes, and does not replace the pinned rank/fuse cohort or its stale state snapshot.

### Current 6,527 source-to-scratch reconciliation (2026-11-09)

The canonical monorepo ran a read-only reconciliation against PostgreSQL 18 `legal_ai_live_integration_scratch` on client port 5434. It found 6,527 unique current source bindings, 0 matching `kanban_tasks` IDs, and 6,527 matching rows in `atlas_kanban_dag_prefill_v1`; all prefill rows have 0 matching source/cohort revisions or source hashes. The scratch task board has 2,479 `nextsteps:` rows and 0 `openspec:` rows. No dependency links or verified completions were found for the OpenSpec cohort. Durable report: `docs/reports/openspec-cohort-6527-scratch-reconciliation-v1.json`; writes were not performed. These prefill rows are stale projections, not execution-ready task mappings.

The canonical OpenSpec workboard builder also exposes 154 `[~]` tasks as OPEN with `sourceCheckboxState=IN_PROGRESS`. The population script now excludes these from creating fresh `todo` tickets while retaining them in source accounting. Its syntax check and generated-workboard eligibility check passed. The database population dry run stalled before producing output and was stopped; its result is NOT_RUN/UNVERIFIED.

The monorepo's unmatched-root audit subsequently verified all 268 remaining crosswalk records against current tracked source blocks and exact block hashes: 145 agentic-completion tasks under `openspec/specs`, 47 QAS bundle tasks, 38 RTX GPU lab tasks, 11 tensor-residency tasks, and 27 graph-runtime tasks. The standard workboard omits these roots, and no exact block-hash candidates were found elsewhere in its 15,004 rows. This is source integrity evidence only; it does not create Kanban mappings or task aliases. See canonical script `scripts/atlas/audit-cohort-6527-unmatched-roots-v1.mjs` and report `docs/reports/openspec-cohort-6527-unmatched-root-audit-v1.json`. Continue implementation in the monorepo first; package code remains a mirror after canonical task mapping is resolved.

### OpenSpec population dry run (2026-11-09)

The canonical script `scripts/atlas/populate-kanban-from-openspec-workboard-v1.mjs` excludes the 154 `[~]` / `sourceCheckboxState=IN_PROGRESS` source tasks from new `todo` creation and reuses one source-file hash/parse cache for batch validation. After rebuilding the workboard against current source hashes, its guarded scratch dry run completed: 4,581 eligible, 154 in-progress excluded, 0 existing IDs, 4,581 planned, 0 duplicate IDs, and 4,581 source bindings validated. It performed no writes. See `docs/reports/openspec-kanban-population-dry-run-v1.json`.

This is only a dry-run plan. Do not apply it until it is reconciled with the pinned 6,527 cohort and revision-bound prefill: the read-only scratch audit found 0 Kanban task-ID matches and 0 of 6,527 prefill rows with current source/cohort revisions or source hashes.

### 6,527 cohort to main workboard crosswalk (2026-11-09)

The canonical script `scripts/atlas/audit-cohort-6527-workboard-crosswalk-v1.mjs` compared current source bindings to a freshly generated main-repo OpenSpec workboard by exact key, source locator, and block hash. It found 5,590 exact key/source/hash matches, 112 exact source-locator/hash candidates with different stable keys, 4 key matches with source/hash drift, and 821 unmatched records. The unmatched records include nested source roots outside the workboard's root OpenSpec scan. No source aliases were invented and no DB writes occurred. Report: `docs/reports/openspec-cohort-6527-workboard-crosswalk-v1.json`.

The 112 locator-bound candidates still need identity-owner review before any task-ID migration; the 4 drifted keys and 821 unmatched records remain unresolved. This report does not change the prior scratch DB finding of 0 OpenSpec `kanban_tasks` rows and does not authorize population.

### Kanban source revision propagation (2026-11-09)

The canonical monorepo Kanban writer now accepts a SHA-256-validated `sourceRevision`, stores it on `kanban_tasks`, and includes it in the `ticket_created` event. The canonical OpenSpec population path passes the source revision returned by the exact workboard source-binding verifier. Focused board tests passed 14/14, including row and event payload checks. No database writes occurred.

The current 6,527 source-to-workboard crosswalk is partial: 5,590 exact key/source/hash matches, 112 exact locator/hash candidates with different workboard stable keys, 4 key matches with source/hash drift, and 821 unmatched tasks from nested OpenSpec roots. See `docs/reports/openspec-cohort-6527-workboard-crosswalk-v1.json`. The scratch board still has 0 OpenSpec tasks; the 4,581-row population dry run is not approved for apply until these identity/source-root gaps are resolved.

### Scratch-only population safety gate (2026-11-09)

The canonical population script now permits only loopback `:5434/legal_ai_live_integration_scratch`, checks the connected database identity and PostgreSQL 18+ before reading, and limits apply to one exact `--task-id` and `--limit=1`. Rollback apply must match a one-task receipt. A negative check rejected `legal_ai_db` before connection. The refreshed full dry run validated 4,581 source bindings, excluded 154 `[~]` tasks, and performed no writes. The Kanban board suite passed 14/14, including source-revision persistence on the task row and `ticket_created` event.

This guard does not resolve the 821 source-root crosswalk misses, 112 ID candidates, or stale prefill revisions. Do not perform the one-task apply until those identity and revision gates admit a specific task.

### Explicit routing bit validation (2026-11-09)

The prefill writer now rejects score-like values in `features[5]`; only exact binary `0` or `1` may set the advisory `routing_active_bit`. A ranking score cannot promote routing status. The focused prefill suite passed 16/16, including readback integrity and scratch target guards. The OpenSpec population apply path also requires exact scratch PG18 and a single explicitly named task. No database writes occurred.

### Current nextsteps proposer and execution-bridge verification (2026-11-09)

The canonical monorepo read-only scratch probe accepted `nextsteps:` and returned `PROPOSED` with 16 ready IDs on PostgreSQL 18 `legal_ai_live_integration_scratch` (:5434), with no writes. The execution-bridge dry run returned one ready candidate but blocked it because no revision-matching prefill row or runnable verification command was present. The durable claim owner was not invoked. The outcome-repository rehearsal record remains a simulated `NO_RESULT`; it verifies idempotent receipt persistence/readback only, not successful execution or completion. Current artifacts: `.tmp/atlas/nextsteps-prefill-readonly-v1.json` and `.tmp/atlas/kanban-task-bridge-20261109T012638Z.json`.

Root monorepo tests passed 22/22, prefill/task-board/outcome-boundary suites 32/32, and MCP tests 44/44. Package recommendation/semantic-hit/outcome-repository suites passed 9/9 after selecting the package as the Vitest root. Keep execution proof open until an exact source-revision-bound task/prefill match and reviewed verification command exist.

### Scratch readiness vs execution readiness (2026-11-09)

The canonical `scripts/atlas/audit-nextsteps-scratch-readiness-v1.mjs` now reports schema presence separately from execution readiness and outcome-receipt integrity. The fresh read-only PG18 scratch audit found 2,479 nextsteps rows, 6,527 prefill rows, 8 outcome receipts, zero exact task/prefill ID matches, zero source/cohort-revision-qualified bindings, and zero validation commands. It therefore reports execution `BLOCKED`. Three existing receipts have `downstream_success=true`, while none of the 8 contain both lease/source binding or verification-command/exit-code proof; outcome integrity is `BLOCKED`. No database writes occurred. Receipt: `.tmp/atlas/nextsteps-scratch-readiness-v1.json`.

### Source-backed nextsteps validation command candidates (2026-11-09)

The canonical `scripts/atlas/audit-nextsteps-validation-command-bindings-v1.mjs` performs a read-only source and Kanban crosswalk for explicit commands in nextsteps tasks. It found 52 open-command rows with exact source-line/document-digest and scratch task-ID/source-revision matches; two are reviewable `npm run check` candidates. Example: `sveltekit-frontend-next-steps-active-2026-06-16-production-blockers#8b2932425e3849d1` binds to `sveltekit-frontend/next_steps/active/2026-06-16-production-blockers.md#L73`, while its stored `validation_command` remains null. No task was claimed. The check was attempted but interrupted before diagnostics at about 5.6 GiB Node memory use and 0.4 GiB system free memory; no result is claimed. No database writes occurred. Receipt: `.tmp/atlas/nextsteps-validation-command-bindings-v1.json`.

The same candidate was retried after memory recovered. Its declared `npm run check` completed with exit code 1 (1 error, 5 warnings), so its `0 errors, 0 warnings` acceptance criterion is not met. The first error is unresolved `duckdb` at `packages/atlas-duckdb/src/database.ts:29`; the five accessibility warnings are in `InvestigativeCanvasStar.svelte`. Output truncation prevented recording every warning location. No task claim, receipt ingest, or database write occurred. Execution summary: `.tmp/atlas/nextsteps-validation-command-bindings-v1/check-execution-receipt.json`.

The workspace-local `duckdb@1.4.4` dependency was then made resolvable without manifest or lockfile edits. A completed check showed 0 errors and 5 accessibility warnings, all in `InvestigativeCanvasStar.svelte`. The component now has keyboard-accessible exhibit cards and a focusable canvas pan control with arrow-key support; focused tests pass 6/6 without Svelte warnings. A final full check was stopped after free memory fell below 0.5 GiB, so the repository-wide 0-warning result remains unverified and the task remains open. No task claim, task receipt, or database write occurred. Detailed attempt history: `.tmp/atlas/nextsteps-validation-command-bindings-v1/check-execution-receipt.json`.

The final read-only source/Kanban audit still found 52 exact matches and two check candidates, with no writes. The full check is still required before the checklist may be marked complete.

The canonical frontend DAG snapshot and recommendation schemas now accept both `openspec:` and `nextsteps:` feature IDs. Their focused specs passed 10/10. This is input validation proof only; PostgreSQL prefill parity, durable claims, and verified outcome receipts remain separate gates.

The MCP outcome receipt URL guard now accepts only loopback port 5434 and `legal_ai_live_integration_scratch`; its source test suite passes 44/44. This is a pre-connection safety check, not database write/readback or task-completion proof.

`build_recommendation` currently uses the canonical `scripts/atlas/lib/grounded-recommendation-v1.mjs` after bounded TRACE hybrid search and packet lookup. The pure builder tests passed 2/2 and the MCP fake-TRACE integration case passed within 44/44. Live retrieval quality and revision parity remain unproven.

**Scratch recheck (2026-11-09):** The canonical root auditor `scripts/atlas/audit-pq4096-readiness-v1.mjs` completed against loopback PostgreSQL 18 `legal_ai_live_integration_scratch` (:5434). It found 0 canonical 768-D vectors, 0 coarse centroid rows and 0 Qdrant centroid rows. The 64×64 / 4,096-leaf design remains `CANDIDATE_NOT_TRAINED`; audit conclusion is `BLOCKED_NO_CANONICAL_768D_VECTORS_IN_SCRATCH`. Read-only transaction; no training, assignment, or writes. Report: `docs/reports/pq4096-readiness-audit-v1.json`. Root OpenSpec ledger remains the canonical detailed record.

**NLUT-07 / CPU-AVX2-01 refresh (2026-11-09):** Root monorepo harness rebuilt from current sources and passed 23/23 native cases; Python↔C++ cross-language parity passed 5/5. Fixed a dangling test-label pointer and replaced hard-coded timing receipts with parsed run output plus source/binary/output hashes. Receipt status is `PASS_STANDALONE_HARNESS`, acceptance remains `PARTIAL`. The global `/arch:AVX2` build does not prove a non-AVX2 baseline, and neither the production Node-API addon dispatch nor exact KNN order/numerical parity has been tested. Detailed canonical evidence remains in the root OpenSpec owner ledgers.

**Kanban integrity contract recheck (2026-11-09):** Root SvelteKit prefill and durable-claim tests passed 30/30 with mocks. The writer checks exact PG18 scratch identity, mapped unique IDs, source/cohort SHA-256 revisions, payload digest readback, and fresh-connection readback; the claim owner accepts the expected source-revision fence. Scratch execution remains blocked: the latest integrity report shows 0 exact nextsteps/prefill ID matches, no runnable validation commands, and no receipts bound to an active lease plus a real verification exit code. The prior `NO_RESULT` scratch receipt was simulated and did not claim/complete a task. No database was accessed in this test run. Canonical detailed status is in the root OpenSpec ledger and `docs/reports/nextsteps-kanban-prefill-integrity-v1.json`.

**Fresh 6,527-task scratch reconciliation (2026-11-09):** In a read-only PG18 transaction on `legal_ai_live_integration_scratch` (:5434), all 6,527 snapshot IDs/keys/ordinals match rows in the prefill table, but none match `kanban_tasks`; the 2,479-row board contains only `nextsteps:` tasks. All prefill rows have NULL source and cohort revision fields, confirmed by bounded samples. No rows were changed. The source/workboard crosswalk has 6,083 exact rows, 172 exact source/hash rows with changed keys, 4 source/hash drifts, and 268 unmatched rows from five omitted source roots. The full task cohort remains unreconciled. See root ledger and `.tmp/atlas/openspec-cohort-6527-scratch-reconciliation-v1.json`.

**Authority-bridge target qualification (2026-11-09):** The older 4,514-task / 4,303-match authority-bridge receipt does not record the actual connected database name, port, or PostgreSQL version, although its script resolves the connection from environment and uses read-only plus rolled-back temporary-table phases. Do not compare those counts as current scratch evidence: the separately verified scratch inventory has 2,479 `nextsteps:` rows and 0 OpenSpec task-ID matches. No live connection or write was made in this audit; the old receipt needs explicit target identity before its counts can support current reconciliation.

**Opt-in full cohort workboard (2026-11-09):** The canonical monorepo workboard builder now has `--include-cohort-source-roots`, including all five tracked source roots and `-`, `*`, and `+` checklist markers. Its isolated 15,287-row projection gives exact source-locator and block-hash matches for all 6,527 source records: 6,286 keys match; 241 exact source/hash rows still have different projected keys. No source rows are unmatched, ambiguous, or same-key-drifted in this projection. This improves source-to-workboard visibility only; scratch still has 0 exact OpenSpec IDs in `kanban_tasks`, and no database rows were written. Canonical implementation and report: `scripts/atlas/build-openspec-workboard-v1.mjs`, `.tmp/atlas/openspec-workboard-cohort-roots-v1.json`, and `docs/reports/openspec-cohort-6527-workboard-crosswalk-cohort-roots-v1.json`. Continue root-first; do not mirror an implementation into this package until the task identity and DB authority gates are resolved.

**Scratch population dry-run refresh (2026-11-09):** After rebuilding the full source-root workboard, the canonical crosswalk still binds all 6,527 cohort rows to current source locators and block hashes: 6,286 projected keys match and 241 require identity reconciliation. The root population tool, using the repository database resolver and exact scratch guard, validated 5,343 eligible task sources, excluded 168 in-progress sources, found 0 existing Kanban IDs, and planned 5,343 creations. It ran in dry-run mode and wrote no tasks or events. This is source validation, not task ownership or completion. Root implementation and report are authoritative; package remains documentation-only until the identity and execution gates pass.

**Key-difference identity review (2026-11-09):** The root cohort crosswalk now separates the 241 exact source/hash matches with different projected keys into 124 unique declared-ID candidates, 10 unique section-qualified declared-ID candidates, and 107 migration title-hash candidates requiring review; no logical-ID collisions were found. These are noncanonical review hints only and do not authorize task-ID replacement, aliases, or database writes. See the root report `docs/reports/openspec-cohort-6527-workboard-crosswalk-cohort-roots-v1.json`.

**Prefill execution gate recheck:** The separate OpenSpec (6,527 IDs) and `nextsteps:` (3,105 IDs) cohorts have no exact ID or shared hash-suffix overlap, so they must not be merged by alias. The saved scratch prefill-integrity report records 2,479 `nextsteps:` Kanban rows but 0 exact prefill matches, 0 validation commands, 0 dependency rows, and 8 outcome receipts with no active lease/source-revision or successful command/exit-code binding. This is a report snapshot, not a fresh database read. The expanded-root source-binding test was rerun and passed 7/7; the 5,343-row population dry run remains no-write source validation, not permission to create tasks. Do not claim work or persist outcome receipts until exact IDs, revision-bound prefill, dependencies, and a reviewed runnable validation are present. The canonical status and reports are recorded in `openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md` and `docs/reports/nextsteps-kanban-prefill-integrity-v1.json`.

**Board-to-local-preflight browser proof (2026-11-09):** The canonical monorepo's focused Chromium test passed from `/cases` → case board → `3D / image preflight` → local synthetic image → geometry edit → GLB download. It verified source hash, polygon count, generated UVs, original image texture (not atlas-baked), image-specific Parent Atlas guidance, 731,292-byte export under 8 MiB, and `NOT_ASSESSED` quality. No case, PostgreSQL, SeaweedFS, or unexpected non-read writes occurred. This does not test the case upload modal or persistence. Root receipt: `.tmp/atlas/board-precase-preflight-2026-11-09.json`; root implementation and task ledger remain authoritative.

**Case-scene PostgreSQL 18 scratch readiness (2026-11-09):** Root-first read-only inventory verified the guarded `legal_ai_live_integration_scratch` target on host port 5434 (PostgreSQL 18.4; server reports container port 5432). Scene persistence is disabled, candidate tables/indexes/triggers are absent, and the scratch `cases` table has zero rows; a synthetic case fixture would require `title`, `status`, and `priority`. The candidate scene DDL passed a transaction-only rehearsal (3 tables, 9 indexes, 3 immutable triggers) and rolled back with no durable writes. This is not a durable scene save/reload or authorization proof. Root scripts and receipt are authoritative: `scripts/atlas/audit-case-scene-scratch-readiness-v1.mjs`, `scripts/atlas/rehearse-case-scene-migration-scratch-v1.mjs`, `.tmp/atlas/case-scene-scratch-readiness-v1.json`, `.tmp/atlas/case-scene-migration-rehearsal-v1.json`. Keep persistence disabled; determine the fixture/API integration route before creating scratch rows.

**Rollback-only scene revision database contract (2026-11-09):** The canonical root PostgreSQL 18 scratch rehearsal now creates a synthetic case and two immutable revisions inside the same transaction as the candidate DDL. It read back both hashes and the parent chain, rejected a stale revision and an UPDATE, then rolled back everything. Result: 3 tables, 9 indexes, 3 triggers; case count 0 before/after; no committed writes. Route/service suites passed 13/13 but are mocked/unit evidence, not live API authorization or durable persistence proof. Root script/receipt: `scripts/atlas/rehearse-case-scene-migration-scratch-v1.mjs`, `.tmp/atlas/case-scene-migration-rehearsal-v1.json`. Keep the persistence feature disabled pending a real authorized API save/reload and storage readback gate.

**Real scene revision route integration on PostgreSQL 18 scratch (2026-11-09):** Root added a guarded runner and conditional Vitest integration spec. The real SvelteKit GET/POST handlers, Drizzle revision service, and database case-owner query passed save → reload/hash readback → stale revision HTTP 409 → second save/parent-chain readback on PG18.4 scratch. The runner temporarily committed only the candidate schema and a synthetic scratch case, then removed both; receipt reports `committedWrites=true` (temporary scratch commits), `candidateSchemaRemoved=true`, `caseFixtureRemoved=true`, `residualArtifacts=false`. The test supplies synthetic authenticated locals; browser login, SeaweedFS asset reads/writes, and production admission remain open. Root files and receipt are authoritative: `scripts/atlas/run-case-scene-route-pg18-scratch-integration-v1.mjs`, `sveltekit-frontend/src/routes/api/cases/[id]/scenes/[sceneId]/revisions/revisions.pg18.integration.spec.ts`, `.tmp/atlas/case-scene-route-pg18-integration-v1.json`.

**SOG route and PostgreSQL registry integration (2026-11-09):** Root extended the guarded runner with a second real-route test. On PG18.4 scratch, both integration specs passed (2/2): the SOG route accepted deterministic bounded multipart bytes, stored and read back the asset/file manifest through PostgreSQL, and streamed a member whose byte length and SHA-256 matched. The object adapter is in-memory, so this does not prove SeaweedFS bucket isolation or durability. Temporary schema and synthetic cases were removed (`candidateSchemaRemoved=true`, `caseFixtureRemoved=true`, `residualArtifacts=false`); `legal_ai_db` was not written. Root ledger and artifacts are authoritative: `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md` §11.34, `scripts/atlas/run-case-scene-route-pg18-scratch-integration-v1.mjs`, `sveltekit-frontend/src/routes/api/cases/[id]/scenes/[sceneId]/assets/sog/sog-pg18.integration.spec.ts`, `.tmp/atlas/case-scene-route-pg18-integration-v1.json`. Browser session authorization, real SeaweedFS readback, calibrated anchors, and production admission remain open.

**Case canvas empty-state and demo-data boundary (2026-11-09):** Root changed `InvestigativeCanvasStar.svelte` to show sample exhibits and the static H-01 hypothesis only under explicit `demoMode=true`. Case views now start empty; missing case metadata is shown as unrecorded/unlinked, and local file previews do not claim verification or case admission. The focused component suite passed 8/8, including empty-state and missing-metadata checks. The full `npm run check` did not complete: it reached roughly 5.5 GiB working memory without diagnostics and was stopped, so type-check status is unverified. This is component evidence, not a fresh authenticated browser run or case persistence proof. See root ledger §11.35; the monorepo implementation is authoritative until package publication is separately reviewed.

**Fresh browser proof for board-to-preflight local editing (2026-11-09):** Root reran `tests/e2e/board-precase-preflight.spec.ts`; Chromium passed 1/1 from `/cases` through the case board preflight link to synthetic image selection, mesh edit, and GLB download. The 1,220-byte PNG hash matched the UI; the relief contained 16,384 vertices, 32,258 triangles, one generated UV channel and the original image (not atlas-baked). Adding a sphere produced 2 meshes / 32,546 triangles. The exported GLB was 731,292 bytes, under 8 MiB, with `NOT_ASSESSED` visual quality. The browser receipt reports zero case/PostgreSQL/SeaweedFS writes, zero unexpected non-read requests, and no page/console errors. This does not test the case upload modal, case admission, scene persistence, or SeaweedFS durability. Root report: `.tmp/atlas/board-precase-preflight-2026-11-09.json`; root ledger §11.36 is authoritative.

**Blender MCP and pre-case animation/export verification (2026-11-09):** Root added `scripts/atlas/verify-blender-mcp-scene-pipeline-v1.mjs` and ran it against the existing stdio Blender MCP. Synthetic OBJ, static FBX, animated FBX, and repository animated GLB imports passed the triangle/8 MiB limits and hash checks; source files remained unchanged. The animated FBX retained its clip and bone through GLB-to-Blender readback; the repository GLB retained five clips and 54 bones. Chromium Mixamo retarget playback passed 1/1 with 52 bones mapped and the rest pose restored on stop. The board-to-preflight browser path passed 1/1 again. The image relief creates UVs and attaches the original image; no atlas baking is claimed. Visual quality is `NOT_ASSESSED`; GPU performance and case upload/admission/persistence remain open. Root receipts: `.tmp/atlas/blender-mcp-scene-pipeline-v1-2026-11-09T04-17-03-698Z.json` and `.tmp/atlas/board-precase-preflight-2026-11-09.json`; the root ledger §11.37 is authoritative.

**Primitive rig receipt:** The root verifier `scripts/atlas/verify-blender-primitive-rig-v1.mjs` passed against the existing Blender MCP, producing a 4-vertex / 2-triangle synthetic billboard, two named bones and vertex groups, `gradient_2bone` weighting, and a 2,188-byte GLB. The generated-primitive-animation browser test remains unverified: its 73,808-byte GLB fixture contains two meshes, two materials, and one `marker-pulse` clip, but the focused rerun stayed active without test output for over five minutes. A read-only request to the existing preflight page on `127.0.0.1:5173` timed out after 10 seconds; the existing Vite listener (PID 32884) was left untouched. This suggests app-server unresponsiveness but does not prove the exact hang point. Receipt: `.tmp/atlas/blender-primitive-rig-v1-2026-11-09T04-27-27-381Z.json`; root ledger §11.37 is authoritative.

**Cloud GPU and helper maturity correction (2026-11-08):** Root re-ran the LSP UTF-16/UTF-8 and prompt-chain helper tests; 7/7 passed. These prove bounded helpers, not live LSP edits, DSPy/RLM inference, physically aligned memory, zero-copy RPC, or GPU spillover. The `fused_bitmask_gpu_ranker.py` path uses separate PyTorch mask/compaction/GEMM/top-K operations and materializes an intermediate; the notebook has no saved execution outputs or A100/G4 benchmark receipt. AWS G4dn (T4) is distinct from Google Cloud G4 (RTX PRO 6000 Blackwell); G5/G6 use A10G/L4. Runtime availability and VRAM must be detected per session. No single-digit-ms, sub-4-ms, zero-eviction, or multi-request capacity claim is accepted without a frozen parity test and measured receipt. See the canonical root `colab_atlas_gpu_analysis/README.md`, `TODO.md`, and `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md` §12.

**Agentic prefill capacity audit (2026-11-08):** Root inventory found an i7-11700F (8 cores/16 threads), 4,752 MiB RAM free, and 945 MiB VRAM free with :8090 resident. A 4,096 × 768 centroid matrix is only 12 MiB raw FP32 (6 MiB FP16), but the current Valkey JSON representation, index/allocator overhead, resident cache use, vector lineage, and corpus quality determine real capacity. Existing `.okf`/Firecrawl, LSP, ACE descriptor, byte synthesis, SIMD JSON, Valkey centroid, KAG, DAG, and QLoRA descriptor helpers are not an end-to-end workflow. Reviewed labels, source rights/revisions, gRPC parity, SIMD dispatch parity, actual cache measurements, task identity/dependency reconciliation, durable claim/outcome proof, authenticated cloud spillover, and adapter evaluation remain open. See `docs/reports/agentic-prefill-capacity-gap-audit-v1.md` and the canonical root workboard ledger; no service or datastore was changed.

**EmbeddingGemma MRL clarification (2026-11-08):** The canonical monorepo already uses semantic_768 with normalized 512/256/128 MRL views; learned latent_256/128/64 are separate, and 384 is migration-only. The pasted N64KagEngine route is absent. The supplied sizing mixed four-bit payload with halfvec/FP32 storage, and its unsigned-nibble early-exit gate does not establish cosine ranking. No SQL or GPU changes were made. See `docs/reports/embeddinggemma-mrl-alignment-audit-v1.md` and the root dimension policy/ledger.

**Low-rank task RPC admission update (2026-11-08):** The canonical root generator now fails closed on missing source/task/snapshot/ordinal-map/binding identity, semantic_768, separately revisioned learned latent-64 data, or supplied feature rows before creating outputs. It no longer invents task and packet keys, revision strings, vectors, or feature scores, and labels the output as a noncanonical diagnostic format rather than a canonical feature-row RPC or native EmbeddingGemma MRL-64 artifact. Current concept-tie rows do not satisfy admission, so no qualified packet was generated. Root implementation/tests and the full status ledger remain authoritative at `scripts/atlas/synthesize-lowrank-task-rpc-v1.py`, `scripts/atlas/lowrank_task_binding_v1.py`, `scripts/atlas/test_lowrank_task_binding_v1.py`, and `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`; result `docs/reports/lowrank-task-rpc-source-binding-gate-v1.json`. No database/cache/GPU/service writes occurred.

**Ornith KV proof scope (2026-11-08):** Root proof wording was narrowed to `PASS_SYNTHETIC_CODEC_ONLY`; its explicit evidence scope says the tensors are synthetic and llama.cpp KV integration, serving prompt/logit parity, and recurrent-state edits are unproven. Focused 4-test suite passed in WSL CPU mode with CUDA disabled. The WSL read-only probe could not reach its own `127.0.0.1:8090`, which says nothing about the Windows-host listener. Refreshed evidence is in `docs/reports/ornith-hybrid-ssm-isoquant-kv-v1.json`. No actual serving cache integration or model inference occurred.

**241-row cohort identity review sheet (2026-11-08):** Root generated `docs/reports/openspec-cohort-6527-identity-review-sheet-v1.json` from the pinned crosswalk for human review. It includes exact source and candidate keys, task lines, block hashes, and the 124 / 10 / 107 identity-hint split. All decisions remain pending; the report authorizes neither task ID replacement nor Kanban row creation. Validation confirmed 241 records and exact source/candidate block-hash parity. The root script and report are canonical; no database or board state changed.

**First identity-review candidate (2026-11-08):** Review sheet row 69 is open and has the unique declared ID `BROWSER-GEN-EVAL-04`. Its source and workboard candidate share the exact locator `openspec/changes/local-llm-offload-ownership/tasks.md#L513` and matching source hash. Source key `local-llm-offload-ownership#9ac42e12c203b77a` and projection key `local-llm-offload-ownership#f15b11daf3054aca` remain an unapproved mapping proposal. The projection key has not been verified against PostgreSQL `kanban_tasks`; no mapping/write is authorized by this review sheet.

**User-reviewed identity candidate and scratch result (2026-11-08):** The operator confirmed review-sheet row 69 (`BROWSER-GEN-EVAL-04`) as a match between the source task and its workboard projection. A guarded, read-only PostgreSQL 18.4 scratch check (:5434) found no `kanban_tasks.task_id` match for either key and no exact `source_refs` match for the source locator. Therefore the user-approved identity does not yet map to a durable Kanban row. Decision and readback receipt: `docs/reports/openspec-cohort-6527-identity-review-decisions-v1.json`. No task was created, claimed, prefetched, or completed.

**241-candidate PostgreSQL check (2026-11-08):** A single guarded read-only PG18.4 scratch lookup checked 462 source/projection IDs and all 241 exact source references. It found 0 Kanban task ID matches and 0 `source_refs` matches. The user-approved source-to-workboard identity is not a durable Kanban mapping. No task writes, claims, or prefill occurred; receipt: `docs/reports/openspec-cohort-6527-identity-review-decisions-v1.json`.

**One-task population dry-run (2026-11-08):** The exact `BROWSER-GEN-EVAL-04` projection-key dry run failed closed before writes because `docs/reports/openspec-workboard-v1.json` is stale for `openspec/changes/local-llm-offload-ownership/tasks.md` (expected SHA-256 `d39fcd92e315a38e10d75a3c921b4d2b6b264a2933f9d6fbd76384dfe7333e81`, observed `8c098822d850de1d6dd3575f3c19dbfd9d5821bb4394b93f64c35bad195d6a5d`). Regenerate the workboard and repeat source-binding review before any dry run. No task was created or claimed; full receipt is in `docs/reports/openspec-cohort-6527-identity-review-decisions-v1.json`.

**Refreshed one-task dry-run (2026-11-09):** A temporary current-source workboard contains 14,234 tasks, and the read-only source-binding audit verified all 14,234 across 119 task files. `BROWSER-GEN-EVAL-04` remains bound to `local-llm-offload-ownership#f15b11daf3054aca` and its exact source block. The scratch-only dry run reports one eligible row to create with `SOURCE_REFERENCE_CURRENT`; it performed no writes. This does not authorize row creation or execution. The next gates are separate authorization for the one scratch row and a reviewed verification command before any claim. Full receipt: `docs/reports/openspec-cohort-6527-identity-review-decisions-v1.json`.

**Apply-path safety correction (2026-11-09):** The attempted one-row apply failed closed at the canonical `createKanbanTask()` call, which uses an independent database client and bypasses the population script's scratch URL guard. It logged `legal_ai_db`; receipt says 0 created and scratch readback 0. Read-only inspection found the matching canonical task already existed since 2026-11-01, pending, but with `source_revision=NULL` and the stale source reference `tasks.md#L506`. No canonical row/event state changed during this attempt. Do not retry this path or update the canonical row; use an explicitly scratch-injected creator for scratch rehearsal, and handle canonical binding reconciliation separately. See the root decision receipt and `.tmp/atlas/kanban-populate-receipt-v1-1794202957384.json`.

**Scratch writer isolation fix (2026-11-09):** The root task-board owner now has a scratch-specific creator that checks the connected database name and PostgreSQL version; the population script passes its loopback :5434 scratch Pool directly and closes the otherwise initialized canonical pool without using it. The focused board suite passed 16/16, syntax check passed, and the exact one-task dry run remains write-free with one current-source candidate. Apply was not retried: `CLAUDE.md` defers source_revision writes until workstation P20, so the scratch row remains uncreated until that gate is lifted. The existing canonical row remains untouched and stale. Root implementation and receipt: `sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts`, `scripts/atlas/populate-kanban-from-openspec-workboard-v1.mjs`, and `docs/reports/openspec-cohort-6527-identity-review-decisions-v1.json`.

**Scratch writer isolation fix (2026-11-09):** The root task-board owner now has a scratch-specific creator that checks the connected database name and PostgreSQL version; the population script passes its loopback :5434 scratch Pool directly and closes the otherwise initialized canonical pool without using it. The focused board suite passed 16/16, syntax check passed, and the exact one-task dry run remains write-free with one current-source candidate. Apply was not retried: `CLAUDE.md` defers source_revision writes until workstation P20, so the scratch row remains uncreated until that gate is lifted. The existing canonical row remains untouched and stale. Root implementation and receipt: `sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts`, `scripts/atlas/populate-kanban-from-openspec-workboard-v1.mjs`, and `docs/reports/openspec-cohort-6527-identity-review-decisions-v1.json`.

**241-row source recovery check (2026-11-09):** The 29 rows pointing to `parent-atlas-ace-rlm-bitfrost-integration/tasks.md` are not missing from GitHub `main`. The fetch response's content field was empty, but its non-empty blob SHA `a3e544b2e59d0d088e2dbee34126ef9a30b084fd` matches the local tracked file's Git blob. All 29 source lines and task-block hashes match the review sheet. This confirms source bytes/availability only; human identity approval and Kanban ownership remain unresolved, and all review decisions remain pending. No database writes or task ID changes. Root receipt: `docs/reports/openspec-cohort-6527-source-recovery-v1.json`.

**Identity-review priority correction (2026-11-09):** The 29 rows previously labeled P0 for missing source are now source-verified against GitHub `main`. They break down as 10 declared-ID, 7 section-qualified, and 12 migration/title-hash rows. Updated review triage: P0 source missing 0; P1 migration/hash 107; P2 section-qualified 10; P3 declared-ID unique 124. All 241 decisions remain pending; this is not an approval or task mapping. See `docs/reports/openspec-cohort-6527-source-recovery-v2.json`.

**Runtime ownership / TOPO-01 status correction (2026-11-09):** The 2026-09-21 runtime-ownership correction is distinct from TOPO-01 and does not leave it open. The root ledger and `docs/reports/wfu-topology-ownership-v1.json` record the later 2026-09-23 static ownership/caller-role classification of all ten topology implementation groups and the WFU TypeScript helper; no canonical topology owner was introduced. Fresh WFU tests passed 19/19. The runtime ownership audit reports 22 capabilities, 0 violations, and 36 warnings; `semantic_768` and `symbol_identity` remain not proven, while optional challenger lanes remain deferred. Root ledger: `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`.

**WFU-04b AST evidence follow-up (2026-11-09):** The saved local AST snapshot has 567 nodes across 6 source refs; the available saved root observation sample (2026-10-09) has 13 rows from 1 source ref and yields 0 same-revision and 0 exact-span matches against it. This is a stale/local artifact comparison, not a current observation or live database readback. The WFU-04a resolver fixture suites pass 15/15; WFU-04b remains open pending a real same-source-revision observation and exact readback. No store writes. Canonical status is in `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`.
