import crypto from 'node:crypto';
import { z } from 'zod';
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import { ontologyKey } from '$lib/server/cache-keys.js';
import {
  OntologyLinkedTupleEvidenceStateSchema,
  OntologyLinkedTupleLabelKindSchema,
  OntologyLinkedTupleLabelSourceSchema,
  type OntologyLinkedTupleV1,
} from './contracts/ontology-linked-tuple-v1.js';

export const OntologyTupleTrustTierSchema = z.enum(['canonical', 'derived', 'untrusted']);
export type OntologyTupleTrustTier = z.infer<typeof OntologyTupleTrustTierSchema>;

export const OntologyLinkedTupleCacheRecordSchema = z
  .object({
    schemaVersion: z.literal('ontology-linked-tuple-cache.v1'),
    tupleId: z.string().min(1),
    packetId: z.string().min(1),
    featureId: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRefHash: z.string().regex(/^[a-f0-9]{16}$/i),
    relation: z.string().min(1),
    target: z.string().min(1),
    label: z.string().min(1),
    labelKind: OntologyLinkedTupleLabelKindSchema,
    labelSource: OntologyLinkedTupleLabelSourceSchema,
    ontologyIds: z.array(z.string().min(1)).max(32),
    conceptIds: z.array(z.string().min(1)).max(32),
    evidenceState: OntologyLinkedTupleEvidenceStateSchema,
    trustTier: OntologyTupleTrustTierSchema,
    blockedContentHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/i)).max(32),
    centroid: z.object({
      domainClass: z.string().min(1),
      domainCentroidKey: z.string().min(1),
      featureCentroidKey: z.string().min(1).nullable().optional(),
      kmeansCentroidKey: z.string().min(1).nullable().optional(),
      somCentroidKey: z.string().min(1).nullable().optional(),
      communityCentroidKey: z.string().min(1).nullable().optional(),
      somCluster: z.string().nullable(),
      somRow: z.number().int().nullable(),
      somCol: z.number().int().nullable(),
      kmeansClusters: z.array(z.number().int().nonnegative()),
      ontologyTags: z.array(z.string().min(1)),
    }),
    revisions: z.object({
      workspaceRevision: z.string().min(1),
      ontologyVersion: z.string().min(1).nullable(),
      centroidVersion: z.string().min(1).nullable(),
      packetRevision: z.string().min(1).nullable(),
    }),
  })
  .strict();

export type OntologyLinkedTupleCacheRecord = z.infer<typeof OntologyLinkedTupleCacheRecordSchema>;

export const OntologyLinkedTupleCachePlanSchema = z
  .object({
    schemaVersion: z.literal('ontology-linked-tuple-cache-plan.v1'),
    packetId: z.string().min(1),
    featureId: z.string().min(1),
    sourceRefHash: z.string().regex(/^[a-f0-9]{16}$/i),
    tupleKeys: z.array(z.string().min(1)).max(64),
    tokenMapKey: z.string().min(1),
    blockedHashesKey: z.string().min(1),
    records: z.array(OntologyLinkedTupleCacheRecordSchema).max(64),
  })
  .strict();

export type OntologyLinkedTupleCachePlan = z.infer<typeof OntologyLinkedTupleCachePlanSchema>;

type RedisPipelineLike = {
  set: (key: string, value: string, mode?: string, ttlSeconds?: number) => RedisPipelineLike;
  exec: () => Promise<unknown>;
};

type RedisLike = {
  pipeline: () => RedisPipelineLike;
};

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function shortHash(input: string): string {
  return sha256Hex(input).slice(0, 16);
}

function deriveTrustTier(input: {
  evidenceState: OntologyLinkedTupleV1['evidenceState'];
  ontologyIds: string[];
  conceptIds: string[];
  centroid?: { domainClass?: string | null; somCluster?: string | null; kmeansClusters?: number[] };
}): OntologyTupleTrustTier {
  if (input.evidenceState === 'FAILED' || input.evidenceState === 'SUPERSEDED') return 'untrusted';
  if (input.evidenceState === 'ACTIVE_VERIFIED' && input.ontologyIds.length > 0 && input.conceptIds.length > 0) {
    return 'canonical';
  }
  if (input.centroid?.domainClass || input.centroid?.somCluster || (input.centroid?.kmeansClusters?.length ?? 0) > 0) {
    return 'derived';
  }
  return 'untrusted';
}

export function buildOntologyLinkedTupleCachePlan(input: {
  packetId: string;
  packetRevision?: string | null;
  featureId: string;
  sourceRef: string;
  tuples: OntologyLinkedTupleV1[];
  centroid: {
    domainClass: string;
    domainCentroidKey: string;
    featureCentroidKey?: string | null;
    kmeansCentroidKey?: string | null;
    somCentroidKey?: string | null;
    communityCentroidKey?: string | null;
    somCluster: string | null;
    somRow: number | null;
    somCol: number | null;
    kmeansClusters: number[];
    ontologyTags: string[];
  };
  revisions: {
    workspaceRevision: string;
    ontologyVersion?: string | null;
    centroidVersion?: string | null;
  };
  blockedContentHashes?: string[];
}): OntologyLinkedTupleCachePlan {
  const packetId = String(input.packetId ?? '').trim();
  const featureId = String(input.featureId ?? '').trim();
  const sourceRef = String(input.sourceRef ?? '').trim();
  if (!packetId) throw new Error('packetId is required');
  if (!featureId) throw new Error('featureId is required');
  if (!sourceRef) throw new Error('sourceRef is required');

  const sourceRefHash = shortHash(sourceRef);
  const tokenMapKey = ontologyKey.tokenMap(featureId, sourceRefHash, packetId);
  const blockedHashesKey = ontologyKey.blockedContentHashes(input.revisions.workspaceRevision);
  const blockedContentHashes = Array.from(
    new Set((input.blockedContentHashes ?? []).map((value) => String(value).trim()).filter(Boolean))
  ).filter((value) => /^[a-f0-9]{64}$/i.test(value)).slice(0, 32);

  const records = input.tuples.map((tuple, index) => {
    const trustTier = deriveTrustTier({
      evidenceState: tuple.evidenceState,
      ontologyIds: tuple.ontologyIds,
      conceptIds: tuple.conceptIds,
      centroid: {
        domainClass: input.centroid.domainClass,
        somCluster: input.centroid.somCluster,
        kmeansClusters: input.centroid.kmeansClusters,
      },
    });

    return OntologyLinkedTupleCacheRecordSchema.parse({
      schemaVersion: 'ontology-linked-tuple-cache.v1',
      tupleId: tuple.tupleId,
      packetId,
      featureId,
      sourceRef,
      sourceRefHash,
      relation: tuple.labelKind === 'ontology' ? 'HAS_ONTOLOGY_TAG' : tuple.labelKind === 'pos' ? 'HAS_POS_TAG' : 'HAS_TAG',
      target: tuple.label,
      label: tuple.label,
      labelKind: tuple.labelKind,
      labelSource: tuple.labelSource,
      ontologyIds: tuple.ontologyIds,
      conceptIds: tuple.conceptIds,
      evidenceState: tuple.evidenceState,
      trustTier,
      blockedContentHashes,
      centroid: {
        domainClass: input.centroid.domainClass,
        domainCentroidKey: input.centroid.domainCentroidKey,
        featureCentroidKey: input.centroid.featureCentroidKey ?? null,
        kmeansCentroidKey: input.centroid.kmeansCentroidKey ?? null,
        somCentroidKey: input.centroid.somCentroidKey ?? null,
        communityCentroidKey: input.centroid.communityCentroidKey ?? null,
        somCluster: input.centroid.somCluster,
        somRow: input.centroid.somRow,
        somCol: input.centroid.somCol,
        kmeansClusters: input.centroid.kmeansClusters,
        ontologyTags: input.centroid.ontologyTags,
      },
      revisions: {
        workspaceRevision: input.revisions.workspaceRevision,
        ontologyVersion: input.revisions.ontologyVersion ?? null,
        centroidVersion: input.revisions.centroidVersion ?? null,
        packetRevision: input.packetRevision ?? null,
      },
    });
  });

  return OntologyLinkedTupleCachePlanSchema.parse({
    schemaVersion: 'ontology-linked-tuple-cache-plan.v1',
    packetId,
    featureId,
    sourceRefHash,
    tupleKeys: records.map((record) => ontologyKey.tuple(record.tupleId)),
    tokenMapKey,
    blockedHashesKey,
    records,
  });
}

export async function writeOntologyLinkedTupleCachePlan(
  plan: OntologyLinkedTupleCachePlan,
  ttlSeconds = 6 * 60 * 60,
  redis: RedisLike = getValkeyClient()
): Promise<void> {
  const pipeline = redis.pipeline();
  const sourceRefHashAlias = plan.sourceRefHash;

  for (const record of plan.records) {
    pipeline.set(ontologyKey.tuple(record.tupleId), JSON.stringify(record), 'EX', ttlSeconds);
  }

  const tokenMapRecord = {
    schemaVersion: 'ontology-token-map.v1',
    packetId: plan.packetId,
    featureId: plan.featureId,
    sourceRefHash: plan.sourceRefHash,
    tupleCount: plan.records.length,
    tupleKeys: plan.tupleKeys,
    canonicalLabels: plan.records
      .filter((record) => record.trustTier !== 'untrusted')
      .map((record) => record.label),
    blockedContentHashes: plan.records.flatMap((record) => record.blockedContentHashes),
    centroid: plan.records[0]?.centroid ?? null,
    revisions: plan.records[0]?.revisions ?? null,
    createdAt: new Date().toISOString(),
  };

  pipeline.set(plan.tokenMapKey, JSON.stringify(tokenMapRecord), 'EX', ttlSeconds);
  pipeline.set(
    ontologyKey.tokenMap(plan.featureId, sourceRefHashAlias, 'all'),
    JSON.stringify(tokenMapRecord),
    'EX',
    ttlSeconds
  );
  pipeline.set(
    plan.blockedHashesKey,
    JSON.stringify({
      schemaVersion: 'ontology-blocked-hashes.v1',
      workspaceRevision: plan.records[0]?.revisions.workspaceRevision ?? 'unknown',
      blockedContentHashes: Array.from(new Set(plan.records.flatMap((record) => record.blockedContentHashes))),
      updatedAt: new Date().toISOString(),
    }),
    'EX',
    ttlSeconds
  );

  await pipeline.exec();
}
