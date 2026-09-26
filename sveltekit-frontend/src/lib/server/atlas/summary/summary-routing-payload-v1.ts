import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

/**
 * SUM-ROUTE-02/04/05 (pure, no I/O). Derived, revision-qualified projection joining a chunk's summary state, routing
 * metadata, semantic-vector state and structural availability. It POINTS at canonical evidence and is never an owner
 * (canonicalAuthority=false). Summary state is strict: CURRENT only when summary_text is ADMITTED and its provenance
 * revisions/digest equal the identity spine now; every other existing text is HINT; nothing "best available" becomes
 * CURRENT. A legacy vector without matching provenance is never counted as available. :8090 is not used here.
 */
const sha256Prefixed = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const nullableStr = z.string().min(1).nullable();

export const SUMMARY_STATES = ['CURRENT', 'HINT', 'BLOCKED', 'MISSING'] as const;
export const SUMMARY_SOURCES = ['CANONICAL_SUMMARY_TEXT', 'LEGACY_CHUNK_SUMMARY', 'PACKET_SUMMARY', 'SUMMARY_LAYER', 'NONE'] as const;

const body = z.object({
  schema: z.literal('atlas.summary-routing-payload.v1'),
  identity: z.object({
    chunkRowId: z.string().uuid(),
    canonicalChunkId: z.string().min(1),
    packetKey: nullableStr,
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    workspaceRevision: z.string().min(1),
    bindingChecksum: z.string().min(1),
    candidateOrdinal: z.number().int().nonnegative().nullable(),
  }).strict(),
  summary: z.object({
    state: z.enum(SUMMARY_STATES),
    source: z.enum(SUMMARY_SOURCES),
    textDigest: sha256Prefixed.nullable(),
    admissionStatus: nullableStr,
    provenanceChecksum: sha256Prefixed.nullable(),
    modelId: nullableStr,
    modelRevision: nullableStr,
    promptTemplateRevision: nullableStr,
    blockReasons: z.array(z.string().min(1)),
    hintClass: z.enum(['LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED']).nullable(),
    quality: z.object({ clean: z.boolean().nullable(), quarantined: z.boolean().nullable(), detectorRevision: nullableStr }).strict(),
    sourceAlignment: z.object({ status: z.enum(['CURRENT_LINEAGE_EXACT', 'UNKNOWN']), sourceRevision: nullableStr, workspaceRevision: nullableStr }).strict(),
    generationAlignment: z.object({ status: z.literal('UNKNOWN'), inputDigest: z.null(), sourceRevision: z.null() }).strict(),
  }).strict(),
  semantic: z.object({
    representationId: z.literal('semantic_768'),
    representationRevision: nullableStr,
    summaryEmbeddingAvailable: z.boolean(),
    vectorDigest: sha256Prefixed.nullable(),
    legacyUnboundVectorPresent: z.boolean(),
    legacy384Present: z.boolean(),
  }).strict(),
  routing: z.object({
    domainClass: nullableStr,
    communityId: z.number().int().nullable(),
    clusterId: z.number().int().nullable(),
    somCell: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
    pagerank: z.number().finite().nullable(),
    language: nullableStr,
    fileKind: nullableStr,
    structuralEvidenceAvailable: z.boolean(),
  }).strict(),
  evidenceRefs: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
}).strict();

export const SummaryRoutingPayloadV1Schema = body.extend({ payloadChecksum: sha256Prefixed }).strict().superRefine((v, ctx) => {
  const { payloadChecksum, ...rest } = v;
  if (payloadChecksum !== `sha256:${canonicalSha256V1(rest)}`) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payloadChecksum'], message: 'payloadChecksum does not match payload body' });
  if (v.summary.state === 'CURRENT' && (v.summary.source !== 'CANONICAL_SUMMARY_TEXT' || !v.summary.textDigest || v.summary.admissionStatus !== 'ADMITTED')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary'], message: 'CURRENT requires CANONICAL_SUMMARY_TEXT, textDigest and ADMITTED' });
  }
  if (v.summary.state === 'MISSING' && v.summary.source !== 'NONE') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'source'], message: 'MISSING must have source NONE' });
  if (v.semantic.summaryEmbeddingAvailable && (v.summary.state !== 'CURRENT' || !v.semantic.vectorDigest || !v.semantic.representationRevision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic'], message: 'an available summary embedding requires a CURRENT summary, vectorDigest and representationRevision' });
  }
});
export type SummaryRoutingPayloadV1 = z.infer<typeof SummaryRoutingPayloadV1Schema>;

export interface SummaryRoutingCompileInputV1 {
  identity: z.input<typeof body>['identity'];
  /** codebase_chunk_index.summary_text / summary_provenance (canonical admitted surface) */
  summaryText: string | null;
  summaryProvenance: Record<string, unknown> | null;
  /** legacy HINT texts, in priority order handled here: chunk summary, packet summary, summary layer */
  legacyChunkSummary: string | null;
  packetSummary: string | null;
  layerSummary: string | null;
  /** codebase_chunk_index.summary_embedding presence + summary_embedding_meta (jsonb) */
  summaryEmbeddingPresent: boolean;
  summaryEmbeddingMeta: Record<string, unknown> | null;
  summaryEmbedding384Present: boolean;
  /** legacy chunk summary integrity (caller runs the shared detector + reads phase8_5_quarantine); absent => quality unknown */
  legacyQuality?: { clean: boolean; quarantined: boolean; detectorRevision: string } | null;
  routing: Partial<z.input<typeof body>['routing']>;
  evidenceRefs?: readonly string[];
}

const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const has = (t: string | null) => typeof t === 'string' && t.trim().length > 0;

export function compileSummaryRoutingPayloadV1(input: SummaryRoutingCompileInputV1): SummaryRoutingPayloadV1 {
  const id = input.identity;
  const reasons: string[] = [];
  let state: (typeof SUMMARY_STATES)[number]; let source: (typeof SUMMARY_SOURCES)[number];
  let hintClass: 'LEGACY_HINT_LINEAGE_BOUND' | 'LEGACY_HINT_UNQUALIFIED' | null = null;
  let textDigest: string | null = null; let admissionStatus: string | null = null; let provenanceChecksum: string | null = null;
  const prov = input.summaryProvenance;
  const admission = (prov?.admission ?? null) as Record<string, unknown> | null;

  if (has(input.summaryText)) {
    source = 'CANONICAL_SUMMARY_TEXT';
    textDigest = sha(input.summaryText as string);
    admissionStatus = str(admission?.status);
    if (!prov) reasons.push('PROVENANCE_MISSING');
    else {
      if (admissionStatus !== 'ADMITTED') reasons.push('NOT_ADMITTED');
      if (prov.sourceRevision !== id.sourceRevision) reasons.push('SOURCE_REVISION_MISMATCH');
      if (prov.workspaceRevision !== id.workspaceRevision) reasons.push('WORKSPACE_REVISION_MISMATCH');
      if (prov.summaryDigest !== textDigest) reasons.push('SUMMARY_DIGEST_MISMATCH');
      provenanceChecksum = `sha256:${canonicalSha256V1(prov)}`;
    }
    // LEGACY_CARRIED: a lineage-bound legacy summary the operator chose to persist; usable, but never CURRENT
    // (its generation input digest was never recorded). Only its non-ADMITTED status is tolerated here.
    const carried = admissionStatus === 'LEGACY_CARRIED';
    if (carried) { const i = reasons.indexOf('NOT_ADMITTED'); if (i >= 0) reasons.splice(i, 1); }
    state = reasons.length === 0 ? (carried ? 'HINT' : 'CURRENT') : 'BLOCKED';
  } else if (has(input.legacyChunkSummary)) {
    // quarantine overrides the detector; a quarantined or contaminated legacy summary is BLOCKED, never a hint
    source = 'LEGACY_CHUNK_SUMMARY'; textDigest = sha(input.legacyChunkSummary as string);
    const q = input.legacyQuality ?? null;
    if (q?.quarantined) { state = 'BLOCKED'; reasons.push('LEGACY_QUARANTINED'); }
    else if (q && !q.clean) { state = 'BLOCKED'; reasons.push('LEGACY_CONTAMINATED'); }
    else { state = 'HINT'; hintClass = 'LEGACY_HINT_LINEAGE_BOUND'; }
  }
  else if (has(input.packetSummary)) { state = 'HINT'; source = 'PACKET_SUMMARY'; textDigest = sha(input.packetSummary as string); }
  else if (has(input.layerSummary)) { state = 'HINT'; source = 'SUMMARY_LAYER'; textDigest = sha(input.layerSummary as string); }
  else { state = 'MISSING'; source = 'NONE'; }

  const meta = input.summaryEmbeddingMeta;
  const bound = state === 'CURRENT' && input.summaryEmbeddingPresent && !!meta
    && meta.representationId === 'semantic_768' && meta.summaryInputDigest === textDigest && !!str(meta.representationRevision) && typeof meta.vectorDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(meta.vectorDigest);
  const p = (prov ?? {}) as Record<string, unknown>;
  const body_ = {
    schema: 'atlas.summary-routing-payload.v1' as const,
    identity: id,
    summary: {
      state, source, textDigest, admissionStatus, provenanceChecksum,
      modelId: source === 'CANONICAL_SUMMARY_TEXT' ? str(p.modelId) : null,
      modelRevision: source === 'CANONICAL_SUMMARY_TEXT' ? str(p.modelRevision) : null,
      promptTemplateRevision: source === 'CANONICAL_SUMMARY_TEXT' ? str(p.promptTemplateRevision) : null,
      blockReasons: reasons,
      hintClass,
      quality: { clean: input.legacyQuality?.clean ?? null, quarantined: input.legacyQuality?.quarantined ?? null, detectorRevision: input.legacyQuality?.detectorRevision ?? null },
      sourceAlignment: hintClass === 'LEGACY_HINT_LINEAGE_BOUND'
        ? { status: 'CURRENT_LINEAGE_EXACT' as const, sourceRevision: id.sourceRevision, workspaceRevision: id.workspaceRevision }
        : { status: 'UNKNOWN' as const, sourceRevision: null, workspaceRevision: null },
      generationAlignment: { status: 'UNKNOWN' as const, inputDigest: null, sourceRevision: null },
    },
    semantic: {
      representationId: 'semantic_768' as const,
      representationRevision: bound ? str(meta!.representationRevision) : null,
      summaryEmbeddingAvailable: !!bound,
      vectorDigest: bound ? (meta!.vectorDigest as string) : null,
      legacyUnboundVectorPresent: input.summaryEmbeddingPresent && !bound,
      legacy384Present: input.summaryEmbedding384Present,
    },
    routing: {
      domainClass: null, communityId: null, clusterId: null, somCell: null, pagerank: null, language: null, fileKind: null, structuralEvidenceAvailable: false,
      ...input.routing,
    },
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    canonicalAuthority: false as const,
  };
  return SummaryRoutingPayloadV1Schema.parse({ ...body_, payloadChecksum: `sha256:${canonicalSha256V1(body_)}` });
}

/** SUM-EMB-RMQ-01: identity-only job. No summary text in the message; consumer must re-read Postgres. */
export const SummaryEmbeddingJobV1Schema = z.object({
  schema: z.literal('atlas.summary-embedding-job.v1'),
  jobId: sha256Prefixed,
  chunkRowId: z.string().uuid(),
  canonicalChunkId: z.string().min(1),
  packetKey: nullableStr,
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  summaryDigest: sha256Prefixed,
  routingPayloadChecksum: sha256Prefixed,
  representationId: z.literal('semantic_768'),
  producerRevision: z.string().min(1),
}).strict();
export type SummaryEmbeddingJobV1 = z.infer<typeof SummaryEmbeddingJobV1Schema>;

/** Returns null unless the summary is CURRENT and has no bound summary vector yet. */
export function projectSummaryEmbeddingJobV1(payload: SummaryRoutingPayloadV1, producerRevision: string): SummaryEmbeddingJobV1 | null {
  const p = SummaryRoutingPayloadV1Schema.parse(payload);
  if (p.summary.state !== 'CURRENT' || p.summary.textDigest === null || p.semantic.summaryEmbeddingAvailable) return null;
  const jobId = `sha256:${canonicalSha256V1({ chunkRowId: p.identity.chunkRowId, sourceRevision: p.identity.sourceRevision, summaryDigest: p.summary.textDigest, representationId: 'semantic_768' })}`;
  return SummaryEmbeddingJobV1Schema.parse({
    schema: 'atlas.summary-embedding-job.v1', jobId, chunkRowId: p.identity.chunkRowId, canonicalChunkId: p.identity.canonicalChunkId, packetKey: p.identity.packetKey,
    sourceRef: p.identity.sourceRef, sourceRevision: p.identity.sourceRevision, workspaceRevision: p.identity.workspaceRevision,
    summaryDigest: p.summary.textDigest, routingPayloadChecksum: p.payloadChecksum, representationId: 'semantic_768', producerRevision,
  });
}
