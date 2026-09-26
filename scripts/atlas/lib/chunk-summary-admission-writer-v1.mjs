/**
 * CEI-21 canonical chunk-summary admission writer. Consumes ONLY sealed proposal envelopes
 * (atlas.chunk-summary-proposal.v1); never calls a model. Writes only
 * codebase_chunk_index.summary_text + summary_provenance (legacy summary/summary_hash/summary_model untouched;
 * no Qdrant, embedding, graph or cache writes). Atomic: every row is prevalidated before the first UPDATE and
 * read back (digest + provenance) before COMMIT. `client` is any pg-like { query(sql, params) }.
 */
import { evaluateSummaryAdmissionV1, sha256Text } from './summary-quality-v1.mjs';
import { sha256Hex, stableJsonV1 } from './summary-proposal-candidate-v1.mjs';

/** The builder is the ONLY checksum producer; this only verifies (excludes proposalChecksum itself). */
export function verifyProposalChecksum(proposal) {
  const { proposalChecksum, ...rest } = proposal;
  return typeof proposalChecksum === 'string' && proposalChecksum === `sha256:${sha256Hex(Buffer.from(stableJsonV1(rest), 'utf8'))}`;
}

export const PROVENANCE_SCHEMA = 'atlas.summary-provenance.v1';
const PRODUCER_ID = 'ornith-summary-proposal-v1';

const READ_SQL = `
WITH p AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x("chunkRowId" uuid, "chunkId" text, "chunkCanonicalId" text,
    "sourceRef" text, "sourceRevision" text, "workspaceRevision" text, "evidenceRefs" jsonb)
)
SELECT p."chunkRowId"::text AS "chunkRowId",
  ci.id IS NOT NULL AS "rowExists",
  (ci.chunk_id = p."chunkId" AND ci.source_ref = p."sourceRef") AS "chunkIdentityMatches",
  'sha256:' || encode(sha256(convert_to(ci.content, 'UTF8')), 'hex') AS "currentInputDigest",
  (ci.summary_text IS NULL AND ci.summary_provenance IS NULL) AS "summaryTargetsEmpty",
  ci.summary_hash AS "summaryHashBefore",
  (SELECT b.source_revision FROM public.atlas_workspace_source_bindings b
     WHERE b.repo_id = $2 AND b.workspace_revision = p."workspaceRevision" AND b.canonical_source_ref = p."sourceRef"
     LIMIT 1) AS "currentSourceRevision",
  (SELECT b.binding_checksum FROM public.atlas_workspace_source_bindings b
     WHERE b.repo_id = $2 AND b.workspace_revision = p."workspaceRevision" AND b.canonical_source_ref = p."sourceRef"
       AND b.source_revision = p."sourceRevision" LIMIT 1) AS "bindingChecksum",
  EXISTS (SELECT 1 FROM public.atlas_packet_chunk_lineage l
     WHERE l.chunk_row_id = ci.id AND l.canonical_chunk_id = p."chunkCanonicalId" AND l.source_ref = p."sourceRef"
       AND l.source_revision = p."sourceRevision" AND l.revision_status = 'PROVEN') AS "exactChunkLineage"
FROM p LEFT JOIN public.codebase_chunk_index ci ON ci.id = p."chunkRowId"
ORDER BY p."chunkRowId"`;

const WRITE_SQL = `UPDATE public.codebase_chunk_index SET summary_text = $2, summary_provenance = $3::jsonb
WHERE id = $1 AND summary_text IS NULL AND summary_provenance IS NULL`;

const VERIFY_SQL = `SELECT id::text AS id, summary_text, summary_provenance, summary_hash
FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])`;

export function buildProvenance(proposal, admission, readback, admittedAt) {
  return {
    schema: PROVENANCE_SCHEMA,
    canonicalChunkId: proposal.chunkCanonicalId,
    sourceRef: proposal.sourceRef,
    workspaceRevision: proposal.workspaceRevision,
    sourceRevision: proposal.sourceRevision,
    producerId: PRODUCER_ID,
    producerRevision: proposal.runtimeBuildRevision ?? null,
    modelId: proposal.modelId,
    modelRevision: proposal.modelRevision ?? null,
    promptTemplateRevision: proposal.promptTemplateRevision,
    summaryInputDigest: `sha256:${proposal.inputTextSha256}`,
    summaryDigest: admission.summaryDigest,
    proposalChecksum: proposal.proposalChecksum,
    bindingChecksum: readback.bindingChecksum ?? null,
    generationParameters: proposal.generationParameters ?? null,
    admission: {
      schema: admission.schema,
      status: admission.status,
      reasons: admission.reasons,
      scaffoldLeak: admission.scaffoldLeak,
      reasoningLeak: admission.reasoningLeak,
      controlTokenLeak: admission.controlTokenLeak,
    },
    admittedAt,
  };
}

/** Pure: proposals x authoritative readbacks -> per-row dispositions. */
export function planAdmissions(proposals, readbacks, frozenTargets = null) {
  const byId = new Map(readbacks.map((r) => [r.chunkRowId, r]));
  const frozen = frozenTargets ? new Map(frozenTargets.map((t) => [t.chunkRowId, t])) : null;
  return proposals.map((p) => {
    const rb = byId.get(p.chunkRowId);
    const blocks = [];
    if (!verifyProposalChecksum(p)) blocks.push('PROPOSAL_CHECKSUM_MISMATCH');
    if (frozen) {
      const f = frozen.get(p.chunkRowId);
      if (!f) blocks.push('TARGET_NOT_IN_FROZEN_SET');
      else if (f.sourceRevision !== p.sourceRevision) blocks.push('CANARY_SOURCE_CHANGED');
    }
    if (!rb || !rb.rowExists) blocks.push('ROW_MISSING');
    else {
      if (!rb.chunkIdentityMatches) blocks.push('CHUNK_IDENTITY_CHANGED');
      if (!rb.exactChunkLineage) blocks.push('CHUNK_LINEAGE_NOT_PROVEN');
      if (!rb.bindingChecksum || !(p.evidenceRefs ?? []).includes(`binding_checksum:${rb.bindingChecksum}`)) blocks.push('BINDING_EVIDENCE_MISMATCH');
      if (!rb.summaryTargetsEmpty) blocks.push('UNEXPECTED_EXISTING_SUMMARY');
    }
    const lineage = {
      canonical_chunk_id: p.chunkCanonicalId, source_ref: p.sourceRef, source_revision: p.sourceRevision,
      workspace_revision: p.workspaceRevision, input_digest: `sha256:${p.inputTextSha256}`,
      proposal_checksum: p.proposalChecksum, model_id: p.modelId, prompt_template_revision: p.promptTemplateRevision,
    };
    const current = rb ? { source_revision: rb.currentSourceRevision, workspace_revision: p.workspaceRevision, input_digest: rb.currentInputDigest } : null;
    const admission = evaluateSummaryAdmissionV1({ summary: p.summary, lineage, current });
    if (admission.status === 'ADMITTED' && admission.summaryDigest !== `sha256:${p.summarySha256}`) {
      admission.status = 'BLOCKED_DIGEST_MISMATCH'; admission.reasons = ['SUMMARY_DIGEST_CHANGED'];
    }
    const status = blocks.length ? 'BLOCKED_ROW_STATE' : admission.status;
    return { chunkRowId: p.chunkRowId, status, reasons: [...blocks, ...admission.reasons], admission, proposal: p, readback: rb ?? null };
  });
}

export async function applyChunkSummaryAdmissions({ client, proposals, repositoryId, apply = false, frozenTargets = null, now = () => new Date().toISOString() }) {
  const receipt = {
    schema: 'atlas.chunk-summary-admission-receipt.v1', mode: apply ? 'APPLY' : 'DRY_RUN', requested: proposals.length,
    prevalidated: 0, admitted: 0, updated: 0, unexpected_existing: 0, identity_changed: 0, source_revision_changed: 0,
    input_digest_changed: 0, proposal_checksum_mismatch: 0, canary_source_changed: 0, target_not_in_frozen_set: 0, contamination_blocked: 0, readback_digest_mismatch: 0, summary_hash_mutated: 0,
    qdrant_writes: 0, embedding_writes: 0, graph_writes: 0, cache_writes: 0, status: null, rows: [],
  };
  await client.query('BEGIN');
  try {
    const read = await client.query(READ_SQL, [JSON.stringify(proposals), repositoryId]);
    const plan = planAdmissions(proposals, read.rows, frozenTargets);
    if (frozenTargets) {
      const have = new Set(proposals.map((p) => p.chunkRowId));
      const missing = frozenTargets.filter((t) => !have.has(t.chunkRowId)).map((t) => t.chunkRowId);
      if (missing.length) { await client.query('ROLLBACK'); receipt.status = 'BLOCKED_FROZEN_TARGET_MISSING'; receipt.frozenTargetsMissing = missing; return receipt; }
    }
    receipt.rows = plan.map((r) => ({ chunkRowId: r.chunkRowId, status: r.status, reasons: r.reasons }));
    receipt.admitted = plan.filter((r) => r.status === 'ADMITTED').length;
    receipt.prevalidated = receipt.admitted;
    receipt.unexpected_existing = plan.filter((r) => r.reasons.includes('UNEXPECTED_EXISTING_SUMMARY')).length;
    receipt.identity_changed = plan.filter((r) => r.reasons.some((x) => x === 'CHUNK_IDENTITY_CHANGED' || x === 'CHANGED_WORKSPACE_REVISION')).length;
    receipt.source_revision_changed = plan.filter((r) => r.reasons.includes('CHANGED_SOURCE_REVISION')).length;
    receipt.input_digest_changed = plan.filter((r) => r.reasons.includes('CHANGED_INPUT_DIGEST')).length;
    receipt.proposal_checksum_mismatch = plan.filter((r) => r.reasons.includes('PROPOSAL_CHECKSUM_MISMATCH')).length;
    receipt.canary_source_changed = plan.filter((r) => r.reasons.includes('CANARY_SOURCE_CHANGED')).length;
    receipt.target_not_in_frozen_set = plan.filter((r) => r.reasons.includes('TARGET_NOT_IN_FROZEN_SET')).length;
    receipt.contamination_blocked = plan.filter((r) => r.status === 'BLOCKED_CONTAMINATION').length;
    if (receipt.admitted !== proposals.length) { await client.query('ROLLBACK'); receipt.status = 'BLOCKED_CANARY_BATCH'; return receipt; }
    if (!apply) { await client.query('ROLLBACK'); receipt.status = 'CANARY_BATCH_READY'; receipt.wouldUpdate = plan.length; receipt.committed = 0; receipt.transaction = 'ROLLED_BACK'; receipt.nextGate = 'SUM_04_OPERATOR_APPLY_AUTHORIZATION'; return receipt; }

    const admittedAt = now();
    for (const r of plan) {
      const prov = buildProvenance(r.proposal, r.admission, r.readback, admittedAt);
      const res = await client.query(WRITE_SQL, [r.chunkRowId, r.proposal.summary, JSON.stringify(prov)]);
      if (res.rowCount !== 1) { await client.query('ROLLBACK'); receipt.status = 'BLOCKED_UPDATE_NOT_APPLIED'; return receipt; }
      receipt.updated += 1;
    }
    const back = await client.query(VERIFY_SQL, [proposals.map((p) => p.chunkRowId)]);
    const backById = new Map(back.rows.map((x) => [x.id, x]));
    for (const r of plan) {
      const row = backById.get(r.chunkRowId);
      const digestOk = row && sha256Text(row.summary_text) === r.admission.summaryDigest && row.summary_provenance?.summaryDigest === r.admission.summaryDigest;
      if (!digestOk) receipt.readback_digest_mismatch += 1;
      if (row && row.summary_hash !== r.readback.summaryHashBefore) receipt.summary_hash_mutated += 1;
    }
    if (receipt.readback_digest_mismatch || receipt.summary_hash_mutated) { await client.query('ROLLBACK'); receipt.status = 'ROLLED_BACK_READBACK_FAILED'; return receipt; }
    await client.query('COMMIT');
    receipt.status = 'APPLIED_READBACK_PROVEN';
    return receipt;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already ended */ }
    throw error;
  }
}
