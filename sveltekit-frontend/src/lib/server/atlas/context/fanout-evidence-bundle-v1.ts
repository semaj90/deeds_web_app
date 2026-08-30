import { createHash } from 'node:crypto';
import { z } from 'zod';

const RevisionSchema = z.string().min(1);

export const FanoutEvidenceItemV1Schema = z.object({
  evidenceId: z.string().min(1),
  kind: z.enum(['LEXICAL', 'CONCEPT_HINT', 'DOMAIN_HINT', 'SEMANTIC', 'STRUCTURAL', 'COMPILER', 'ONTOLOGY', 'MULTIHOP', 'TOPOLOGY']),
  sourceRef: z.string().min(1),
  sourceRevision: RevisionSchema,
  extractorRevision: RevisionSchema,
  text: z.string().min(1),
  startByte: z.number().int().nonnegative().nullable(),
  endByte: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
}).strict();

export const FanoutEvidenceCandidateV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: RevisionSchema,
  evidence: z.array(FanoutEvidenceItemV1Schema),
}).strict();

export const FanoutEvidenceBundleV1Schema = z.object({
  schema: z.literal('atlas.fanout-evidence-bundle.v1'),
  workspaceRevision: z.string().startsWith('sha256:'),
  candidateSnapshotRevision: RevisionSchema,
  ordinalMapChecksum: RevisionSchema,
  representationRevisions: z.record(z.string(), RevisionSchema),
  edgePolicyRevision: RevisionSchema,
  maxHopDepth: z.number().int().min(0),
  candidates: z.array(FanoutEvidenceCandidateV1Schema),
  summary: z.object({
    tokenizerRevision: RevisionSchema,
    tokenBudget: z.number().int().positive(),
    text: z.string(),
    evidenceOrder: z.array(z.string()),
    checksum: RevisionSchema,
  }).strict(),
  canonicalAuthority: z.literal(false),
  bundleChecksum: RevisionSchema,
}).strict();

export type FanoutEvidenceBundleV1 = z.infer<typeof FanoutEvidenceBundleV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

export function buildFanoutEvidenceBundleV1(input: Omit<FanoutEvidenceBundleV1, 'bundleChecksum'>): FanoutEvidenceBundleV1 {
  const candidates = [...input.candidates]
    .map((candidate) => ({
      ...candidate,
      evidence: [...candidate.evidence].sort((a, b) => {
        const sourceOrder = a.sourceRef.localeCompare(b.sourceRef);
        if (sourceOrder !== 0) return sourceOrder;
        if (a.startByte === null && b.startByte !== null) return 1;
        if (a.startByte !== null && b.startByte === null) return -1;
        const byteOrder = (a.startByte ?? Number.MAX_SAFE_INTEGER) - (b.startByte ?? Number.MAX_SAFE_INTEGER);
        return byteOrder || a.evidenceId.localeCompare(b.evidenceId);
      }),
    }))
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  const normalized = { ...input, candidates };
  return FanoutEvidenceBundleV1Schema.parse({
    ...normalized,
    bundleChecksum: sha256(normalized),
  });
}

export function assertFanoutBundleRevisions(bundle: FanoutEvidenceBundleV1): void {
  const ordinals = new Set<number>();
  for (const candidate of bundle.candidates) {
    if (ordinals.has(candidate.candidateOrdinal)) throw new Error('FANOUT_DUPLICATE_CANDIDATE_ORDINAL');
    ordinals.add(candidate.candidateOrdinal);
    for (const evidence of candidate.evidence) {
      if (evidence.sourceRef !== candidate.sourceRef || evidence.sourceRevision !== candidate.sourceRevision) {
        throw new Error('FANOUT_EVIDENCE_SOURCE_LINEAGE_MISMATCH');
      }
    }
  }
}
