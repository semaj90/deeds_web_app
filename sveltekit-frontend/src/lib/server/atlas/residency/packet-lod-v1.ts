export const PACKET_LOD_V1_SCHEMA = 'parent-atlas.packet-lod.v1' as const;

export type PacketLodV1 = 0 | 1 | 2 | 3 | 4 | 5 | 'GPU';

export type ResidencyStateV1 =
  | 'ABSENT'
  | 'COLD'
  | 'WARM'
  | 'HOT_CPU'
  | 'HOT_GPU'
  | 'CONSUMED';

export type RepresentationKindV1 =
  | 'IDENTITY'
  | 'GLYPH_CARD'
  | 'SUMMARY_FEATURES'
  | 'STRUCTURAL_GRAPH_EVIDENCE'
  | 'SOURCE_SPAN'
  | 'FULL_ARTIFACT'
  | 'GPU_VECTOR'
  | 'GPU_TENSOR'
  | 'GPU_CSR';

export interface PacketRepresentationV1 {
  canonicalId: string;
  representationId: string;
  representationRevision: string;
  lod: PacketLodV1;
  kind: RepresentationKindV1;
  residency: ResidencyStateV1;
  byteSize: number;
  tokenCost: number;
  gpuByteSize: number;
  contentHash?: string;
}

export const PACKET_LOD_PURPOSE_V1: Record<string, string> = {
  '0': 'identity + revisions + ordinal; candidate algebra',
  '1': 'glyph/card metadata; routing/display',
  '2': 'summary + lexical/feature signals; cheap ranking',
  '3': 'AST/ontology/graph evidence; analysis',
  '4': 'exact source spans; synthesis evidence',
  '5': 'full source/artifact; hydrate only when required',
  GPU: 'vector/tensor/CSR projection; physical GPU executor only'
};
