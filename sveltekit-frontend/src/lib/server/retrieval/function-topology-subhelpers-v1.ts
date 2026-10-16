export interface FunctionTopologyRegistryCandidateV1 {
  packetKey: string;
  symbolVersionId: string;
  treeNodeId: string;
  sourceRef: string;
  sourceRevision: string;
  qualifiedName: string;
}

export interface FunctionTopologyProjectionRowV1 {
  packetKey: string;
  treeNodeId: string | null;
  somX: number | null;
  somY: number | null;
  xCosine: number | null;
  yGraph: number | null;
  zSom: number | null;
  wAuthority: number | null;
  topologyVersion: number | null;
}

export type FunctionTopologyJoinStatusV1 =
  | 'MATCHED_PROJECTION_ONLY'
  | 'PACKET_KEY_MISSING'
  | 'AMBIGUOUS_PROJECTION'
  | 'TREE_NODE_MISMATCH'
  | 'INVALID_SOM_COORDINATES';

export interface FunctionTopologyJoinResultV1 {
  candidate: FunctionTopologyRegistryCandidateV1;
  status: FunctionTopologyJoinStatusV1;
  projection: FunctionTopologyProjectionRowV1 | null;
  canonicalAuthority: false;
  revisionQualified: false;
}

function isValidSomCoordinate(value: number | null): value is number {
  return value === null || (Number.isInteger(value) && value >= 0 && value < 20);
}

export function joinFunctionTopologyProjectionV1(input: {
  candidates: readonly FunctionTopologyRegistryCandidateV1[];
  projections: readonly FunctionTopologyProjectionRowV1[];
}): FunctionTopologyJoinResultV1[] {
  const byPacketKey = new Map<string, FunctionTopologyProjectionRowV1[]>();
  for (const projection of input.projections) {
    const rows = byPacketKey.get(projection.packetKey) ?? [];
    rows.push(projection);
    byPacketKey.set(projection.packetKey, rows);
  }

  return input.candidates.map((candidate) => {
    const matches = byPacketKey.get(candidate.packetKey) ?? [];
    if (matches.length === 0) {
      return { candidate, status: 'PACKET_KEY_MISSING', projection: null, canonicalAuthority: false, revisionQualified: false };
    }
    if (matches.length !== 1) {
      return { candidate, status: 'AMBIGUOUS_PROJECTION', projection: null, canonicalAuthority: false, revisionQualified: false };
    }

    const projection = matches[0];
    if (projection.treeNodeId !== null && projection.treeNodeId !== candidate.treeNodeId) {
      return { candidate, status: 'TREE_NODE_MISMATCH', projection: null, canonicalAuthority: false, revisionQualified: false };
    }
    if (!isValidSomCoordinate(projection.somX) || !isValidSomCoordinate(projection.somY)) {
      return { candidate, status: 'INVALID_SOM_COORDINATES', projection: null, canonicalAuthority: false, revisionQualified: false };
    }

    return { candidate, status: 'MATCHED_PROJECTION_ONLY', projection, canonicalAuthority: false, revisionQualified: false };
  });
}

export function normalizeFunctionSearchTermsV1(query: string): string[] {
  return [...new Set(query.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}_$.-]+/gu) ?? [])]
    .filter((term) => term.length > 1)
    .slice(0, 32);
}
