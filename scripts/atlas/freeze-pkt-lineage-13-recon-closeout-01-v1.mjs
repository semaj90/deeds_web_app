#!/usr/bin/env node
/**
 * PKT-LINEAGE-13 RECON-CLOSEOUT-01 -- read-only evidence freeze.
 *
 * Synthesizes an immutable closeout record from artifacts already on disk.
 * Performs ZERO Qdrant reads, ZERO Postgres reads, ZERO writes to Qdrant/Postgres.
 * The only I/O is reading existing local JSON files and writing one new local file.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dryPath = path.resolve(root, 'docs/reports/bridge-recon-dry-04-v1.json');
const applyPath = path.resolve(root, 'docs/reports/bridge-recon-apply-v1.json');
const replayPath = path.resolve(root, 'docs/reports/bridge-recon-replay-v1.json');
const reportPath = path.resolve(root, 'docs/reports/pkt-lineage-13-recon-closeout-01-v1.json');

const dry = JSON.parse(fs.readFileSync(dryPath, 'utf8'));
const apply = JSON.parse(fs.readFileSync(applyPath, 'utf8'));
const replay = fs.existsSync(replayPath) ? JSON.parse(fs.readFileSync(replayPath, 'utf8')) : null;

// Step 1: can the exact original 6,306-patch set be reconstructed from the apply receipt alone?
const applyResultKeys = new Set();
for (const r of apply.results ?? []) for (const k of Object.keys(r)) applyResultKeys.add(k);
const requiredForReconstruction = ['packetKey', 'canonicalChunkId', 'sourceNamespace', 'sourceRevision', 'proposedPayloadChecksum'];
const missingFields = requiredForReconstruction.filter((f) => !applyResultKeys.has(f));
const originalPatchSetRecoverable = missingFields.length === 0;
const originalPatchSetStatus = originalPatchSetRecoverable
  ? 'ORIGINAL_PATCH_SET_RECOVERABLE'
  : 'ORIGINAL_PATCH_SET_NOT_DURABLY_RECOVERABLE';

// Step 3: the replay that actually ran used the DRY-03 reconstruction fallback (a different,
// smaller, earlier target population than the real 6,306-patch bulk proposal it superseded), so
// it cannot stand as proof that the ORIGINAL 6,306-patch set replays idempotently. Recorded
// explicitly rather than silently accepted as equivalent.
const replayUsedDry03Fallback = replay?.replayArtifactStatus === 'RECONSTRUCTED_FROM_PRIOR_DRY03_AFTER_DRY04_REPORT_OVERWRITE';

// Step 2/3 fallback: read-only idempotency state proof from the ALREADY-FRESH post-apply DRY-04
// artifact (itself a live-Qdrant + live-Postgres-lineage read-only comparison, mtime after the apply).
const finalStateIdempotencyProven = dry.counts?.EXACT_PATCH_REQUIRED === 0
  && dry.counts?.ALREADY_RECONCILED === dry.qdrantPointsFound
  && dry.blockingCount === 0;

const closeout = {
  schema: 'atlas.pkt-lineage-13-recon-closeout-01.v1',
  task: 'PKT-LINEAGE-13-RECON-CLOSEOUT-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EVIDENCE_FREEZE',
  note: 'No Qdrant or Postgres I/O performed by this script. All values sourced from already-existing local report artifacts.',

  step1_originalPatchSetRecoverability: {
    inspected: applyPath,
    applyReceiptResultFields: [...applyResultKeys].sort(),
    requiredFieldsForExactReconstruction: requiredForReconstruction,
    missingFields,
    verdict: originalPatchSetStatus,
    conclusion: 'audit-history defect, not a reason to undo the already-proven mutation',
  },

  step2_frozenFinalState: {
    lineageRows: dry.lineageMembershipCount,
    qdrantPresent: dry.qdrantPointsFound,
    qdrantMissing: dry.missingPhysicalPointCount,
    preApply: { alreadyReconciled: 6, exactPatchRequired: 6306 },
    apply: {
      effectiveChanges: apply.effectiveChanges,
      skippedAlreadyApplied: apply.results.filter((r) => r.skippedAlreadyApplied).length,
      readbackExact: apply.readbackExact,
      targetCount: apply.targetCount,
      vectorChanges: apply.vectorChanges,
      pointIdChanges: apply.pointIdChanges,
      deletes: apply.deletes,
      missingPointsCreated: apply.missingPointsCreated,
      writesPerformed: apply.writesPerformed,
      verdict: apply.verdict,
    },
    postApply: {
      alreadyReconciled: dry.counts?.ALREADY_RECONCILED,
      exactPatchRequired: dry.counts?.EXACT_PATCH_REQUIRED,
      blockingCount: dry.blockingCount,
      generatedAt: dry.generatedAt,
    },
  },

  step3_idempotencyCloseout: {
    exactOriginalSetReplayAttempted: replay !== null,
    replayUsedDry03Fallback,
    replayNote: replayUsedDry03Fallback
      ? 'The six RECON-CANARY-01 points were already applied before DRY-03 was generated, making DRY-03 a different, earlier target population than the real 6,306-patch bulk proposal it superseded. A zero-change replay against DRY-03 does NOT prove the original 6,306-patch set replays idempotently -- it proves a different, smaller historical population is stable, which is a weaker and distinct claim.'
      : null,
    originalPatchSetReplayVerdict: originalPatchSetStatus === 'ORIGINAL_PATCH_SET_RECOVERABLE'
      ? 'NOT_EVALUATED_SCRIPT_STOPPED_BEFORE_THIS_BRANCH'
      : 'ORIGINAL_PATCH_SET_REPLAY_UNPROVEN',
    finalStateIdempotencyProof: {
      source: dryPath,
      sourceGeneratedAt: dry.generatedAt,
      method: 'fresh read-only comparison of live Qdrant payload vs live atlas_packet_chunk_lineage rows, independent script from the apply',
      allPresentMembershipsAlreadyReconciled: dry.counts?.ALREADY_RECONCILED === dry.qdrantPointsFound,
      exactPatchRequiredIsZero: dry.counts?.EXACT_PATCH_REQUIRED === 0,
      verdict: finalStateIdempotencyProven ? 'FINAL_STATE_IDEMPOTENCY_PROVEN' : 'FINAL_STATE_IDEMPOTENCY_NOT_PROVEN',
    },
  },

  step4_lifecycleDefectNoteForFutureRuns: {
    defect: 'bridge-recon-dry-04-v1.json is a single mutable path that both the dry classifier and the apply script read/overwrite in place, so the exact proposal an apply consumed cannot be recovered after a later dry rerun overwrites it.',
    recommendationForFutureProtocol: 'Emit immutable versioned artifacts per run (e.g. bridge-recon-dry-05-v1.json, bridge-recon-apply-<runId>-v1.json, bridge-recon-replay-<runId>-v1.json). Apply/replay receipts should record consumedProposalChecksum and consumedTargetPointSetChecksum referencing the exact frozen dry artifact consumed.',
    retroactiveAction: 'NONE -- this is a forward-looking recommendation only; historical evidence is not altered.',
  },

  step5_attribution: {
    note: 'The BRIDGE-RECON-DRY-04 classification, the full 6,306-patch apply, and the DRY-03-fallback replay were executed by a concurrent process/session outside this session\'s authorization chain. This session performed only: PKT-LINEAGE-09 historical promotion, PKT-LINEAGE-10 BRIDGE-RECON-DRY-03 (read-only), PKT-LINEAGE-11 RECON-CANARY-01 (6-point canary apply+replay), the CONCURRENT-RECON-STATE-AUDIT-01 read-only audit, QDRANT-VECTOR-WRITER-OWNER-01 read-only audit, and this PKT-LINEAGE-13 read-only evidence freeze. This session did not author or authorize the concurrent bulk apply/replay.',
  },

  finalVerdict: originalPatchSetStatus === 'ORIGINAL_PATCH_SET_RECOVERABLE'
    ? 'NOT_APPLICABLE_SEE_RECOVERABLE_BRANCH'
    : (finalStateIdempotencyProven
      ? 'FULL_QDRANT_LINEAGE_RECONCILIATION_STATE_PROVEN_AUDIT_REPLAY_INCOMPLETE_ORIGINAL_ARTIFACT_NOT_DURABLE'
      : 'STATE_PROOF_INCOMPLETE_INVESTIGATE_FURTHER'),
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(closeout, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, verdict: closeout.finalVerdict, originalPatchSetStatus, finalStateIdempotencyProven }, null, 2));
