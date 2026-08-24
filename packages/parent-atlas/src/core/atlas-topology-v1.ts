export const ATLAS_TOPOLOGY_SCHEMA = 'atlas.topology.v1' as const;
export const SOM_GRID_ROWS = 20 as const;
export const SOM_GRID_COLS = 20 as const;
export const SOM_INPUT_DIMENSIONS = 4 as const;
export const SOM_NEURON_COUNT = SOM_GRID_ROWS * SOM_GRID_COLS;

export type TopologyFeature4V1 = readonly [number, number, number, number];
export type SomTopologyKindV1 = 'RECTANGULAR' | 'HEXAGONAL';

export type CandidateIdentityV1 = {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string | null;
};

export type CandidateOrdinalMapV1 = {
  schema: typeof ATLAS_TOPOLOGY_SCHEMA;
  mapRevision: string;
  ordinalMapChecksum: string;
  entries: readonly CandidateIdentityV1[];
};

export type SomPrototypeMatrixV1 = {
  shape: readonly [typeof SOM_NEURON_COUNT, typeof SOM_INPUT_DIMENSIONS];
  dtype: 'FP32';
  artifactRef: string;
  checksum: string;
};

export type SomTopologySnapshotV1 = {
  schema: typeof ATLAS_TOPOLOGY_SCHEMA;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  featureRevision: string;
  producerRevision: string;
  somRevision: string;
  gridRows: typeof SOM_GRID_ROWS;
  gridCols: typeof SOM_GRID_COLS;
  inputDimensions: typeof SOM_INPUT_DIMENSIONS;
  topology: SomTopologyKindV1;
  randomSeed: number;
  prototypeMatrix: SomPrototypeMatrixV1;
  canonicalAuthority: false;
};

export type CandidateSomAssignmentV1 = {
  candidateOrdinal: number;
  somRevision: string;
  neuronOrdinal: number;
  row: number;
  col: number;
  bmuDistance: number;
  secondBmuOrdinal?: number;
  secondBmuDistance?: number;
  topologyError?: boolean;
};

export type GraphEdgeKindV1 = 'CALLS' | 'IMPORTS' | 'REFERENCES' | 'TESTS' | 'IMPLEMENTS' | 'EXTENDS' | 'DEPENDS_ON';
export type GraphEdgeV1 = {
  srcOrdinal: number;
  dstOrdinal: number;
  kind: GraphEdgeKindV1;
  weight: number;
  evidenceRefs: readonly string[];
};

export type AtlasGraphSnapshotV1 = {
  schema: typeof ATLAS_TOPOLOGY_SCHEMA;
  graphRevision: string;
  ordinalMapChecksum: string;
  nodeOrdinals: readonly number[];
  edges: readonly GraphEdgeV1[];
  checksum: string;
};

export type OntologyTripleV1 = {
  subject: string;
  predicate: string;
  object: string;
  evidenceRefs: readonly string[];
  sourceRevision: string;
  ontologyRevision: string;
};

export function topologyFeature4(input: readonly number[]): TopologyFeature4V1 {
  if (input.length !== SOM_INPUT_DIMENSIONS || input.some((value) => !Number.isFinite(value))) {
    throw new Error('ATLAS_TOPOLOGY_FEATURE4_INVALID');
  }
  return [input[0], input[1], input[2], input[3]];
}

export function somNeuronOrdinal(row: number, col: number): number {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= SOM_GRID_ROWS || col < 0 || col >= SOM_GRID_COLS) {
    throw new Error('ATLAS_SOM_COORDINATE_OUT_OF_RANGE');
  }
  return row * SOM_GRID_COLS + col;
}

export function somCoordinates(neuronOrdinal: number): readonly [number, number] {
  if (!Number.isInteger(neuronOrdinal) || neuronOrdinal < 0 || neuronOrdinal >= SOM_NEURON_COUNT) {
    throw new Error('ATLAS_SOM_NEURON_OUT_OF_RANGE');
  }
  return [Math.floor(neuronOrdinal / SOM_GRID_COLS), neuronOrdinal % SOM_GRID_COLS];
}

export function buildRectangularSomEdges(): readonly (readonly [number, number])[] {
  const edges: Array<readonly [number, number]> = [];
  for (let row = 0; row < SOM_GRID_ROWS; row += 1) {
    for (let col = 0; col < SOM_GRID_COLS; col += 1) {
      const current = somNeuronOrdinal(row, col);
      if (row + 1 < SOM_GRID_ROWS) edges.push([current, somNeuronOrdinal(row + 1, col)]);
      if (col + 1 < SOM_GRID_COLS) edges.push([current, somNeuronOrdinal(row, col + 1)]);
    }
  }
  return edges;
}
