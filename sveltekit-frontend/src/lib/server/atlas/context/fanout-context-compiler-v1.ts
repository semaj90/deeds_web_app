import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FanoutEvidenceBundleV1 } from './fanout-evidence-bundle-v1.js';

export const FanoutContextCompilerV1Schema = z.object({
  schema: z.literal('atlas.fanout-context-compiler.v1'),
  bundleChecksum: z.string().min(1),
  tokenizerRevision: z.string().min(1),
  tokenBudget: z.number().int().positive(),
  estimatedTokenCount: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string().min(1)),
  candidateOrdinals: z.array(z.number().int().nonnegative()),
  contextText: z.string(),
  contextManifestChecksum: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict();

export type FanoutContextCompilerV1 = z.infer<typeof FanoutContextCompilerV1Schema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function compileFanoutContextV1(input: {
  bundle: FanoutEvidenceBundleV1;
  estimatedTokenCount: number;
}): FanoutContextCompilerV1 {
  const { bundle, estimatedTokenCount } = input;
  if (estimatedTokenCount > bundle.summary.tokenBudget) throw new Error('FANOUT_TOKEN_BUDGET_EXCEEDED');

  const evidenceById = new Map(
    bundle.candidates.flatMap((candidate) => candidate.evidence.map((evidence) => [evidence.evidenceId, evidence] as const)),
  );
  const orderedEvidence = bundle.summary.evidenceOrder.map((id) => evidenceById.get(id)).filter(Boolean);
  if (orderedEvidence.length !== bundle.summary.evidenceOrder.length) throw new Error('FANOUT_EVIDENCE_ORDER_REFERENCE_MISSING');

  const evidenceRefs = orderedEvidence.map((evidence) => evidence!.evidenceId);
  const candidateOrdinals = [...new Set(bundle.candidates.map((candidate) => candidate.candidateOrdinal))].sort((a, b) => a - b);
  const body = {
    bundleChecksum: bundle.bundleChecksum,
    tokenizerRevision: bundle.summary.tokenizerRevision,
    tokenBudget: bundle.summary.tokenBudget,
    estimatedTokenCount,
    evidenceRefs,
    candidateOrdinals,
    contextText: bundle.summary.text,
    canonicalAuthority: false as const,
  };
  return FanoutContextCompilerV1Schema.parse({
    schema: 'atlas.fanout-context-compiler.v1',
    ...body,
    contextManifestChecksum: sha256(JSON.stringify(body)),
  });
}
