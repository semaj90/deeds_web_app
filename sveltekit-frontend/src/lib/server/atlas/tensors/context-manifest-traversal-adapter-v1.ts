import type { ContextManifestV1 } from '../graph/graph-runtime-contracts.js';
import {
  compileTraversalInstructionV1,
  type TraversalInstructionInputV1,
  type TraversalInstructionV1,
} from './traversal-instruction-v1.js';

export type ContextManifestTraversalInputV1 = Omit<TraversalInstructionInputV1, 'candidateOrdinals'> & {
  manifest: ContextManifestV1;
  candidateOrdinals: readonly number[];
};

/**
 * Binds the compact instruction compiler to the existing manifest boundary.
 * The manifest remains descriptive evidence membership; this adapter does not
 * create a manifest, alter ranking, or persist the instruction.
 */
export function compileTraversalInstructionFromContextManifestV1(
  input: ContextManifestTraversalInputV1,
): TraversalInstructionV1 {
  const { manifest, candidateOrdinals, ...instruction } = input;
  if (manifest.schema !== 'atlas.context-manifest.v1') {
    throw new Error('TRAVERSAL_CONTEXT_MANIFEST_SCHEMA_MISMATCH');
  }
  if (manifest.candidateCount !== candidateOrdinals.length) {
    throw new Error(`TRAVERSAL_CONTEXT_CANDIDATE_COUNT_MISMATCH:${manifest.candidateCount}:${candidateOrdinals.length}`);
  }
  if (manifest.graphRevision !== null && manifest.graphRevision !== input.snapshotRevision) {
    throw new Error('TRAVERSAL_CONTEXT_GRAPH_REVISION_MISMATCH');
  }
  return compileTraversalInstructionV1({ ...instruction, candidateOrdinals: [...candidateOrdinals] });
}
