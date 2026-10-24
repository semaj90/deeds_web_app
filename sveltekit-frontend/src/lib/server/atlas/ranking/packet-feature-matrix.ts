import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';
import { buildFeatureRowV1, type FeatureRowV1 } from './feature-row-v1.js';
import {
  assertSemanticRecipeCompatibilityV1,
  type SemanticEmbeddingRecipeV1,
} from '../../embedding/semantic-recipe-compatibility-v1.js';
import type { PageRankAuthorityLike } from '../../topology/pagerank-authority.js';

export const PACKET_FEATURE_NAMES = [
  'semanticScore',
  'centroidAffinity',
  'quaternionAffinity',
  'graphAuthority',
  'demandUtility',
  'executionUtility',
  'recency',
  'cacheHotness',
  'normalizedCost',
] as const;

export type PacketFeatureName =
  (typeof PACKET_FEATURE_NAMES)[number];

export const PACKET_FEATURE_COUNT =
  PACKET_FEATURE_NAMES.length;

export type PacketFeatureRow = {
  packetKey: string;
  semanticScore: number;
  centroidAffinity: number;
  quaternionAffinity: number;
  graphAuthority: number;
  demandUtility: number;
  executionUtility: number;
  recency: number;
  cacheHotness: number;
  normalizedCost: number;
};

export type PacketFeatureMatrix = {
  packetKeys: string[];
  rows: number;
  cols: number;
  values: Float32Array;
};

export type PacketFeatureSource = {
  packetKey: string;
  vector: readonly number[];
  tokenCount: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeDemandUtility(input: {
  hits24h: number;
  avgRerank: number;
  maxObservedHotScore?: number;
}): number {
  const hits24h = Math.max(0, Number(input.hits24h) || 0);
  const avgRerank = clamp01(Number(input.avgRerank) || 0);
  const hotScore = hits24h * avgRerank;
  const maxObservedHotScore = Math.max(
    Number.EPSILON,
    Number(input.maxObservedHotScore) || 1,
  );

  return clamp01(hotScore / maxObservedHotScore);
}

export function sanitizePacketFeatureRow(
  row: PacketFeatureRow,
): PacketFeatureRow {
  if (!row.packetKey || row.packetKey.trim().length === 0) {
    throw new Error('packetKey is required');
  }

  return {
    packetKey: row.packetKey,
    semanticScore: clamp01(row.semanticScore),
    centroidAffinity: clamp01(row.centroidAffinity),
    quaternionAffinity: clamp01(row.quaternionAffinity),
    graphAuthority: clamp01(row.graphAuthority),
    demandUtility: clamp01(row.demandUtility),
    executionUtility: clamp01(row.executionUtility),
    recency: clamp01(row.recency),
    cacheHotness: clamp01(row.cacheHotness),
    normalizedCost: clamp01(row.normalizedCost),
  };
}

export function buildPacketFeatureMatrix(
  rows: readonly PacketFeatureRow[],
): PacketFeatureMatrix {
  const sanitized = rows.map(sanitizePacketFeatureRow);
  const values = new Float32Array(
    sanitized.length * PACKET_FEATURE_COUNT,
  );
  const packetKeys: string[] = [];

  for (let rowIndex = 0; rowIndex < sanitized.length; rowIndex += 1) {
    const row = sanitized[rowIndex];
    packetKeys.push(row.packetKey);

    const base = rowIndex * PACKET_FEATURE_COUNT;
    values[base + 0] = row.semanticScore;
    values[base + 1] = row.centroidAffinity;
    values[base + 2] = row.quaternionAffinity;
    values[base + 3] = row.graphAuthority;
    values[base + 4] = row.demandUtility;
    values[base + 5] = row.executionUtility;
    values[base + 6] = row.recency;
    values[base + 7] = row.cacheHotness;
    values[base + 8] = row.normalizedCost;
  }

  return {
    packetKeys,
    rows: sanitized.length,
    cols: PACKET_FEATURE_COUNT,
    values,
  };
}

function deriveDemandUtilityFromPacket(source: PacketFeatureSource): number {
  const lexicalSignal = clamp01(Number(source.vector[0]) || 0);
  const denseSignal = clamp01(Number(source.vector[1]) || 0);

  return normalizeDemandUtility({
    hits24h: Math.max(0, Math.round(lexicalSignal * 100)),
    avgRerank: denseSignal,
    maxObservedHotScore: 100,
  });
}

export function buildPacketFeatureRowsFromPackets(
  packets: readonly PacketFeatureSource[],
): PacketFeatureRow[] {
  return packets.map((packet) => ({
    packetKey: packet.packetKey,
    semanticScore: clamp01(Number(packet.vector[1]) || 0),
    centroidAffinity: clamp01(Number(packet.vector[4]) || 0),
    quaternionAffinity: clamp01(Number(packet.vector[2]) || 0),
    graphAuthority: clamp01(Number(packet.vector[3]) || 0),
    demandUtility: deriveDemandUtilityFromPacket(packet),
    executionUtility: clamp01(Number(packet.vector[6]) || 0),
    recency: clamp01(Number(packet.vector[5]) || 0),
    cacheHotness: clamp01(Number(packet.vector[7]) || 0),
    normalizedCost: clamp01(Number(packet.vector[8]) || 0),
  }));
}

export function buildPacketFeatureMatrixFromPackets(
  packets: readonly PacketFeatureSource[],
): PacketFeatureMatrix {
  return buildPacketFeatureMatrix(buildPacketFeatureRowsFromPackets(packets));
}

export function getPacketFeatureRow(
  matrix: PacketFeatureMatrix,
  rowIndex: number,
): Float32Array {
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= matrix.rows
  ) {
    throw new RangeError(`Invalid matrix row index: ${rowIndex}`);
  }

  const start = rowIndex * matrix.cols;
  return matrix.values.slice(start, start + matrix.cols);
}

export interface BridgePacketFeatureRowToFeatureRowV1Input {
  packetRow: PacketFeatureRow;
  locator: EvidenceLocatorV1;
  semanticEvidence: {
    packetKey: string;
    canonicalId: string;
    sourceRef: string;
    workspaceRevision: string;
    sourceRevision: string;
    representationId: 'semantic_768';
    representationRevision: string;
    queryRecipe: SemanticEmbeddingRecipeV1;
    documentRecipe: SemanticEmbeddingRecipeV1;
  };
  featureRevision: string;
  pagerank: PageRankAuthorityLike & {
    runId: string;
    graphRevision: string;
    status: 'promoted';
    didConverge: true;
  };
  semanticRevision: string;
  sparse?: number;
  rrf?: number;
  ast?: number;
  pprAffinity?: number | null;
  crossEncoder?: number | null;
  evidenceRefs: readonly string[];
}

export function bridgePacketFeatureRowToFeatureRowV1(
  input: BridgePacketFeatureRowToFeatureRowV1Input,
): FeatureRowV1 {
  const { packetRow, locator, semanticEvidence, pagerank } = input;
  if (!packetRow.packetKey || packetRow.packetKey.trim().length === 0) {
    throw new Error('packetKey is required');
  }
  if (locator.packetKey && locator.packetKey !== packetRow.packetKey) {
    throw new Error(`PACKET_KEY_MISMATCH: ${packetRow.packetKey} vs ${locator.packetKey}`);
  }
  if (!locator.canonicalId) {
    throw new Error('canonicalId is required on EvidenceLocatorV1');
  }
  if (semanticEvidence.representationId !== 'semantic_768') {
    throw new Error(`FEATURE_ROW_SEMANTIC_REPRESENTATION_UNSUPPORTED:${semanticEvidence.representationId}`);
  }
  if (semanticEvidence.packetKey !== packetRow.packetKey || semanticEvidence.packetKey !== locator.packetKey) {
    throw new Error('FEATURE_ROW_SEMANTIC_PACKET_KEY_MISMATCH');
  }
  if (semanticEvidence.canonicalId !== locator.canonicalId) {
    throw new Error('FEATURE_ROW_SEMANTIC_CANONICAL_ID_MISMATCH');
  }
  if (semanticEvidence.sourceRef !== locator.sourceRef) {
    throw new Error('FEATURE_ROW_SEMANTIC_SOURCE_REF_MISMATCH');
  }
  if (semanticEvidence.workspaceRevision !== locator.workspaceRevision) {
    throw new Error('FEATURE_ROW_SEMANTIC_WORKSPACE_REVISION_MISMATCH');
  }
  if (semanticEvidence.sourceRevision !== locator.sourceRevision) {
    throw new Error('FEATURE_ROW_SEMANTIC_SOURCE_REVISION_MISMATCH');
  }
  if (semanticEvidence.representationRevision !== input.semanticRevision) {
    throw new Error('FEATURE_ROW_SEMANTIC_REVISION_MISMATCH');
  }
  if (!pagerank.runId.trim() || !pagerank.graphRevision.trim()) {
    throw new Error('FEATURE_ROW_PAGERANK_PROVENANCE_REQUIRED');
  }
  if (pagerank.status !== 'promoted') {
    throw new Error('FEATURE_ROW_PAGERANK_NOT_PROMOTED');
  }
  if (pagerank.didConverge !== true) {
    throw new Error('FEATURE_ROW_PAGERANK_CONVERGENCE_UNVERIFIED');
  }
  assertSemanticRecipeCompatibilityV1({
    query: semanticEvidence.queryRecipe,
    document: semanticEvidence.documentRecipe,
  });

  return buildFeatureRowV1({
    locator: {
      ...locator,
      packetKey: packetRow.packetKey,
    },
    featureRevision: input.featureRevision,
    graphRevision: pagerank.graphRevision,
    semanticRevision: input.semanticRevision,
    dense: packetRow.semanticScore,
    sparse: input.sparse ?? 0,
    rrf: input.rrf ?? 0,
    ast: input.ast ?? 0,
    pagerank,
    pprAffinity: input.pprAffinity ?? null,
    domainAffinity: packetRow.centroidAffinity,
    freshness: packetRow.recency,
    crossEncoder: input.crossEncoder ?? null,
    executionUtility: packetRow.executionUtility,
    evidenceRefs: input.evidenceRefs,
  });
}

export interface CanonicalIdentityRoundTripProofV1 {
  candidatePacketKey: string;
  canonicalId: string;
  featureRowPacketKey: string;
  featureRowCanonicalId: string;
  sourceRef: string;
  contentHash: string;
  verifiedEvidenceRef: string;
  roundTripProven: true;
}

export function proveCanonicalIdentityRoundTripV1(input: {
  candidate: { packetKey: string; canonicalId: string };
  locator: EvidenceLocatorV1;
  featureRow: FeatureRowV1;
  evidenceStore: ReadonlyMap<string, EvidenceLocatorV1>;
}): CanonicalIdentityRoundTripProofV1 {
  const { candidate, locator, featureRow, evidenceStore } = input;

  if (candidate.packetKey !== featureRow.packetKey) {
    throw new Error(`ROUND_TRIP_PACKET_KEY_DRIFT: candidate=${candidate.packetKey} row=${featureRow.packetKey}`);
  }
  if (!candidate.canonicalId.trim()) {
    throw new Error('ROUND_TRIP_CANONICAL_ID_REQUIRED');
  }
  if (candidate.canonicalId !== featureRow.canonicalId) {
    throw new Error(`ROUND_TRIP_CANONICAL_ID_DRIFT: candidate=${candidate.canonicalId} row=${featureRow.canonicalId}`);
  }
  if (locator.packetKey && locator.packetKey !== featureRow.packetKey) {
    throw new Error(`ROUND_TRIP_LOCATOR_PACKET_DRIFT: locator=${locator.packetKey} row=${featureRow.packetKey}`);
  }
  if (locator.canonicalId !== featureRow.canonicalId) {
    throw new Error(`ROUND_TRIP_LOCATOR_CANONICAL_DRIFT: locator=${locator.canonicalId} row=${featureRow.canonicalId}`);
  }
  if (locator.sourceRef !== featureRow.sourceRef) {
    throw new Error(`ROUND_TRIP_SOURCE_REF_DRIFT: locator=${locator.sourceRef} row=${featureRow.sourceRef}`);
  }
  if (locator.sourceRevision !== featureRow.sourceRevision) {
    throw new Error(`ROUND_TRIP_SOURCE_REVISION_DRIFT: locator=${locator.sourceRevision} row=${featureRow.sourceRevision}`);
  }

  if (!featureRow.evidenceRefs || featureRow.evidenceRefs.length === 0) {
    throw new Error('ROUND_TRIP_EVIDENCE_REFS_EMPTY');
  }

  const primaryEvidenceRef = featureRow.evidenceRefs[0];
  const resolvedEvidence = evidenceStore.get(primaryEvidenceRef);
  if (!resolvedEvidence) {
    throw new Error(`ROUND_TRIP_EVIDENCE_UNRESOLVED: ref=${primaryEvidenceRef}`);
  }

  if (resolvedEvidence.canonicalId !== featureRow.canonicalId) {
    throw new Error(`ROUND_TRIP_RESOLVED_CANONICAL_MISMATCH: ${resolvedEvidence.canonicalId} vs ${featureRow.canonicalId}`);
  }
  if (resolvedEvidence.sourceRef !== featureRow.sourceRef) {
    throw new Error(`ROUND_TRIP_RESOLVED_SOURCE_REF_MISMATCH: ${resolvedEvidence.sourceRef} vs ${featureRow.sourceRef}`);
  }
  if (resolvedEvidence.sourceRevision !== featureRow.sourceRevision) {
    throw new Error(`ROUND_TRIP_SOURCE_REVISION_MISMATCH: ${resolvedEvidence.sourceRevision} vs ${featureRow.sourceRevision}`);
  }
  if (resolvedEvidence.sourceKind !== locator.sourceKind) {
    throw new Error(`ROUND_TRIP_SOURCE_KIND_MISMATCH: ${resolvedEvidence.sourceKind} vs ${locator.sourceKind}`);
  }
  if (resolvedEvidence.filePath !== locator.filePath) {
    throw new Error(`ROUND_TRIP_FILE_PATH_MISMATCH: ${resolvedEvidence.filePath} vs ${locator.filePath}`);
  }
  if (resolvedEvidence.sourceUrl !== locator.sourceUrl) {
    throw new Error(`ROUND_TRIP_SOURCE_URL_MISMATCH: ${resolvedEvidence.sourceUrl} vs ${locator.sourceUrl}`);
  }
  if (resolvedEvidence.contentHash !== locator.contentHash) {
    throw new Error(`ROUND_TRIP_CONTENT_HASH_MISMATCH: ${resolvedEvidence.contentHash} vs ${locator.contentHash}`);
  }
  if (resolvedEvidence.workspaceRevision !== featureRow.workspaceRevision) {
    throw new Error(`ROUND_TRIP_WORKSPACE_REVISION_MISMATCH: ${resolvedEvidence.workspaceRevision} vs ${featureRow.workspaceRevision}`);
  }

  return {
    candidatePacketKey: candidate.packetKey,
    canonicalId: featureRow.canonicalId,
    featureRowPacketKey: featureRow.packetKey,
    featureRowCanonicalId: featureRow.canonicalId,
    sourceRef: featureRow.sourceRef,
    contentHash: resolvedEvidence.contentHash,
    verifiedEvidenceRef: primaryEvidenceRef,
    roundTripProven: true,
  };
}
