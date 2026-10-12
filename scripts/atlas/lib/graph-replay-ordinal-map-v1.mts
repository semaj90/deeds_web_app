import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  compareUtf8,
  type CandidateOrdinalMapV1,
} from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';

export function verifyGraphReplayOrdinalMapV1(input: {
  candidateMap: unknown;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
}): CandidateOrdinalMapV1 {
  const map = candidateOrdinalMapV1Schema.parse(input.candidateMap);
  assertCandidateOrdinalMapIntegrityV1(map);

  if (map.workspaceRevision !== input.workspaceRevision) {
    throw new Error('GRAPH_RO_REPLAY_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH');
  }
  if (map.candidateSnapshotRevision !== input.candidateSnapshotRevision) {
    throw new Error('GRAPH_RO_REPLAY_ORDINAL_MAP_SNAPSHOT_REVISION_MISMATCH');
  }
  if (input.ordinalMapChecksum !== `sha256:${map.ordinalMapChecksum}`) {
    throw new Error('GRAPH_RO_REPLAY_ORDINAL_MAP_CHECKSUM_MISMATCH');
  }

  return map;
}

export function mapGraphEntitiesToCandidateOrdinalsV1(input: {
  candidateMap: CandidateOrdinalMapV1;
  entityCanonicalIds: readonly string[];
}): {
  matchedEntityCount: number;
  unmatchedEntityCount: number;
  candidateOrdinalPairsChecksum: string;
  sampleCandidateOrdinals: Array<{ canonicalId: string; candidateOrdinal: number }>;
  crosswalkStatus: 'EXACT' | 'PARTIAL' | 'UNMATCHED';
} {
  const candidatesById = new Map(input.candidateMap.candidates.map((candidate) => [candidate.canonicalId, candidate.candidateOrdinal]));
  const seenEntityIds = new Set<string>();
  const hash = createHash('sha256');
  const sampleCandidateOrdinals: Array<{ canonicalId: string; candidateOrdinal: number }> = [];
  let matchedEntityCount = 0;
  let unmatchedEntityCount = 0;

  for (const canonicalId of [...input.entityCanonicalIds].sort(compareUtf8)) {
    if (!canonicalId || seenEntityIds.has(canonicalId)) {
      throw new Error('GRAPH_RO_REPLAY_GRAPH_ENTITY_ID_MISSING_OR_DUPLICATE');
    }
    seenEntityIds.add(canonicalId);
    const candidateOrdinal = candidatesById.get(canonicalId);
    if (candidateOrdinal === undefined) {
      unmatchedEntityCount += 1;
      continue;
    }
    hash.update(JSON.stringify([canonicalId, candidateOrdinal]));
    hash.update('\n');
    matchedEntityCount += 1;
    if (sampleCandidateOrdinals.length < 16) sampleCandidateOrdinals.push({ canonicalId, candidateOrdinal });
  }

  return {
    matchedEntityCount,
    unmatchedEntityCount,
    candidateOrdinalPairsChecksum: `sha256:${hash.digest('hex')}`,
    sampleCandidateOrdinals,
    crosswalkStatus: unmatchedEntityCount === 0 ? 'EXACT' : matchedEntityCount === 0 ? 'UNMATCHED' : 'PARTIAL',
  };
}

export function resolveGraphReplayReportPathV1(repoRoot: string, outputPath?: string): string {
  if (outputPath === undefined) {
    return resolve(repoRoot, 'docs/reports/relationship-graph-readonly-replay-v1.json');
  }

  if (!outputPath.trim() || isAbsolute(outputPath) || resolve(repoRoot, outputPath) !== resolve(repoRoot, outputPath.trim())) {
    throw new Error('GRAPH_RO_REPLAY_OUTPUT_PATH_INVALID');
  }

  const scratchRoot = resolve(repoRoot, '.tmp/atlas');
  const target = resolve(repoRoot, outputPath);
  const targetRelative = relative(scratchRoot, target);
  if (!targetRelative || targetRelative === '..' || targetRelative.startsWith(`..${sep}`) || resolve(scratchRoot, targetRelative) !== target || !target.endsWith('.json')) {
    throw new Error('GRAPH_RO_REPLAY_OUTPUT_MUST_BE_JSON_UNDER_TMP_ATLAS');
  }
  return target;
}
