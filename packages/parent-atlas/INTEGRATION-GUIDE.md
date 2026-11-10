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

**next_steps index / OpenSpec document crosswalk (2026-11-09):** The root audit `scripts/atlas/audit-nextsteps-openspec-document-crosswalk-v1.mjs` validates a fresh 14,234-row workboard snapshot against current source task blocks and records explicit references to 5 tracked next_steps documents. The index itself has no checkbox task identity. Its 5 added links are for navigation only and remain `REVIEW_REQUIRED`; they do not establish task identity, ownership, dependencies, or completion. All 14,234 source blocks were current at audit time; no database writes occurred. Root receipt: `docs/reports/nextsteps-openspec-document-crosswalk-v1.json`.

**GPU release request / TRACE health status (2026-11-10):** Production request records include `requestId`, `actorContext`, `operation`, and `targetScope`; `testOnly` is test-only. The focused contract suite passed 8/8 with temporary sinks. TRACE source treats both `rerank` (:8099) and `topology_search` (:8101) as optional for general health; topology-dependent workflows must still gate on topology capability. The latest live health probe found both endpoints unreachable and returned `degraded:true`; deployed behavior remains unverified pending operator configuration and TRACE restart. No services were restarted and no live request was written. Owner ledger: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`.

**Sidecar migration source recheck (2026-11-10):** The canonical root audit `scripts/atlas/audit-stale-migration-provenance-v1.mjs` refreshed `.tmp/atlas/stale-migration-provenance-recheck-20261110-v4.json`. All 63 SQL sources are present; 38 deferred files still match their prior source hashes. The report counts executable DML/comment/grant/DO families after stripping comments and drops parser noise from object candidates. Five unparsed entries contain real SQL operations but lack extracted target inventories. The scratch catalog check remains blocked by authentication (`28P01`); schema equivalence and execution history are unverified. No migration manifest or database changes. Owner ledger: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`.

**OpenSpec task evidence audit (2026-11-09):** The root scorer audited all 62 checkbox rows in the GPU-compute-lanes change against a fresh workboard/controller projection and current source blocks. 5 are checked (8.06% raw checkbox progress), 57 are open, and 0 have admitted task-bound receipts; evidence-verified completion is 0% under the strict proof gate. This does not claim that no implementation exists. The five-factor scoring proposal and DSPy evidence-extraction prompt are in `docs/reports/openspec-task-evidence-scoring-v1.md`; current row-level report: `docs/reports/gpu-compute-lanes-task-evidence-score-v1.json`. No Kanban writes occurred.

**Checked-task evidence follow-up (2026-11-09):** Focused NAME-POLICY-01, HASHCENT-01 lookup, and GSP-5.2 replay-identity suites pass 17/17. The Gemma guard's only initial failure was a demo page displaying an on-disk GGUF/MTP artifact path, now explicitly classified as artifact-only with a reason; no chat model routing was changed. This test result does not add task-bound execution receipts: the audit remains 0 PROVEN and 0% receipt-gated completion. The historical NX/cuGraph result remains a seeded fixture and was not rerun. Root ledger: `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`; owner ledger: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`.

**Runtime ownership / TOPO-01 status correction (2026-11-09):** The 2026-09-21 runtime-ownership correction is distinct from TOPO-01 and does not leave it open. The root ledger and `docs/reports/wfu-topology-ownership-v1.json` record the later 2026-09-23 static ownership/caller-role classification of all ten topology implementation groups and the WFU TypeScript helper; no canonical topology owner was introduced. Fresh WFU tests passed 19/19. The runtime ownership audit reports 22 capabilities, 0 violations, and 36 warnings; `semantic_768` and `symbol_identity` remain not proven, while optional challenger lanes remain deferred. Root ledger: `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`.

**WFU-04b AST evidence follow-up (2026-11-09):** The saved local AST snapshot has 567 nodes across 6 source refs; the available saved root observation sample (2026-10-09) has 13 rows from 1 source ref and yields 0 same-revision and 0 exact-span matches against it. This is a stale/local artifact comparison, not a current observation or live database readback. The WFU-04a resolver fixture suites pass 15/15; WFU-04b remains open pending a real same-source-revision observation and exact readback. No store writes. Canonical status is in `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`.

**WFU-09/10 current feature and tournament audit (2026-11-09):** The isolated 13,951-task controller has 30 declared dependency edges, 0 unresolved edges/cycles, and 0 admitted task receipts; the refreshed workboard has 0 stale controller rows. Of 4,094 actionable tasks, only 1 has a declared prerequisite count, and that value is constant. The adapter now ignores the unrelated program-level `dependsOn: []` projection and computes qualified variation from `OBSERVED`/`DERIVED` values only. The low-rank producer accepts just `goalRank` and `selectionEligible`; the current tournament is advisory only, with mean absolute rank delta 534.48 and top-10/50/200/500 overlap of 4/17/88/220, `eligibleForAuthority=false`. Metadata coverage remains sparse (23/13,951 tasks); no ranking-quality claim is supported. A reports-directory override keeps the authority review audit isolated under `.tmp`. No shared report or datastore was mutated. Root receipt: `.tmp/atlas/wfu09-current-feature-tournament-v1.json`.

**WSL2 PyTorch environment refresh (2026-11-09; corrected inventory scope):** Use `/home/james/miniforge3/envs/atlas-rapids-cu13` for RAPIDS and CPU-side PyTorch ranking (Python 3.14.6, PyTorch 2.13.0+cu130). The separate cuTile challenger venv is `/home/james/.venvs/atlas-cutile-cu132` (Python 3.14.6, PyTorch 2.14.0+cu132, cuda-tile 1.5.0, tileiras 13.2.78); metadata was rechecked without querying or using the GPU. The earlier search covered Miniforge only and incorrectly said the cuTile venv was absent. Keep both environments separate. The fresh 4,094-task ranking used `CUDA_VISIBLE_DEVICES=-1`, only `goalRank` and `selectionEligible`, and remains advisory with `eligibleForAuthority=false`. The cuTile rerun remains gated on operator-controlled `:8090` release and ≥6 GiB free. Receipts: `docs/reports/wfu09-pytorch-wsl-runtime-v1.json` and `docs/reports/cutile-ace-level3-results.json`.

**NS-7A receipt-aware shadow correction (2026-11-09):** The shadow dependency comparison now requires exact prerequisite rows to have controller state `PROVEN`; a checked task box alone no longer makes a prerequisite ready. It also preserves authority and other non-dependency blockers. The 13,951-row isolated replay records 5 declared tasks with unproven prerequisite receipts, 0 scheduler disagreements, and admission false (0.02% dependency metadata coverage and 61.19% logical task-key coverage, each below the 95% gate). The focused suite passes 20/20. No controller behavior or datastore was changed. Root receipt: `docs/reports/wfu09-ns7a-receipt-aware-shadow-v1.json`.

The isolated receipt includes the source hashes for `scripts/atlas/build-dependency-scheduler-shadow-v1.mjs`, `scripts/atlas/lib/wfu-metadata.mjs`, and its 13,951-row controller input; the root task ledger records those hashes.

**WFU-09 history-feature shadow integration (2026-11-09):** The root adapter can consume the optional task-block Git-history receipt after strict controller/HEAD/generator/task/source hash checks and emits `taskBlockAgeSeconds` as `DERIVED`; a tampered-revision receipt was rejected before output. The WSL2 PyTorch ranker ran CPU-only in `/home/james/miniforge3/envs/atlas-rapids-cu13`. On 4,094 tasks, adding the feature changed mean absolute rank delta from 534.48 to 923.30 and top-10/50/200/500 overlap from 4/17/88/220 to 0/1/23/112. This is ordering divergence only; there are no reviewed outcome labels, no ranking-quality finding, and no authority eligibility. Root audit/evaluation receipts: `docs/reports/wfu09-task-block-history-feature-audit-v1.json` and `docs/reports/wfu09-task-block-history-feature-ranker-eval-v1.json`; root implementation remains authoritative.

**WFU-09 task-block history feature audit (2026-11-09):** The initial read-only audit measured candidate `taskBlockAgeSeconds` values from exact Git task-block history: 4,069/4,094 actionable rows (99.389%), across 100 source files and 255 distinct values. The 25 excluded rows are in a modified file. The following integration entry records the later adapter/ranker wiring and same-cohort comparison; coverage and variation do not prove ranking value. Root generator: `scripts/atlas/audit-task-block-history-feature-v1.mjs`; receipt: `docs/reports/wfu09-task-block-history-feature-audit-v1.json`; authoritative status: `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`.

**NS-9 identity-lane metadata review inventory (2026-11-09):** A fresh root audit found 546 actionable `IDENTITY_AUTHORITY` tasks, all bound to exact current source blocks; 323 have logical task keys. None has an existing `wfu:` declaration for dependencies, estimates, reads, or writes. The root report supplies source and block hashes with blank reviewer decisions and no suggested values. No task annotations, IDs, or controller state were changed. Root generator: `scripts/atlas/audit-wfu09-ns9-identity-metadata-v1.mjs`; receipt: `docs/reports/wfu09-ns9-identity-lane-metadata-review-v1.json`; authoritative ledger: `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`.

**NS-9 dependency text candidates (2026-11-09):** The root-only, source-hash-checked follow-up found 3 task-ID mentions immediately following dependency/order cues among 546 identity-lane rows; all 3 resolve uniquely to existing controller task keys. Two rows were withheld because the utility-fabric task ledger changed after its inventory snapshot. These remain human-review hints, not declared edges or scheduler inputs. No source metadata, IDs, task status, database, or cache was changed. Root generator: `scripts/atlas/audit-wfu09-ns9-dependency-text-candidates-v1.mjs`; receipt: `docs/reports/wfu09-ns9-dependency-text-candidates-v1.json`.

**NS-9 first authored dependency declaration (2026-11-09):** The existing `NEXT-23 READY after NEXT-22` task now carries `<!-- wfu: depends=NEXT-22 -->` in the canonical root ledger. This is a source-backed declaration only; downstream controller resolution/admission has not yet been verified. No task IDs, estimates, read/write sets, database, or cache were changed.

**NS-9 one-edge propagation proof (2026-11-09):** The isolated current-source workboard/controller/adapter chain resolves NEXT-23 to the existing NEXT-22 task with matching source block and task revision hashes. Because NEXT-22 has no admitted proof receipt, NEXT-23 is `WAITING_ON_DEPENDENCY` and excluded from actionable ranker input. The source-binding verifier passed 7/7 checks and WFU metadata tests passed 20/20. Receipt: `docs/reports/wfu09-ns9-first-dependency-adoption-v1.json`; verifier: `scripts/atlas/verify-wfu09-ns9-dependency-adoption-v1.mjs`. This is one-edge propagation evidence only; it does not admit execution or prove cohort coverage.

**NS-9 second dependency-set propagation proof (2026-11-09):** The isolated current-source controller resolves DOC-BATCH-13 to DOC-BATCH-10/11/12, detects no missing or cyclic edges, and blocks the dependent task until prerequisite proof receipts are admitted. The adapter excludes it from actionable ranking. The two-task verifier passed with 4/4 edges resolved; WFU metadata tests passed 20/20. Receipt: `docs/reports/wfu09-ns9-explicit-dependencies-v1.json`; verifier: `scripts/atlas/verify-wfu09-ns9-explicit-dependencies-v1.mjs`. This remains two-task source-bound evidence, not broad NS-9 coverage or scheduler admission.

**NS-9 three-task propagation proof (2026-11-09):** The controller resolved NEXT-23→NEXT-22, DOC-BATCH-13→DOC-BATCH-10/11/12, and SYSTEM-PROMPT-01→CTX-E2E-01. All 5 edges resolve uniquely, no cycles or unresolved edges were found, and all 3 dependent tasks remain blocked pending prerequisite proof receipts and outside actionable ranking. The verifier passed 3/3 tasks; WFU metadata tests passed 20/20. Receipt: `docs/reports/wfu09-ns9-explicit-dependencies-v1.json`; verifier: `scripts/atlas/verify-wfu09-ns9-explicit-dependencies-v1.mjs`. This remains a small source-backed sample, not broad NS-9 coverage or scheduler admission.

**NS-7A shadow recheck (2026-11-09):** The refreshed controller snapshot has 0 ambiguous/unresolved dependency edges and 0 cycles, but declared dependency coverage is 0.02% versus the 95% requirement and logical task-key coverage is 61.31% versus 95%. The scheduler is not admitted; incumbent controller rules remain in force. Receipt: `docs/reports/wfu09-ns7a-after-ns9-dependencies-v1.json`; no datastore writes.

**WFU-09 task-history ranker guard (2026-11-09):** The measured same-cohort comparison showed that `taskBlockAgeSeconds` changes ordering substantially, but there are no reviewed outcome labels proving the change improves task quality. The root Python ranker therefore omits it by default; `--include-task-history` enables it only for explicit shadow experiments. The feature remains available in the advisory vector. This is not a ranking-quality result or WFU-09 closure; see the root OpenSpec ledger and `docs/reports/wfu09-task-block-history-feature-ranker-eval-v1.json` for scope and evidence.

**NS-9 source-backed dependency adoption expansion (2026-11-09):** The root pass added 26 exact `depends=` edges to 14 source-verified actionable tasks in 11 clean task files. The expanded verifier passed 17 groups / 31 edges including the earlier five: all resolve uniquely, no unresolved or cyclic edges, and all 17 dependents stay non-actionable until prerequisite proof is admitted. Fresh controller counts changed from 4,117 actionable / 1,611 waiting to 4,103 / 1,625. The scheduler remains inadmissible: dependency metadata coverage is 0.02% and logical-key coverage 61.17%, each below the 95% gate. No estimates or IDs were invented and no database/cache/task execution state was changed; source task ledgers were annotated. Receipts: `docs/reports/wfu09-ns9-explicit-dependencies-v1.json`, `docs/reports/wfu09-ns7a-expanded-explicit-dependencies-v1.json`; root ledger remains authoritative.

WFU-09 follow-up, 2026-11-09: refreshed source bindings for all 4,077 actionable tasks across 100 files (0 failures). The corrected cue scanner excludes `SHA-256`, `UTF-8`, and `UTF-16` labels as task IDs. Current review counts: 14 task blocks, 18 references, 7 unique, 2 ambiguous, 9 unresolved. No additional dependency edges were inferred. Root report: `docs/reports/wfu09-ns9-actionable-dependency-candidates-v1.json`.

## MCP registry and evidence status (2026-11-09, mirrored from the root ledger)

Authority: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md` (section "MCP registry + evidence audit"). This section is a mirror and carries no independent authority.

- **VRAM release request record:** production records carry `requestId`, `actorContext`, `operation`, `targetScope`; `testOnly` only from the isolated factory. Contract tests 8/8 pass with temp sinks. Identical retries are idempotent; reusing an ID with a different operation/reason/neededMiB/target scope throws `GPU_REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD`. This is process-local file idempotency, not a cross-process database guarantee.
- **TRACE operator token:** verifier and gate are source-verified (env fallback, SHA-256 digests, fail closed). Live configured-secret comparison is NOT tested; the running process has no secret.
- **TRACE health:** `rerank` and `topology_search` are optional for general health in source; live behavior remains pending restart and verification. Workflows requiring topology remain capability-gated.
- **`ops.fixer_pattern_store`:** the generated `docs/reports/mcp-tool-registry-index.json` incorrectly says `permissions=read_only` and `writes_to=[]`. The TRACE formal contract declares WRITE/operator-gated, and the handler writes PostgreSQL with optional Redis/Qdrant updates. Treat it as write-capable; generated-registry repair remains open.
- **Viterbi callable tool:** not found in the MCP registrations. Challenger only.
- **Evidence scoring:** 62 task rows, 0 with admitted receipts, 0% evidence-verified completion. Acceptance evidence is unscorable for all rows. Maximum verifiable evidence-support is 35/100, which is not completion.
- **WFU-09 binding:** 4,077 task blocks checked, 0 failures; 7 unique, 2 ambiguous, 9 unresolved dependency cues preserved as review findings.

**MCP source audit and five-factor score refresh (2026-11-09):** Root generated `docs/reports/parent-atlas-mcp-agentic-workflow-review-v1.json` from static source only; it invokes no MCP tools and accesses no stores/services. It records 22 grouped tool entries across 14 source files, handler effects, auth notes, source references and source digests. TRACE's global `registerTool` wrapper also persists Engram observations for tools registered after the wrapper, so a handler that only reads may still cause an invocation-observation write. The four native fixture tools register before that wrapper. The token verifier is fail-closed in source (minimum length, configured secret, SHA-256 digest, constant-time comparison); no secret or live positive-token test was used. Viterbi remains a challenger; live tool-list/deployed-source verification remains unrun. The report confirms the generated registry's `ops.fixer_pattern_store` read-only classification is inconsistent with the formal contract and implementation.

The root five-factor report now records per-task factors without fabricated totals: 62/62 current source blocks, 5 checked, 0 admitted receipts, 0 proven, and 62 aggregate scores marked `UNSCORABLE` because acceptance/reproducibility/dependency mappings are missing. Each row earns source-block provenance only; independent verification is 0 absent an admitted receipt. The separate 4,077-task NS-9 cue report remains 7 unique, 2 ambiguous, 9 unresolved, with no inferred edges. See `scripts/atlas/audit-parent-atlas-mcp-agentic-workflow-v1.mjs`, `docs/reports/parent-atlas-mcp-agentic-workflow-review-v1.json`, `scripts/atlas/audit-openspec-task-evidence-scores-v1.mjs`, and `docs/reports/gpu-compute-lanes-task-evidence-score-v1.json`. Root task ledger is authoritative; this package section is a mirror.

## Migration provenance and prefill parity (2026-11-09; mirrored from root ledger)

The root audit `scripts/atlas/audit-stale-migration-provenance-v1.mjs` binds all 63 migration SQL files to current per-file SHA-256 hashes and keeps object presence, schema equivalence, and execution history distinct. Snapshot counts remain 25 all-present, 19 partial, 14 none-present, and 5 unparsed. It inventories SQL statement families and checks parser-reported object-name text mentions for all partial/unparsed files; this is not schema equivalence. The previous catalog capture has no target identity; a fresh guarded read-only connection to scratch `:5434` failed authentication (`28P01`), so catalog comparison and execution history remain unverified. No sidecar manifest diff is proposed because neither catalog identity nor migration execution provenance is established. Layer-4 dry run: 38 medium stale-migration and 26 informational documented-sidecar findings. Error-fix DAG dry run: 40 grouped findings; diagnostic IDs are not canonical task IDs, so this is not an executable repair plan. No database or migration writes occurred. Full row-level report: `.tmp/atlas/stale-migration-provenance-classification-v2.json`.

The two root prefill helper files remain byte-identical to package sources. Root parity/import smoke passed 2/2; after package TypeScript compilation, existing contextual-prefill and cache-runtime behavior suites passed 15/15. This proves parity and package behavior only; a root production caller remains unverified. Root ledger is authoritative.

### 0101/0102 caller review (2026-11-10; root-canonical)

The static caller review is recorded in `docs/reports/sidecar-migration-caller-review-v1.json`; root status is authoritative in `openspec/changes/manual-migration-reconciliation/tasks.md`. Migration `0101_spec_control_plane_phase1.sql` overlaps active `agent_runs` and `workflow_events` owners/callers with incompatible column definitions, proposes a second `tasks` authority beside `kanban_tasks`, declares its immutability trigger before its function, and adds an unguarded constraint. Migration `0102_feature_statistics_and_potentials.sql` has no active caller found in the scoped scan and contains an invalid FK from `packet_promotion_log.packet_key` to the composite-key-only `packet_potentials(packet_key, title_id)`. These are source findings only: scratch catalog access failed with `28P01`, so live schema equivalence and migration history remain unknown. No SQL or database writes were performed; do not admit either migration until identity/owner reconciliation and an approved read-only catalog check are complete.

### Remaining deferred migration source review (2026-11-10; root-canonical)

The five parser-unclassified migration files now have manual source-target and replay-risk notes in `docs/reports/stale-migration-deferred-source-review-v1.json`. Static source scans found active callers for several other relations, including promotion, identity, encoder, lifecycle, telemetry, and execution-review paths; those source hits still do not establish live schema state. The two `0152_atlas_representations_registry*.sql` files are incompatible candidates: both define `atlas_representations`, but required provenance fields and dimension constraints differ, and no Drizzle owner was found in the scoped schema scan. The 19 partial object-presence records still refer to an unidentified database capture, so they cannot support missing-object DDL or applied-status changes. Scratch authentication returned `28P01`; the database-usage graph returned no revision or evidence refs. Root ledger remains authoritative, and no SQL, manifest, database, service, or task state was changed.

### 0101/0102 object disposition (2026-11-10; root-canonical)

The 18-object source/requirement matrix is in `docs/reports/sidecar-migration-object-disposition-v1.json`. It records TRACE presence from the supplied transcript as reported, not independently refreshed schema proof. Current source requires the existing `agent_runs` and `workflow_events` contracts from migration 0038; 0101's definitions conflict. The proposed `tasks` table is superseded by `kanban_tasks`. The old `artifacts` query was removed; `agent.runs.get` now returns an empty `artifactIds` array, so there is no current verified application requirement for the migration's `artifacts` table. No active caller was found for the 0102 potentials/promotion/fallback tables. This session has no PostgreSQL catalog-introspection TRACE tool, and the prior scratch login failed `28P01`; schema equivalence and execution history remain unknown. No candidate SQL, manifest change, or database write was made.

### Proposed ten-object adoption review (2026-11-10; root-canonical)

Do not create the ten proposed tables as a bundle. Reuse `kanban_tasks` for task authority. `agent_run_actions` is written by the phase79 repair CLI; its compiler adapter is re-exported but no non-test application request-path invocation was found. `agent_action_results` has no active non-test reader/writer, and neither table is a proven general replacement for `agent_run_steps`. `workflow_approvals` is used for run-scoped decisions, not equivalent to generic feature-scoped `approvals`. Defer objects without an active caller and owning contract. `agent.runs.get` currently returns an empty `artifactIds` array rather than querying `artifacts`. Per-object recommendations and gates are in the root disposition report. No SQL, manifest, or database writes were made.

The current repository check also found that neither `0101_spec_control_plane_phase1.sql` nor `0102_feature_statistics_and_potentials.sql` is registered in the current sidecar manifest or Drizzle journal. This does not establish whether either file was run manually or by another mechanism. Existing uncommitted sidecar-manifest work was preserved.

The repository sidecar policy classifies unjournaled SQL that is absent from the manifest as `stale_migration`, and Drizzle Kit skips it. That is a repository warning, not an instruction to register or execute either file; execution history remains unknown.

The refreshed 63-file source/presence triage is `.tmp/atlas/stale-migration-provenance-classification-20261110-v1.json`: 14 `NONE_PRESENT`, 25 `ALL_PRESENT`, 19 `PARTIAL`, and 5 `NO_OBJECTS_PARSED`. It verifies no schema equivalence or migration execution history; the saved catalog target identity is unknown. These counts do not authorize DDL or manifest changes.

The current SQL caller requirements for `proposed_tool_calls`, `execution_reviews`, `tool_call_events`, and `outcome_ledger` are now recorded in `applicationCallerShapeReview` in the root disposition report. Application code uses the wider proposal/event/outcome fields from the saved shape receipts; the execution-review writer does not use `trace_id`. This supports preserving caller-required columns, but does not independently establish complete live schema equivalence, index ownership, FK safety, or migration history. FK/index repairs still require identity-bound catalog readback and orphan checks.

`semantic_lifecycle_events` is also source-required by phase109a signal-history reads and the 0116 recommendation-supersession function. Current Drizzle nullability and index names differ from 0110 SQL, and 0118 widens the lifecycle-state constraint. The saved live receipt checked table presence/index names only. Do not rerun 0110 or propose a repair until live columns/constraints and 0110/0116/0118 execution history are independently verified. Details and source hashes are in the root disposition report.

The registered phase109a supersede/promote tools depend on database functions from 0116/0111 and the 0118 lifecycle-state constraint. 0110, 0116, and 0118 are absent from the current journal and sidecar manifest, so they are unregistered stale SQL while their execution history remains unknown. 0118's drop/re-add constraint and 0116's schema/function statements must be rehearsed atomically against a verified scratch schema before any repair. No migrations were run.

## VRAM request idempotency follow-up (2026-11-09; mirrored from root ledger)

The existing request writer rejects a reused `requestId` when `operation`, `reason`, `neededMiB`, or `targetScope` differs. Added explicit assertions for changed `reason` and changed `neededMiB`; the focused temporary-sink suite passes 8/8. The GPU-consolidation ledger now marks the expanded request record and conflict guard resolved, with process-local idempotency only. No production request or service action occurred. TRACE still needs the human-operated secret configuration/restart before live verification; never provide the secret to an agent.

### Sidecar migration scratch readback (2026-11-09)
A database-identity-guarded PostgreSQL 18.4 readback was completed on `legal_ai_live_integration_scratch`; it does not establish TRACE/production parity. The scratch catalog confirms 0112/0114 differ from the current proposal/review callers and the wider `tool_call_events`/`outcome_ledger` shapes are in use. Four nullable 0111 foreign-key relationships had zero orphan rows. Their constraints plus two missing indexes passed inside a transaction, then rollback and independent readback confirmed no persistent additions. `semantic_lifecycle_events`, its recommendation-state check, and relevant functions are present in scratch and match current Drizzle shape. The database migration ledger is empty; registry counts do not prove execution history, which remains UNKNOWN. See the root disposition report and its scratch readback receipts. No persistent DB, migration, manifest, or task-state writes occurred.

### WFU-09/10 and WFU-04b evidence reconciliation (2026-11-09/10)
The isolated 13,951-task WFU-09 run reports zero stale rows but only two qualified ranker features and zero admitted task receipts. Its 23 declared-metadata rows are a different metric from 4,094-row feature-vector coverage. A later snapshot still carries 11,795 stale controller states from a September receipt; the tournament bundle also has mismatched low-rank and adapter hashes. Refresh and hash-check the whole chain before treating its metrics as current. WFU-04b now has one successful read-only `legal_ai_db` source/AST match (PostgreSQL 18.4), with no writes or restart, but the fixed-source probe did not exercise the rg handoff or prove corpus coverage. Detailed comparison: `.tmp/atlas/wfu09-wfu04b-blueprint-audit-20261110.json`. Root status and receipts: `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md`, `.tmp/atlas/wfu09-current-feature-tournament-v1.json`, and `.tmp/atlas/wfu04b-readonly-current-20261110T0140Z.json`.

**Execution-bridge refresh (2026-11-10):** The current 14,234-task snapshot and full workboard/source-binding audit validate all source bindings across 119 files; an isolated crosswalk finds 5 navigation-only references. The one-task scratch dry run confirms `BROWSER-GEN-EVAL-04` is source-current and has no Kanban row, but scheduler permission is `NOT_SELECTED` and no reviewed verification command exists. No task was created, claimed, or completed. See `.tmp/atlas/parent-atlas-execution-bridge-refresh-20261110.json`.

**Selected-task contract slice (2026-11-10):** A fresh isolated controller makes the approved `BROWSER-GEN-EVAL-04` task `READY`; an exact temporary selection manifest selects only that key, and all 14,234 source bindings verify. Added a no-model-load browser generation contract harness with injected Transformers.js/LiteRT ports. Its focused suite and existing greedy-sampler suite pass 13/13. The scratch claim bridge still returns `NO_READY_TASKS_CLAIMABLE` because `openspec:local-llm-offload-ownership` has zero Kanban rows. No Kanban row or outcome was written, and live inference is not established. See `.tmp/atlas/parent-atlas-execution-bridge-refresh-20261110-v2.json`.
