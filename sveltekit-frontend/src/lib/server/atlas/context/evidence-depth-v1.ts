import { z } from 'zod';

export const EvidenceDepthV1Schema = z.enum(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
export type EvidenceDepthV1 = z.infer<typeof EvidenceDepthV1Schema>;

export const EVIDENCE_DEPTH_KIND_V1 = {
  D0: 'TYPED_ORDINAL',
  D1: 'COMPACT_FEATURE_CARD',
  D2: 'LATENT_REPRESENTATION',
  D3: 'SEMANTIC_768',
  D4: 'PACKET_GROUNDED_ONTOLOGY_FACTS',
  D5: 'STRUCTURAL_NEIGHBORHOOD',
  D6: 'EXACT_SOURCE_SPANS',
} as const satisfies Record<EvidenceDepthV1, string>;

export const EvidenceDepthKindV1Schema = z.enum([
  'TYPED_ORDINAL',
  'COMPACT_FEATURE_CARD',
  'LATENT_REPRESENTATION',
  'SEMANTIC_768',
  'PACKET_GROUNDED_ONTOLOGY_FACTS',
  'STRUCTURAL_NEIGHBORHOOD',
  'EXACT_SOURCE_SPANS',
]);

export const EvidenceDepthAxisV1Schema = z.object({
  schema: z.literal('atlas.evidence-depth-axis.v1'),
  depth: EvidenceDepthV1Schema,
  kind: EvidenceDepthKindV1Schema,
  canonicalAuthority: z.literal(false),
}).strict();

export type EvidenceDepthAxisV1 = z.infer<typeof EvidenceDepthAxisV1Schema>;

export const EvidenceDepthExpansionRequestV1Schema = z.object({
  schema: z.literal('atlas.evidence-depth-expansion-request.v1'),
  contextManifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  fromDepth: EvidenceDepthV1Schema,
  targetDepth: EvidenceDepthV1Schema,
  targetRef: z.string().min(1),
  maxEvidenceRefs: z.number().int().min(1).max(64),
  maxBytes: z.number().int().min(1).max(262_144),
  canonicalAuthority: z.literal(false),
}).strict();

export type EvidenceDepthExpansionRequestV1 = z.infer<typeof EvidenceDepthExpansionRequestV1Schema>;

const EVIDENCE_DEPTH_ORDER: readonly EvidenceDepthV1[] = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'];

export function buildEvidenceDepthAxisV1(depth: EvidenceDepthV1): EvidenceDepthAxisV1 {
  return EvidenceDepthAxisV1Schema.parse({
    schema: 'atlas.evidence-depth-axis.v1',
    depth,
    kind: EVIDENCE_DEPTH_KIND_V1[depth],
    canonicalAuthority: false,
  });
}

export function buildEvidenceDepthExpansionRequestV1(
  input: Omit<EvidenceDepthExpansionRequestV1, 'schema' | 'canonicalAuthority'>,
): EvidenceDepthExpansionRequestV1 {
  if (EVIDENCE_DEPTH_ORDER.indexOf(input.targetDepth) <= EVIDENCE_DEPTH_ORDER.indexOf(input.fromDepth)) {
    throw new Error('evidence depth expansion must target a deeper evidence level');
  }
  return EvidenceDepthExpansionRequestV1Schema.parse({
    schema: 'atlas.evidence-depth-expansion-request.v1',
    ...input,
    canonicalAuthority: false,
  });
}
