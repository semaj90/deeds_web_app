import { z } from 'zod';
import crypto from 'crypto';

export const LexicalFeaturesSchema = z.object({
  tokens: z.array(z.string()),
  tokenCount: z.number().int().nonnegative().optional(),
  uniqueTokens: z.number().int().nonnegative().optional(),
  tf_idf: z.record(z.string(), z.number()).optional(),
});

export const PathFeaturesSchema = z.object({
  segments: z.array(z.string()).optional(),
  fileExtension: z.string().nullable().optional(),
  depth: z.number().int().nonnegative().optional(),
});

export const IdentifierFeaturesSchema = z.object({
  exported: z.array(z.string()).optional(),
  imported: z.array(z.string()).optional(),
  local: z.array(z.string()).optional(),
});

export const ImportFeaturesSchema = z.object({
  modules: z.array(z.string()).optional(),
  frameworks: z.array(z.string()).optional(),
  relativeImports: z.number().int().nonnegative().optional(),
});

export const SyntaxFeaturesSchema = z.object({
  language: z.string().nullable().optional(),
  symbolKinds: z.array(z.string()).optional(),
  decorators: z.array(z.string()).optional(),
  callTargets: z.array(z.string()).optional(),
  astNodeCount: z.number().int().nonnegative().optional(),
});

export const SemanticFeaturesSchema = z.object({
  embeddingModel: z.string().optional(),
  embeddingDimensions: z.number().int().positive().optional(),
  embeddingRef: z.string().nullable().optional(),
  nearestDomainLabels: z.array(z.string()).optional(),
  nearestDomainDistances: z.array(z.number()).optional(),
});

export const TopologyFeaturesSchema = z.object({
  kmeansClusterId: z.number().int().nullable().optional(),
  somX: z.number().int().min(0).max(19).nullable().optional(),
  somY: z.number().int().min(0).max(19).nullable().optional(),
  communityId: z.string().nullable().optional(),
  pageRank: z.number().nonnegative().nullable().optional(),
  degree: z.number().int().nonnegative().nullable().optional(),
});

export const ProvenanceSchema = z.object({
  sourceContentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().min(1),
  featureSchemaVersion: z.string().optional(),
  featureMaterializationTime: z.string().datetime(),
  reproducible: z.boolean().optional(),
});

export const DomainFeaturePacketSchema = z.object({
  schemaId: z.literal('atlas:domain:features'),
  schemaVersion: z.literal('1.0.0'),
  packetKey: z.string().min(8),
  featureSchemaVersion: z.string().min(1),
  lexical: LexicalFeaturesSchema,
  path: PathFeaturesSchema.optional(),
  identifiers: IdentifierFeaturesSchema.optional(),
  imports: ImportFeaturesSchema.optional(),
  syntax: SyntaxFeaturesSchema.optional(),
  semantic: SemanticFeaturesSchema.optional(),
  topology: TopologyFeaturesSchema.optional(),
  provenance: ProvenanceSchema,
});

export type LexicalFeatures = z.infer<typeof LexicalFeaturesSchema>;
export type PathFeatures = z.infer<typeof PathFeaturesSchema>;
export type IdentifierFeatures = z.infer<typeof IdentifierFeaturesSchema>;
export type ImportFeatures = z.infer<typeof ImportFeaturesSchema>;
export type SyntaxFeatures = z.infer<typeof SyntaxFeaturesSchema>;
export type SemanticFeatures = z.infer<typeof SemanticFeaturesSchema>;
export type TopologyFeatures = z.infer<typeof TopologyFeaturesSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type DomainFeaturePacket = z.infer<typeof DomainFeaturePacketSchema>;

/**
 * Validate and construct domain feature packet.
 */
export function createDomainFeaturePacket(input: unknown): DomainFeaturePacket {
  return DomainFeaturePacketSchema.parse(input);
}

/**
 * Hash feature tokens for vocabulary reproducibility.
 */
export function hashFeatureVocabulary(tokens: string[]): string {
  const sorted = [...new Set(tokens)].sort();
  return crypto.createHash('sha256').update(sorted.join('\n'), 'utf8').digest('hex');
}
