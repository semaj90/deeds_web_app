import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve, sep } from 'node:path';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, pool } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { loadBindingProvenanceV1 } from '$lib/server/atlas/identity/symbol-revision-qualification-v1.js';
import {
  CanonicalFeatureLabelSchema,
  getFeatureTaxonomyEntry,
  type CanonicalFeatureLabel,
} from './feature-taxonomy-v1.js';

const candidateSchema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceBytesSha256: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevisionKey: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  workspaceBinding: z.object({
    canonicalSourceRef: z.string().min(1),
    workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  qualification: z.literal('SOURCE_BYTES_AND_WORKSPACE_BINDING_MATCH_NOT_ADMITTED'),
}).strict();

const rejectionSchema = z.object({
  sourceRef: z.string().min(1),
  reason: z.enum([
    'LOCAL_SOURCE_UNAVAILABLE',
    'PACKET_NOT_FOUND',
    'SOURCE_REVISION_MISMATCH',
    'PACKET_IDENTITY_INCOMPLETE',
    'MULTIPLE_MATCHING_PACKETS',
    'WORKSPACE_BINDING_MISMATCH',
  ]),
}).strict();

export const FeatureAnchorPacketEvidenceV1Schema = z.object({
  schema: z.literal('atlas.feature-anchor-packet-evidence.v1'),
  featureLabel: CanonicalFeatureLabelSchema,
  status: z.enum(['CANDIDATES_FOUND', 'NO_QUALIFIED_PACKET', 'UNAVAILABLE']),
  candidates: z.array(candidateSchema),
  rejections: z.array(rejectionSchema),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type FeatureAnchorPacketEvidenceV1 = z.infer<typeof FeatureAnchorPacketEvidenceV1Schema>;

export interface FeatureAnchorPacketRowV1 {
  packetKey: string | null;
  sourceRef: string;
  sourceRevision: string | null;
  workspaceRevisionKey: string | null;
}

export interface FeatureAnchorWorkspaceBindingV1 {
  canonicalSourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  contentDigest: string;
}

function sourceRefVariants(sourceRef: string): string[] {
  return [sourceRef, `sveltekit-frontend/${sourceRef}`];
}

async function hashLocalSource(sourceRef: string): Promise<string | null> {
  const normalized = sourceRef.replace(/\\/g, '/');
  if (!normalized.startsWith('src/') || normalized.split('/').includes('..')) return null;

  const root = resolve(process.cwd());
  const absolutePath = resolve(root, normalized);
  if (!absolutePath.startsWith(`${root}${sep}`)) return null;

  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
    return hash.digest('hex');
  } catch {
    return null;
  }
}

export function buildFeatureAnchorPacketEvidenceV1(input: {
  featureLabel: CanonicalFeatureLabel;
  sourceSha256ByRef: Readonly<Record<string, string | null>>;
  packetRows: readonly FeatureAnchorPacketRowV1[];
  workspaceBindings: readonly FeatureAnchorWorkspaceBindingV1[];
}): FeatureAnchorPacketEvidenceV1 {
  const featureLabel = CanonicalFeatureLabelSchema.parse(input.featureLabel);
  const anchors = getFeatureTaxonomyEntry(featureLabel).coreComponents;
  const candidates: FeatureAnchorPacketEvidenceV1['candidates'] = [];
  const rejections: FeatureAnchorPacketEvidenceV1['rejections'] = [];

  for (const sourceRef of anchors) {
    const localSha256 = input.sourceSha256ByRef[sourceRef];
    if (!localSha256) {
      rejections.push({ sourceRef, reason: 'LOCAL_SOURCE_UNAVAILABLE' });
      continue;
    }

    const variants = sourceRefVariants(sourceRef);
    const matchingRows = input.packetRows.filter((row) => variants.includes(row.sourceRef));
    if (matchingRows.length === 0) {
      rejections.push({ sourceRef, reason: 'PACKET_NOT_FOUND' });
      continue;
    }

    const currentRows = matchingRows.filter((row) => row.sourceRevision === `sha256:${localSha256}`);
    if (currentRows.length === 0) {
      rejections.push({ sourceRef, reason: 'SOURCE_REVISION_MISMATCH' });
      continue;
    }

    const completeRows = currentRows.filter(
      (row) => Boolean(row.packetKey?.trim() && row.workspaceRevisionKey?.trim()),
    );
    if (completeRows.length !== 1) {
      rejections.push({
        sourceRef,
        reason: completeRows.length > 1 ? 'MULTIPLE_MATCHING_PACKETS' : 'PACKET_IDENTITY_INCOMPLETE',
      });
      continue;
    }

    const row = completeRows[0];
    const canonicalSourceRef = `sveltekit-frontend/${sourceRef}`;
    const matchingBindings = input.workspaceBindings.filter((binding) => {
      const contentDigest = binding.contentDigest.replace(/^sha256:/, '').toLowerCase();
      return binding.canonicalSourceRef === canonicalSourceRef
        && binding.sourceRevision === row.sourceRevision
        && binding.workspaceRevision === row.workspaceRevisionKey
        && contentDigest === localSha256;
    });
    if (matchingBindings.length !== 1) {
      rejections.push({ sourceRef, reason: 'WORKSPACE_BINDING_MISMATCH' });
      continue;
    }

    const binding = matchingBindings[0];
    candidates.push({
      packetKey: row.packetKey!,
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision!,
      sourceBytesSha256: localSha256,
      workspaceRevisionKey: row.workspaceRevisionKey!,
      workspaceBinding: {
        canonicalSourceRef: binding.canonicalSourceRef,
        workspaceRevision: binding.workspaceRevision,
        contentDigest: binding.contentDigest.replace(/^sha256:/, '').toLowerCase(),
      },
      qualification: 'SOURCE_BYTES_AND_WORKSPACE_BINDING_MATCH_NOT_ADMITTED',
    });
  }

  return FeatureAnchorPacketEvidenceV1Schema.parse({
    schema: 'atlas.feature-anchor-packet-evidence.v1',
    featureLabel,
    status: candidates.length > 0 ? 'CANDIDATES_FOUND' : 'NO_QUALIFIED_PACKET',
    candidates,
    rejections,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export async function loadFeatureAnchorPacketEvidenceV1(
  featureLabel: CanonicalFeatureLabel,
): Promise<FeatureAnchorPacketEvidenceV1> {
  const anchors = getFeatureTaxonomyEntry(CanonicalFeatureLabelSchema.parse(featureLabel)).coreComponents;

  try {
    const sourceRefs = [...new Set(anchors.flatMap(sourceRefVariants))];
    const [packetRows, sourceHashes] = await Promise.all([
      db.select({
        packetKey: atlasPackets.packetKey,
        sourceRef: atlasPackets.sourceRef,
        sourceRevision: atlasPackets.sourceRevision,
        workspaceRevisionKey: atlasPackets.workspaceRevisionKey,
      }).from(atlasPackets).where(inArray(atlasPackets.sourceRef, sourceRefs)),
      Promise.all(anchors.map(async (sourceRef) => [sourceRef, await hashLocalSource(sourceRef)] as const)),
    ]);
    const bindingMap = await loadBindingProvenanceV1(pool, packetRows.map((row) => ({
      sourceRef: row.sourceRef.startsWith('sveltekit-frontend/')
        ? row.sourceRef
        : `sveltekit-frontend/${row.sourceRef}`,
      sourceRevision: row.sourceRevision,
    })));
    const workspaceBindings = [...bindingMap.values()].flat().map((binding) => ({
      canonicalSourceRef: binding.sourceRef,
      sourceRevision: binding.sourceRevision,
      workspaceRevision: binding.workspaceRevision,
      contentDigest: binding.contentDigest,
    }));

    return buildFeatureAnchorPacketEvidenceV1({
      featureLabel,
      sourceSha256ByRef: Object.fromEntries(sourceHashes),
      packetRows,
      workspaceBindings,
    });
  } catch {
    return FeatureAnchorPacketEvidenceV1Schema.parse({
      schema: 'atlas.feature-anchor-packet-evidence.v1',
      featureLabel,
      status: 'UNAVAILABLE',
      candidates: [],
      rejections: [],
      canonicalAuthority: false,
      writesPerformed: false,
    });
  }
}
