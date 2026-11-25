import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { z } from 'zod';
import { buildExternalDocContextManifestV1 } from './external-doc-context-manifest-v1.js';
import type { ExternalDocCitationReadbackV1 } from './external-doc-citation-readback-v1.js';
import type { ContextManifestTaskBindingV1Schema } from '../graph/context-manifest-v2.js';

type DocumentationTaskBindingV1 = z.infer<typeof ContextManifestTaskBindingV1Schema>;

const resultSchema = z.object({
  schema: z.literal('atlas.doc14-ace-dspy-predict-recommendation.v1'),
  status: z.literal('VERIFIED_CITATIONS_READY'),
  contextManifestChecksum: z.string(),
  answer: z.string().min(1).max(3000),
  synthesis: z.object({
    engine: z.literal('DSPY_PREDICT'),
    claimSupportStatus: z.literal('EXACT_QUOTE_MATCH_REVIEW_REQUIRED'),
    claimEvidence: z.array(z.object({
      chunkId: z.string(),
      claim: z.string().min(1),
      quote: z.string().min(1),
      startByte: z.number().int().nonnegative(),
      endByte: z.number().int().positive(),
    })).min(1).max(12),
  }),
});

/** Invoke the private process with evidence obtained during this server request. */
export async function recommendFromOfficialDocReadbackV1(input: {
  requestId: string;
  query: string;
  readback: ExternalDocCitationReadbackV1;
  taskBinding?: DocumentationTaskBindingV1;
  python: string | undefined;
  llamaUrl: string | undefined;
  repoRoot: string;
  signal?: AbortSignal;
}) {
  const blocked = (reason: string) => ({ status: 'BLOCKED', reason, recommendation: null });
  if (!input.python || !input.llamaUrl) return blocked('DOC14_DSPY_NOT_CONFIGURED');
  const manifest = buildExternalDocContextManifestV1({
    ...input, tokenBudget: 2048,
  });
  if (!manifest || manifest.v1.candidateCount > 4) return blocked('DOC14_CONTEXT_NOT_READY');
  const rows = input.readback.citations.map((citation) => ({
    manifestNodeKey: citation.chunkId,
    chunkId: citation.chunkId,
    sourceRef: citation.url,
    sourceRevision: citation.sourceRevision,
    evidenceRefs: [citation.chunkEvidenceRevision],
    chunkSha256: citation.chunkChecksum,
    text: citation.verifiedText,
    pgReadbackStatus: 'PROVEN',
    admissionStatus: 'INDEX_ELIGIBLE',
  }));
  const payload = JSON.stringify({ manifest, rows });
  if (Buffer.byteLength(payload) > 384 * 1024) return blocked('DOC14_CONTEXT_OVER_BYTE_LIMIT');

  try {
    const stdout = await new Promise<string>((accept, reject) => {
      const child = execFile(input.python!, [
        '-B', resolve(input.repoRoot, 'scripts/atlas/run-doc14-scoped-predict-v1.py'), input.llamaUrl!,
      ], {
        timeout: 45_000, maxBuffer: 64 * 1024, windowsHide: true, signal: input.signal,
      }, (error, output) => error ? reject(error) : accept(output));
      child.stdin?.on('error', reject);
      child.stdin?.end(payload, 'utf8');
    });
    const output: unknown = JSON.parse(stdout);
    const transportRefusal = z.object({
      schema: z.literal('atlas.dspy-predict-ace-recommendation.v1'),
      status: z.literal('ACE_VERIFIED_READBACK_TRANSPORT_NOT_CONFIGURED'),
      requestedIdentityChecksum: z.literal(manifest.identityChecksum),
      citationVerified: z.literal(false),
      canonicalAuthority: z.literal(false),
      writesPerformed: z.literal(false),
    }).safeParse(output);
    if (transportRefusal.success) return blocked(transportRefusal.data.status);

    const failure = z.object({ bridgeFailure: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/) }).safeParse(output);
    if (failure.success) return blocked(`DOC14_DSPY_RUNTIME_${failure.data.bridgeFailure}`);
    const rejection = z.object({
      status: z.literal('ACE_CONTEXT_REJECTED'),
      failure: z.string().regex(/^(ACE_CONTEXT|DSPY)_[A-Z_]{1,80}$/),
    }).safeParse(output);
    if (rejection.success) return blocked(rejection.data.failure);
    const result = resultSchema.safeParse(output);
    if (!result.success || result.data.contextManifestChecksum !== manifest.identityChecksum) {
      return blocked('DOC14_DSPY_RESULT_INVALID');
    }
    const citations = new Map(input.readback.citations.map((citation) => [citation.chunkId, citation]));
    const claims = result.data.synthesis.claimEvidence.map((item) => {
      const citation = citations.get(item.chunkId);
      if (!citation) throw new Error('DOC14_CLAIM_CHUNK_MISSING');
      const bytes = Buffer.from(citation.verifiedText, 'utf8');
      if (item.endByte > bytes.length || item.endByte <= item.startByte
        || !bytes.subarray(item.startByte, item.endByte).equals(Buffer.from(item.quote, 'utf8'))) {
        throw new Error('DOC14_CLAIM_BYTES_MISMATCH');
      }
      return { ...item, startByte: item.startByte + citation.startByte, endByte: item.endByte + citation.startByte };
    });
    if (claims.map(({ claim }) => claim.trim()).join(' ') !== result.data.answer) {
      return blocked('DOC14_DSPY_ANSWER_MISMATCH');
    }
    return {
      status: 'EXACT_QUOTE_MATCH_REVIEW_REQUIRED',
      reason: null,
      recommendation: { answer: result.data.answer, claims, contextManifestChecksum: manifest.identityChecksum },
    };
  } catch {
    return blocked('DOC14_DSPY_OR_CITATION_CHECK_FAILED');
  }
}
