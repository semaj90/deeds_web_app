import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import { RetrievalRouterFeatureRowV1Schema } from '../contracts/retrieval-router-feature-row-v1.js';
import type { RlmAceFeatureBundleProviderV1 } from '../rlm/rlm-ace-feature-admission-v1.js';
import type { RlmSearchRequest, RlmSearchResult } from '../rlm/rlm-contract.js';
import {
  produceAceFeatureSnapshotV1,
  type AceFeatureSnapshotProducerInputV1,
} from '../context/ace-feature-snapshot-producer-v1.js';

export const SERVER_FEATURE_BUNDLE_SCHEMA = 'atlas.server-feature-bundle.v1' as const;

const checksum = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

export const serverFeatureBundleV1Schema = z.object({
  schema: z.literal(SERVER_FEATURE_BUNDLE_SCHEMA),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  featureRevision: z.string().min(1),
  graphRevisionSetChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  candidateCount: z.number().int().nonnegative(),
  ordinalMap: candidateOrdinalMapV1Schema,
  snapshot: z.unknown(),
  bundleChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();
export type ServerFeatureBundleV1 = z.infer<typeof serverFeatureBundleV1Schema>;

function rejectTimestampRevision(value: string, field: string): void {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    throw new Error(`SERVER_FEATURE_BUNDLE_${field.toUpperCase()}_MUST_BE_AUTHORITY_REVISION`);
  }
}

/**
 * SearchRuntime composition owner. Retrieval, ordinal assignment, graph and
 * feature producers remain upstream owners; this function only joins their
 * already-admitted outputs for ACE/RLM consumption.
 */
export function buildSearchRuntimeFeatureBundleV1(
  input: AceFeatureSnapshotProducerInputV1 & { featureRevision: string },
): ServerFeatureBundleV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  rejectTimestampRevision(ordinalMap.workspaceRevision, 'workspace_revision');
  const rows = input.rows.map((row) => RetrievalRouterFeatureRowV1Schema.parse(row));
  const produced = produceAceFeatureSnapshotV1(input);
  const graphRevisions = [...new Set(produced.snapshot.rows.map((row) => row.graphRevision))].sort();
  const graphRevisionSetChecksum = checksum(graphRevisions);
  const bundleIdentity = {
    requestId: input.requestId,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    featureRevision: input.featureRevision,
    graphRevisionSetChecksum,
    snapshotChecksum: produced.snapshot.snapshotChecksum,
  };
  return serverFeatureBundleV1Schema.parse({
    schema: SERVER_FEATURE_BUNDLE_SCHEMA,
    requestId: input.requestId,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    featureRevision: input.featureRevision,
    graphRevisionSetChecksum,
    candidateCount: rows.length,
    ordinalMap,
    snapshot: produced.snapshot,
    bundleChecksum: checksum(bundleIdentity),
    writesPerformed: false,
    canonicalAuthority: false,
  });
}

export function verifySearchRuntimeFeatureBundleV1(bundle: ServerFeatureBundleV1): void {
  const parsed = serverFeatureBundleV1Schema.parse(bundle);
  if (parsed.ordinalMapChecksum !== parsed.ordinalMap.ordinalMapChecksum) {
    throw new Error('SERVER_FEATURE_BUNDLE_ORDINAL_MAP_CHECKSUM_MISMATCH');
  }
  if (parsed.candidateCount !== parsed.ordinalMap.rowCount) {
    throw new Error('SERVER_FEATURE_BUNDLE_CANDIDATE_COUNT_MISMATCH');
  }
}

/**
 * Creates the RLM-facing provider without making RLM a retrieval owner. The
 * resolver must return already-admitted SearchRuntime inputs; this adapter only
 * exposes the existing producer through the server-side provider seam.
 */
export function createSearchRuntimeFeatureBundleProviderV1(
  resolve: (input: { request: RlmSearchRequest; result: RlmSearchResult }) =>
    Promise<AceFeatureSnapshotProducerInputV1 & { featureRevision: string } | null>,
): RlmAceFeatureBundleProviderV1 {
  return {
    async get(input) {
      const resolved = await resolve(input);
      if (!resolved) return null;
      buildSearchRuntimeFeatureBundleV1(resolved);
      return resolved;
    },
  };
}
