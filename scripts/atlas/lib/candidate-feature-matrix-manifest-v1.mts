import { createHash } from 'node:crypto';

export const MATRIX_SCHEMA = 'atlas.candidate-feature-matrix-manifest.v1';

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

export function buildCandidateFeatureMatrixManifest({ map, semantic, graph, matrix, includeGraph }: any): any {
  const candidates = map.candidates ?? [];
  const semanticByOrdinal = new Map((semantic.candidates ?? []).map((row: any) => [row.candidateOrdinal, row]));
  const graphByOrdinal = new Map((graph.features ?? []).map((row: any) => [row.candidateOrdinal, row]));
  const featureCount = matrix.feature_count;
  const rows = candidates.map((candidate: any, matrixRow: number) => {
    const semanticRow = semanticByOrdinal.get(candidate.candidateOrdinal) ?? {};
    const graphRow = includeGraph ? graphByOrdinal.get(candidate.candidateOrdinal) : undefined;
    const featureValues = Array.from(matrix.candidate_features.slice(matrixRow * featureCount, (matrixRow + 1) * featureCount));
    const presenceValues = Array.from(matrix.presence_mask.slice(matrixRow * featureCount, (matrixRow + 1) * featureCount));
    return {
      matrixRow,
      candidateOrdinal: candidate.candidateOrdinal,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision ?? null,
      workspaceRevision: candidate.workspaceRevision ?? map.workspaceRevision ?? null,
      treeNodeId: null,
      stableSymbolId: null,
      symbolVersionId: null,
      semanticRevision: semanticRow.semanticRevision ?? candidate.semanticRevision ?? null,
      representationRevision: semanticRow.semanticRevision ?? candidate.semanticRevision ?? null,
      observationFeatureRevision: null,
      observationFeatureInputDigest: null,
      astGraphRevision: null,
      compilerSemanticGraphRevision: null,
      relationshipGraphRevision: null,
      graphFeatureRevision: graphRow?.featureRevision ?? (includeGraph ? graph.featureRevision ?? null : null),
      graphFeatureInputChecksum: graphRow ? digest({ candidateOrdinal: graphRow.candidateOrdinal, pagerankMax: graphRow.pagerankMax, pagerankMean: graphRow.pagerankMean, pagerankSum: graphRow.pagerankSum, graphNodeCount: graphRow.graphNodeCount }) : null,
      featureRowChecksum: digest({ matrixRow, candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, featureValues, presenceValues }),
    };
  });
  const matrixBytes = Buffer.from(matrix.candidate_features.buffer, matrix.candidate_features.byteOffset, matrix.candidate_features.byteLength).toString('base64');
  const presenceBytes = Buffer.from(matrix.presence_mask.buffer, matrix.presence_mask.byteOffset, matrix.presence_mask.byteLength).toString('base64');
  const matrixChecksum = digest({ encoding: 'Float32Array/base64', value: matrixBytes });
  const presenceMaskChecksum = digest({ encoding: 'Uint8Array/base64', value: presenceBytes });
  const graphInputs = [...graphByOrdinal.values()].sort((a: any, b: any) => a.candidateOrdinal - b.candidateOrdinal).map((row: any) => ({ candidateOrdinal: row.candidateOrdinal, pagerankMax: row.pagerankMax, pagerankMean: row.pagerankMean, pagerankSum: row.pagerankSum, graphNodeCount: row.graphNodeCount }));
  const authorityProjection = includeGraph ? {
    schema: 'atlas.graph-authority-projection.v1',
    input: ['pagerankMax', 'pagerankMean', 'pagerankSum', 'graphNodeCount'],
    output: 'authority_norm',
    projectionKind: 'PAGERANK_MAX_NORMALIZED_V1',
    normalizationRevision: 'pagerank-native-sum-normalized-v1',
    graphRevision: graph.graphRevision ?? null,
    producerRevision: graph.featureRevision ?? null,
    inputChecksum: digest(graphInputs),
  } : null;
  const body = {
    schema: MATRIX_SCHEMA,
    candidateSnapshotRevision: map.candidateSnapshotRevision ?? null,
    ordinalMapChecksum: map.ordinalMapChecksum ?? null,
    rowCount: matrix.candidate_count,
    featureCount,
    rows,
    matrixChecksum,
    presenceMaskChecksum,
    authorityProjection,
    canonicalAuthority: false,
  };
  return { ...body, manifestChecksum: digest(body) };
}
