import { z } from 'zod';

/**
 * PARENT-ATLAS-SOM-TOPOLOGY-COORDINATE
 *
 * Experimental 3D SOM topology-routing representation coordinate
 * (semantic_768 / latent_128 / latent_64 -> BMU x,y,z). This is a
 * REPRESENTATION coordinate, never canonical identity — the same non-canonical
 * treatment this repo already applies to projectionOrdinal/gpuNodeId (not
 * promoted to GraphOrdinal until an ordinal-map checksum proves equivalence).
 *
 * `representationRevision` and `somRevision` are separate fields because the
 * underlying embedding representation can change independently of the SOM
 * training run: re-running SOM training on the same representation revision
 * produces a new somRevision but the same representationRevision.
 *
 * The ONLY sanctioned production use of this contract is measuring whether
 * BMU-neighbor prefetch after a BitFrost cache hit improves locality/hit-rate
 * (fetch cells within a bounded radius of a cache-hit BMU coordinate and
 * evaluate their promotion) — NOT visualization-as-truth, and NOT a retrieval
 * ranking signal. cuVS ANN / cuGraph / lexical fusion ranking output MUST NOT
 * be reordered or filtered using SomCoordinateV1 values.
 */
export const SomCoordinateV1Schema = z.object({
  representationRevision: z.string().min(1),
  somRevision: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  quantizationError: z.number().finite().min(0),
}).strict();

export type SomCoordinateV1 = z.infer<typeof SomCoordinateV1Schema>;

export function buildSomCoordinateV1(input: SomCoordinateV1): SomCoordinateV1 {
  return SomCoordinateV1Schema.parse(input);
}
