import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  StructuralFeatureSnapshotV1Schema,
  type StructuralFeatureSnapshotV1,
} from './structural-feature-snapshot-v1.js';
import {
  graphNeighborhoodHitV1Schema,
  type GraphNeighborhoodHitV1,
} from './graph-neighborhood-candidate-ordinal-v1.js';

/**
 * Convert one revision-qualified cuGraph BFS result set into the existing
 * StructuralFeatureSnapshotV1 contract. Only metrics actually observed by BFS
 * are populated: queryProximity and structuralDistance. PageRank, community,
 * neighborhood-overlap, and aggregate affinity remain null rather than being
 * guessed from hop distance.
 */
export function materializeBfsStructuralFeatureSnapshotV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  hits: readonly GraphNeighborhoodHitV1[];
  producerRevision: string;
  generatedAt?: string;
}): StructuralFeatureSnapshotV1 {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (!input.producerRevision.trim()) throw new Error('BFS_STRUCTURAL_PRODUCER_REVISION_REQUIRED');
  const hits = input.hits.map((hit) => graphNeighborhoodHitV1Schema.parse(hit));
  if (hits.length === 0) throw new Error('BFS_STRUCTURAL_HITS_REQUIRED');

  const first = hits[0]!;
  if (first.executor !== 'CUGRAPH_BFS') throw new Error('BFS_STRUCTURAL_EXECUTOR_REJECTED');

  const seen = new Set<number>();
  const rows = hits.map((hit) => {
    if (
      hit.executor !== first.executor ||
      hit.graphRevision !== first.graphRevision ||
      hit.projectionRevision !== first.projectionRevision ||
      hit.algorithmRevision !== first.algorithmRevision ||
      hit.candidateSnapshotRevision !== map.candidateSnapshotRevision ||
      hit.ordinalMapChecksum !== map.ordinalMapChecksum
    ) {
      throw new Error('BFS_STRUCTURAL_REVISION_SET_MISMATCH');
    }
    if (seen.has(hit.candidateOrdinal)) {
      throw new Error(`BFS_STRUCTURAL_DUPLICATE_ORDINAL:${hit.candidateOrdinal}`);
    }
    seen.add(hit.candidateOrdinal);

    const candidate = map.candidates[hit.candidateOrdinal];
    if (!candidate || candidate.candidateOrdinal !== hit.candidateOrdinal) {
      throw new Error(`BFS_STRUCTURAL_ORDINAL_NOT_IN_MAP:${hit.candidateOrdinal}`);
    }
    if (candidate.graphRevision !== hit.graphRevision) {
      throw new Error(`BFS_STRUCTURAL_GRAPH_REVISION_MISMATCH:${hit.candidateOrdinal}`);
    }

    return {
      candidateOrdinal: hit.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      graphAuthority: null,
      queryProximity: hit.proximity,
      communityId: null,
      neighborhoodOverlap: null,
      structuralDistance: hit.hop,
      structuralAffinity: null,
    };
  });

  rows.sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);

  return StructuralFeatureSnapshotV1Schema.parse({
    schema: 'atlas.structural-feature-snapshot.v1',
    workspaceRevision: map.workspaceRevision,
    graphRevision: first.graphRevision,
    projectionRevision: first.projectionRevision,
    producerRevision: input.producerRevision,
    executor: 'cugraph',
    algorithmSet: [first.algorithmRevision],
    rows,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  });
}
