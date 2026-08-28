import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256 = z.string().startsWith('sha256:');

export const AtlasExternalResearchEvidenceRecordV1Schema = z.object({
  schema: z.literal('atlas.external-research-evidence.v1'),
  externalEvidenceId: z.string().startsWith('sha256:'),
  pointId: z.string().min(1),
  parentExternalId: z.string().min(1),
  segmentIndex: z.number().int().nonnegative(),
  source: z.string().min(1),
  url: z.string().url().nullable(),
  title: z.string().nullable(),
  text: z.string().min(1),
  contentChecksum: sha256,
  fetchedAt: z.string().datetime({ offset: true }),
  provenanceClass: z.literal('EXTERNAL_CITED'),
  retrievalScore: z.number().finite(),
  retrievalRank: z.number().int().positive(),
  retrievalOwner: z.literal('go-retrieval'),
  collection: z.literal('chunks_web_search'),
  vectorName: z.literal('content'),
  embeddingDimension: z.literal(768),
  embeddingRevision: z.string().min(1),
  candidateOrdinal: z.null(),
  packetKey: z.null(),
  workspaceRevision: z.null(),
  sourceRevision: z.null(),
  canonicalAuthority: z.literal(false),
  localSourceGrounding: z.literal(false),
  mutationAuthority: z.literal(false),
}).strict();

export type AtlasExternalResearchEvidenceRecordV1 = z.infer<typeof AtlasExternalResearchEvidenceRecordV1Schema>;

export const AtlasExternalResearchEvidenceSetV1Schema = z.object({
  schema: z.literal('atlas.external-research-evidence-set.v1'),
  requestId: z.string().min(1),
  queryDigest: sha256,
  filterDigest: sha256,
  retrievalOwner: z.literal('go-retrieval'),
  collection: z.literal('chunks_web_search'),
  embeddingRevision: z.string().min(1),
  resultCount: z.number().int().nonnegative(),
  evidence: z.array(AtlasExternalResearchEvidenceRecordV1Schema),
  evidenceSetChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict();

export type AtlasExternalResearchEvidenceSetV1 = z.infer<typeof AtlasExternalResearchEvidenceSetV1Schema>;

/**
 * Deterministic diversity admission before ACE card selection.
 * This is a derived selection, never canonical evidence authority.
 */
export function selectExternalResearchEvidenceForAce(
  evidence: AtlasExternalResearchEvidenceRecordV1[],
  options: { maxCards?: number; perParentLimit?: number } = {},
): AtlasExternalResearchEvidenceRecordV1[] {
  const maxCards = options.maxCards ?? 6;
  const perParentLimit = options.perParentLimit ?? 2;
  if (maxCards < 1 || perParentLimit < 1) throw new Error('EXTERNAL_ACE_DIVERSITY_LIMIT_INVALID');
  const seenPoints = new Set<string>();
  const seenContent = new Set<string>();
  const parentCounts = new Map<string, number>();
  const selected: AtlasExternalResearchEvidenceRecordV1[] = [];
  const ordered = [...evidence].sort((a, b) => (
    a.retrievalRank - b.retrievalRank ||
    a.parentExternalId.localeCompare(b.parentExternalId) ||
    a.segmentIndex - b.segmentIndex ||
    a.pointId.localeCompare(b.pointId)
  ));
  for (const item of ordered) {
    if (selected.length >= maxCards) break;
    if (seenPoints.has(item.pointId) || seenContent.has(item.contentChecksum)) continue;
    const count = parentCounts.get(item.parentExternalId) ?? 0;
    if (count >= perParentLimit) continue;
    seenPoints.add(item.pointId);
    seenContent.add(item.contentChecksum);
    parentCounts.set(item.parentExternalId, count + 1);
    selected.push(item);
  }
  return selected;
}

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

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

export function buildExternalEvidenceRecordV1(input: Omit<AtlasExternalResearchEvidenceRecordV1, 'schema' | 'externalEvidenceId'>): AtlasExternalResearchEvidenceRecordV1 {
  const identity = {
    pointId: input.pointId,
    contentChecksum: input.contentChecksum,
    source: input.source,
    parentExternalId: input.parentExternalId,
    segmentIndex: input.segmentIndex,
  };
  return AtlasExternalResearchEvidenceRecordV1Schema.parse({
    schema: 'atlas.external-research-evidence.v1',
    ...input,
    externalEvidenceId: digest(identity),
  });
}

export function buildExternalEvidenceSetV1(input: {
  requestId: string;
  query: string;
  filter: unknown;
  embeddingRevision: string;
  evidence: AtlasExternalResearchEvidenceRecordV1[];
}): AtlasExternalResearchEvidenceSetV1 {
  const evidence = [...input.evidence].sort((a, b) => (
    a.retrievalRank - b.retrievalRank ||
    a.parentExternalId.localeCompare(b.parentExternalId) ||
    a.segmentIndex - b.segmentIndex ||
    a.pointId.localeCompare(b.pointId)
  ));
  const payload = {
    schema: 'atlas.external-research-evidence-set.v1' as const,
    requestId: input.requestId,
    queryDigest: digest(input.query),
    filterDigest: digest(input.filter),
    retrievalOwner: 'go-retrieval' as const,
    collection: 'chunks_web_search' as const,
    embeddingRevision: input.embeddingRevision,
    resultCount: evidence.length,
    evidence,
    canonicalAuthority: false as const,
  };
  return AtlasExternalResearchEvidenceSetV1Schema.parse({
    ...payload,
    evidenceSetChecksum: digest({
      queryDigest: payload.queryDigest,
      filterDigest: payload.filterDigest,
      embeddingRevision: payload.embeddingRevision,
      evidence: evidence.map((item) => ({
        externalEvidenceId: item.externalEvidenceId,
        retrievalScore: item.retrievalScore,
        retrievalRank: item.retrievalRank,
      })),
    }),
  });
}
