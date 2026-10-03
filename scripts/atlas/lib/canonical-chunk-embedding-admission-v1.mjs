/**
 * Single code owner (CEI-16b-02..05) for admitting a frozen semantic_768 embedding plan to the
 * canonical `codebase_chunk_index.content_embedding` slot. Persistence is injected and must provide
 * one transaction; this module performs no I/O and never opens a database, so it cannot write live.
 *
 * Gates (each fails closed with a BLOCKED_* status; nothing is defaulted or inferred):
 *   02 source/chunk admission   - proven binding + proven packet->chunk lineage + exact identity/digest agreement
 *   03 input representation     - source content or an ADMITTED summary only; legacy summary is never input
 *   04 executor identity        - immutable model/tokenizer/runtime identity + capability or parity receipt
 *   05 conditional write        - write only into an empty slot, verify by readback, throw (rollback) on mismatch
 */
import { createHash } from 'node:crypto';

export const EMBEDDING_PLAN_SCHEMA_V1 = 'atlas.chunk-embedding-plan.v1';
const SHA = /^sha256:[a-f0-9]{64}$/;
const sha256Hex = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const nonEmpty = (v) => typeof v === 'string' && v.length > 0;
const same = (a, b) => nonEmpty(a) && a === b;

export function stableJsonV1(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJsonV1).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJsonV1(value[k])}`).join(',')}}`;
}

/** IEEE-754 binary32 -> binary16 bits, round-to-nearest-even (matches halfvec storage width). */
export function halfBits(x) {
  const f = new Float32Array(1); const u = new Uint32Array(f.buffer);
  f[0] = x; const b = u[0];
  const sign = (b >>> 16) & 0x8000; let exp = ((b >>> 23) & 0xff) - 127 + 15; let man = b & 0x7fffff;
  if (((b >>> 23) & 0xff) === 0xff) return sign | 0x7c00 | (man ? 0x200 : 0);
  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    man |= 0x800000; const shift = 14 - exp; const half = man >>> shift; const rem = man & ((1 << shift) - 1); const mid = 1 << (shift - 1);
    return sign | (half + (rem > mid || (rem === mid && (half & 1)) ? 1 : 0));
  }
  let out = sign | (exp << 10) | (man >>> 13); const rem = man & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (out & 1))) out += 1;
  return out;
}
export function halfVectorDigestV1(vector) {
  const buf = Buffer.alloc(vector.length * 2);
  vector.forEach((v, i) => buf.writeUInt16LE(halfBits(v), i * 2));
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

export function verifyEmbeddingPlanChecksumV1(plan) {
  if (!plan || typeof plan !== 'object' || !nonEmpty(plan.planChecksum)) return false;
  const { planChecksum, vector, ...body } = plan;
  return planChecksum === `sha256:${sha256Hex(stableJsonV1(body))}`;
}
export function sealEmbeddingPlanV1(body) {
  const { vector, ...rest } = body;
  return { ...body, planChecksum: `sha256:${sha256Hex(stableJsonV1(rest))}` };
}

function vectorProblem(vector) {
  if (!Array.isArray(vector) || vector.length !== 768 || vector.some((v) => !Number.isFinite(v))) return 'VECTOR_NOT_FINITE_768';
  const n2 = vector.reduce((s, v) => s + v * v, 0);
  return n2 < 0.98 || n2 > 1.02 ? 'VECTOR_NOT_L2_NORMALIZED' : null;
}

/** Gate 02. */
function gateSourceChunk(plan, cur) {
  if (cur.revisionStatus !== 'PROVEN' || cur.bindingStatus !== 'PROVEN'
    || cur.bindingMatchCount !== 1 || cur.lineageMatchCount !== 1) {
    return { status: 'BLOCKED_LINEAGE_MISSING', reasons: ['AUTHORITATIVE_BINDING_OR_CHUNK_LINEAGE_NOT_PROVEN_OR_AMBIGUOUS'] };
  }
  const pairs = [['chunkRowId', cur.chunkRowId], ['chunkId', cur.chunkId], ['canonicalChunkId', cur.canonicalChunkId],
    ['sourceRef', cur.sourceRef], ['sourceRevision', cur.sourceRevision], ['workspaceRevision', cur.workspaceRevision]];
  const bad = pairs.filter(([k, v]) => !same(plan[k], v)).map(([k]) => `CHANGED_${k}`);
  if (bad.length) return { status: 'BLOCKED_IDENTITY_CHANGED', reasons: bad };
  if (!same(plan.sourceFileSha256, cur.sourceFileSha256)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['FULL_FILE_DIGEST_MISMATCH'] };
  return null;
}

/** Gate 03. */
function gateInput(plan, cur) {
  const p = plan.inputPolicy ?? {};
  if (![p.formatterRevision, p.inputPolicyRevision, p.promptRevision, p.role].every(nonEmpty) || !Number.isInteger(p.maxInputTokens) || p.maxInputTokens < 1) {
    return { status: 'BLOCKED_INPUT_POLICY_UNBOUND', reasons: ['FORMATTER_POLICY_PROMPT_ROLE_OR_MAX_TOKENS_MISSING'] };
  }
  if (!SHA.test(plan.inputSha256 ?? '')) return { status: 'BLOCKED_INPUT_POLICY_UNBOUND', reasons: ['INPUT_DIGEST_MISSING'] };
  if (plan.inputKind === 'SOURCE_CONTENT') {
    if (!same(plan.inputSha256, cur.contentSha256)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['SOURCE_CONTENT_INPUT_DIGEST_MISMATCH'] };
    return null;
  }
  if (plan.inputKind === 'ADMITTED_SUMMARY') {
    const sp = cur.summaryProvenance;
    if (!sp || sp.admission?.status !== 'ADMITTED' || !nonEmpty(cur.summaryText)) return { status: 'BLOCKED_NO_ADMITTED_SUMMARY', reasons: ['SUMMARY_NOT_ADMITTED'] };
    if (!same(sp.sourceRevision, cur.sourceRevision) || !same(sp.workspaceRevision, cur.workspaceRevision)) return { status: 'BLOCKED_NO_ADMITTED_SUMMARY', reasons: ['SUMMARY_REVISION_NOT_CURRENT'] };
    if (!same(sp.summaryDigest, cur.summaryDigestRecomputed)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['SUMMARY_DIGEST_MISMATCH'] };
    if (!same(plan.summaryDigest, sp.summaryDigest)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['PLAN_SUMMARY_DIGEST_MISMATCH'] };
    // the embedded input must be the formatted admitted summary, not source content or anything else
    if (!same(plan.inputSha256, cur.summaryInputSha256)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['SUMMARY_INPUT_DIGEST_MISMATCH'] };
    return null;
  }
  return { status: 'BLOCKED_INPUT_KIND', reasons: ['LEGACY_OR_UNKNOWN_INPUT_KIND_NOT_ADMISSIBLE'] };
}

/** Gate 04. Model tags, ':latest' and vector shape alone never establish identity. */
function gateExecutor(plan) {
  const e = plan.executor ?? {};
  const missing = [];
  if (!nonEmpty(e.upstreamRevision)) missing.push('upstreamRevision');
  if (!SHA.test(e.ggufSha256 ?? '')) missing.push('ggufSha256');
  if (!SHA.test(e.tokenizerSha256 ?? '')) missing.push('tokenizerSha256');
  if (!nonEmpty(e.runtime) || !nonEmpty(e.executionProfileRevision)) missing.push('runtime/executionProfileRevision');
  if (e.dimensions !== 768) missing.push('dimensions');
  if (/:latest$/.test(e.modelId ?? '') && !SHA.test(e.ggufSha256 ?? '')) missing.push('immutable-model-digest');
  const cap = e.capability ?? {};
  if (!['CANONICAL_CAPABILITY_RECEIPT', 'MEASURED_PARITY_RECEIPT'].includes(cap.kind) || !SHA.test(cap.receiptChecksum ?? '')) missing.push('capabilityOrParityReceipt');
  if (cap.kind === 'MEASURED_PARITY_RECEIPT' && !(Number.isFinite(cap.minCosine) && cap.minCosine >= 0.999)) missing.push('parityMinCosine>=0.999');
  return missing.length ? { status: 'BLOCKED_EXECUTOR_IDENTITY', reasons: missing.map((m) => `MISSING_${m}`) } : null;
}

/**
 * repository.transaction(run) exposes: getAdmissionEvidence(plan), readTarget(chunkRowId),
 * setEmbeddingIfEmpty({chunkRowId, vector, model, version, sourceRevision, workspaceRevision}) -> {rowCount},
 * readBackEmbedding(chunkRowId) -> {vector, model, version, dimension} .
 * A verification failure after the write throws so the injected transaction rolls back.
 */
export async function admitCanonicalChunkEmbeddingV1({ plan, repository }) {
  if (!repository || typeof repository.transaction !== 'function') throw new Error('TRANSACTIONAL_REPOSITORY_REQUIRED');
  if (plan?.schema !== EMBEDDING_PLAN_SCHEMA_V1) return { status: 'BLOCKED_SCHEMA', reasons: ['UNSUPPORTED_PLAN_SCHEMA'] };
  if (!verifyEmbeddingPlanChecksumV1(plan)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['PLAN_CHECKSUM_MISMATCH'] };
  const vp = vectorProblem(plan.vector);
  if (vp) return { status: 'BLOCKED_VECTOR', reasons: [vp] };
  const vectorDigest = halfVectorDigestV1(plan.vector);
  if (!same(plan.vectorDigest, vectorDigest)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['VECTOR_DIGEST_MISMATCH'] };
  const exec = gateExecutor(plan);
  if (exec) return exec;

  return repository.transaction(async (tx) => {
    const cur = await tx.getAdmissionEvidence(plan);
    const target = await tx.readTarget(plan.chunkRowId);
    if (!cur || !target) return { status: 'BLOCKED_LINEAGE_MISSING', reasons: ['CURRENT_TARGET_OR_EVIDENCE_MISSING'] };
    if (target.contentEmbedding != null) return { status: 'ALREADY_PRESENT', reasons: ['CANONICAL_EMBEDDING_SLOT_NOT_EMPTY'] };
    const blocked = gateSourceChunk(plan, cur) ?? gateInput(plan, cur);
    if (blocked) return blocked;

    const version = `sha256:${sha256Hex(stableJsonV1({ plan: plan.planChecksum, vector: vectorDigest }))}`;
    const model = plan.executor.upstreamRevision;
    const write = await tx.setEmbeddingIfEmpty({
      chunkRowId: plan.chunkRowId, vector: plan.vector, model, version,
      sourceRevision: plan.sourceRevision, workspaceRevision: plan.workspaceRevision,
    });
    if (write?.rowCount !== 1) return { status: 'WRITE_RACE_OR_STALE_TARGET', reasons: ['CONDITIONAL_UPDATE_DID_NOT_MATCH_ONE_ROW'] };

    const back = await tx.readBackEmbedding(plan.chunkRowId);
    const problems = [];
    if (!back || !Array.isArray(back.vector)) problems.push('READBACK_MISSING');
    else {
      if (halfVectorDigestV1(back.vector) !== vectorDigest) problems.push('READBACK_VECTOR_DIGEST_MISMATCH');
      if (back.model !== model) problems.push('READBACK_MODEL_MISMATCH');
      if (back.version !== version) problems.push('READBACK_VERSION_MISMATCH');
      if (back.dimension !== 768) problems.push('READBACK_DIMENSION_MISMATCH');
    }
    if (problems.length) throw new Error(`EMBEDDING_READBACK_VERIFICATION_FAILED:${problems.join(',')}`);
    return { status: 'ADMITTED', reasons: [], version, vectorDigest, model };
  });
}
