import { describe, expect, it } from 'vitest';
import { joinFunctionTopologyProjectionV1, normalizeFunctionSearchTermsV1 } from './function-topology-subhelpers-v1.js';

const candidate = {
  packetKey: 'packet:one',
  symbolVersionId: 'symbol-version:one',
  treeNodeId: 'tree-node:one',
  sourceRef: 'src/example.ts#example',
  sourceRevision: 'sha256:source-revision',
  qualifiedName: 'example',
};

const projection = {
  packetKey: 'packet:one',
  treeNodeId: 'tree-node:one',
  somX: 4,
  somY: 12,
  xCosine: 0.91,
  yGraph: 3,
  zSom: 8,
  wAuthority: 0.2,
  topologyVersion: 2,
};

describe('function topology diagnostic subhelpers v1', () => {
  it('joins exact packet keys and marks projection data non-authoritative', () => {
    const [result] = joinFunctionTopologyProjectionV1({ candidates: [candidate], projections: [projection] });
    expect(result.status).toBe('MATCHED_PROJECTION_ONLY');
    expect(result.projection?.somX).toBe(4);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.revisionQualified).toBe(false);
  });

  it('fails closed for missing, duplicate, mismatched, or out-of-range projection rows', () => {
    expect(joinFunctionTopologyProjectionV1({ candidates: [candidate], projections: [] })[0].status).toBe('PACKET_KEY_MISSING');
    expect(joinFunctionTopologyProjectionV1({ candidates: [candidate], projections: [projection, projection] })[0].status).toBe('AMBIGUOUS_PROJECTION');
    expect(joinFunctionTopologyProjectionV1({ candidates: [candidate], projections: [{ ...projection, treeNodeId: 'other' }] })[0].status).toBe('TREE_NODE_MISMATCH');
    expect(joinFunctionTopologyProjectionV1({ candidates: [candidate], projections: [{ ...projection, somX: 20 }] })[0].status).toBe('INVALID_SOM_COORDINATES');
  });

  it('normalizes bounded lexical query terms for the existing rg lane', () => {
    expect(normalizeFunctionSearchTermsV1('  SOM som $state foo.bar 𐐷 ')).toEqual(['som', '$state', 'foo.bar', '𐐷']);
  });
});
