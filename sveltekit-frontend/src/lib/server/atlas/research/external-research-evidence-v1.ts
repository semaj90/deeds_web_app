import { createHash } from 'node:crypto';
import { z } from 'zod';

const ExternalSourceKindSchema = z.enum([
  'github_issue',
  'github_code',
  'github_repo',
  'reddit_post',
  'web_page',
  'official_docs',
]);

export const AtlasExternalResearchEvidenceV1Schema = z.object({
  schema: z.literal('atlas.external-research-evidence.v1'),
  queryId: z.string().min(1),
  sourceKind: ExternalSourceKindSchema,
  externalId: z.string().min(1),
  url: z.string().url().nullable(),
  title: z.string().nullable(),
  text: z.string().min(1),
  semanticScore: z.number().finite().min(0).max(1),
  fetchedAt: z.string().datetime({ offset: true }).nullable(),
  retrievalRevision: z.string().min(1),
  evidenceChecksum: z.string().startsWith('sha256:'),
  canonicalAuthority: z.literal(false),
  localSourceAuthority: z.literal(false),
  mutationAuthority: z.literal(false),
}).strict();

export type AtlasExternalResearchEvidenceV1 = z.infer<typeof AtlasExternalResearchEvidenceV1Schema>;

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

export interface ExternalResearchEvidenceInputV1 {
  queryId: string;
  sourceKind: AtlasExternalResearchEvidenceV1['sourceKind'];
  externalId: string;
  url?: string | null;
  title?: string | null;
  text: string;
  semanticScore: number;
  fetchedAt?: string | null;
  retrievalRevision: string;
}

const ExternalResearchEvidenceInputSchema = z.object({
  queryId: z.string().min(1),
  sourceKind: ExternalSourceKindSchema,
  externalId: z.string().min(1),
  url: z.string().url().nullable().optional(),
  title: z.string().nullable().optional(),
  text: z.string().min(1),
  semanticScore: z.number().finite().min(0).max(1),
  fetchedAt: z.string().datetime({ offset: true }).nullable().optional(),
  retrievalRevision: z.string().min(1),
}).strict();

export function buildAtlasExternalResearchEvidenceV1(
  input: ExternalResearchEvidenceInputV1,
): AtlasExternalResearchEvidenceV1 {
  const validated = ExternalResearchEvidenceInputSchema.parse(input);
  const body = {
    schema: 'atlas.external-research-evidence.v1' as const,
    queryId: validated.queryId,
    sourceKind: validated.sourceKind,
    externalId: validated.externalId,
    url: validated.url ?? null,
    title: validated.title ?? null,
    text: validated.text,
    semanticScore: validated.semanticScore,
    fetchedAt: validated.fetchedAt ?? null,
    retrievalRevision: validated.retrievalRevision,
    canonicalAuthority: false as const,
    localSourceAuthority: false as const,
    mutationAuthority: false as const,
  };

  return AtlasExternalResearchEvidenceV1Schema.parse({
    ...body,
    evidenceChecksum: sha256(body),
  });
}
