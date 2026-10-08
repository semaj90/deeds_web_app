import { z } from 'zod';
import {
  CHUNK_RETRIEVAL_PROFILE_ADAPTER_V1,
  ChunkRetrievalIdentityInputV1Schema,
  hydrateChunkRetrievalProfileV1,
  type ChunkRetrievalProfileHydrationResultV1,
} from './chunk-retrieval-profile-adapter-v1.js';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

export const SidecarStructuralObservationV1Schema = z.object({
  schema: z.literal('atlas.sidecar-structural-observation.v1'),
  engine: z.literal('treesitter-chunker'),
  engineRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  sourceRevision: sha256Revision,
  language: z.string().min(1),
  upstreamChunkId: z.string().min(1),
  nodeType: z.string().min(1),
  symbolKind: z.string().min(1).nullable(),
  symbolName: z.string().min(1).nullable(),
  astPath: z.array(z.string().min(1)).default([]),
  calls: z.array(z.string().min(1)).default([]),
  imports: z.array(z.string().min(1)).default([]),
  exports: z.array(z.string().min(1)).default([]),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  syntaxStatus: z.enum(['CLEAN', 'RECOVERED_WITH_ERRORS']),
  canonicalAuthority: z.literal(false),
}).strict();
export type SidecarStructuralObservationV1 = z.infer<typeof SidecarStructuralObservationV1Schema>;

export const SidecarDomainObservationV1Schema = z.object({
  schema: z.literal('atlas.sidecar-domain-observation.v1'),
  producerRevision: z.string().min(1),
  classifierRevision: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  primaryDomain: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  status: z.enum(['ADMITTED', 'SHADOW_ONLY']),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  canonicalAuthority: z.literal(false),
}).strict();
export type SidecarDomainObservationV1 = z.infer<typeof SidecarDomainObservationV1Schema>;

export const SidecarChunkProfileBridgeInputV1Schema = z.object({
  schema: z.literal('atlas.sidecar-chunk-profile-bridge-input.v1'),
  identity: ChunkRetrievalIdentityInputV1Schema,
  featureRevision: z.string().min(1),
  structural: SidecarStructuralObservationV1Schema,
  domain: SidecarDomainObservationV1Schema.nullable().default(null),
  canonicalAuthority: z.literal(false),
}).strict();
export type SidecarChunkProfileBridgeInputV1 = z.infer<typeof SidecarChunkProfileBridgeInputV1Schema>;

export const SidecarChunkProfileBridgeResultV1Schema = z.object({
  schema: z.literal('atlas.sidecar-chunk-profile-bridge-result.v1'),
  profile: z.unknown(),
  structuralAccepted: z.boolean(),
  domainAccepted: z.boolean(),
  domainObservationStatus: z.enum(['ADMITTED', 'SHADOW_ONLY', 'ABSENT']),
  rejections: z.array(z.string()),
  writesPerformed: z.literal(false),
  canonicalAuthorityChanged: z.literal(false),
}).strict();

export type SidecarChunkProfileBridgeResultV1 =
  Omit<z.infer<typeof SidecarChunkProfileBridgeResultV1Schema>, 'profile'>
  & { profile: ChunkRetrievalProfileHydrationResultV1['profile'] };

export function bridgeSidecarChunkToRetrievalProfileV1(
  raw: SidecarChunkProfileBridgeInputV1,
): SidecarChunkProfileBridgeResultV1 {
  const input = SidecarChunkProfileBridgeInputV1Schema.parse(raw);
  const rejections: string[] = [];

  if (input.structural.sourceRevision !== input.identity.sourceRevision) {
    throw new Error('SIDECAR_SOURCE_REVISION_MISMATCH');
  }

  if (input.structural.syntaxStatus !== 'CLEAN') {
    rejections.push('STRUCTURAL_RECOVERED_WITH_ERRORS');
  }

  const domainAccepted = input.domain?.status === 'ADMITTED';
  if (input.domain?.status === 'SHADOW_ONLY') {
    rejections.push('DOMAIN_SHADOW_ONLY_NOT_ADMITTED');
  }

  const hydration = hydrateChunkRetrievalProfileV1({
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_ADAPTER_V1,
    identity: input.identity,
    featureRevision: input.featureRevision,
    lexicalStructural: {
      language: input.structural.language,
      symbolKind: input.structural.symbolKind,
      symbolName: input.structural.symbolName,
      astNodeType: input.structural.nodeType,
      astPath: input.structural.astPath,
      calls: input.structural.calls,
      imports: input.structural.imports,
      exports: input.structural.exports,
    },
    ...(domainAccepted && input.domain ? {
      domainTopic: {
        primaryDomain: input.domain.primaryDomain,
        domainConfidence: input.domain.confidence,
        topicIds: [],
        classifierRevision: input.domain.classifierRevision,
      },
    } : {}),
    evidenceRefs: [
      ...input.structural.evidenceRefs,
      ...(input.domain?.evidenceRefs ?? []),
    ],
  });

  return {
    schema: 'atlas.sidecar-chunk-profile-bridge-result.v1',
    profile: hydration.profile,
    structuralAccepted: true,
    domainAccepted,
    domainObservationStatus: input.domain?.status ?? 'ABSENT',
    rejections,
    writesPerformed: false,
    canonicalAuthorityChanged: false,
  };
}
