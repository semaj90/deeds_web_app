// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildGraphProjectionManifestV1,
  diffGraphProjectionManifests,
  computeSourceMembershipChecksum,
} from '../graph-projection-manifest-v1.js';

describe('GraphProjectionManifestV1', () => {
  it('membership checksum is order-independent', () => {
    const a = computeSourceMembershipChecksum(['n1', 'n2', 'n3']);
    const b = computeSourceMembershipChecksum(['n3', 'n1', 'n2']);
    expect(a).toBe(b);
  });

  it('membership checksum changes when the node set changes', () => {
    const a = computeSourceMembershipChecksum(['n1', 'n2']);
    const b = computeSourceMembershipChecksum(['n1', 'n2', 'n3']);
    expect(a).not.toBe(b);
  });

  it('two identical projections diff as identical with no divergence', () => {
    const build = () => buildGraphProjectionManifestV1({
      projectionName: 'test',
      nodeLabels: ['Packet'],
      relationshipTypes: ['SIMILAR_TOPOLOGY'],
      externalIds: ['a', 'b', 'c'],
      ordinalEntries: [{ externalId: 'a', ordinal: 0 }, { externalId: 'b', ordinal: 1 }, { externalId: 'c', ordinal: 2 }],
      edgeCount: 5,
    });
    const diff = diffGraphProjectionManifests(build(), build());
    expect(diff.identical).toBe(true);
    expect(diff.labelSetDiffers).toBe(false);
    expect(diff.relationshipSetDiffers).toBe(false);
    expect(diff.membershipDiffers).toBe(false);
    expect(diff.ordinalAssignmentDiffers).toBe(false);
  });

  it('reports the exact relationship-type divergence, matching the real codeTopology vs packetGraph_leiden case', () => {
    const codeTopology = buildGraphProjectionManifestV1({
      projectionName: 'codeTopology',
      nodeLabels: ['Packet', 'CodebaseFile'],
      relationshipTypes: ['IMPORTS', 'CALLS', 'SIMILAR_TOPOLOGY'],
      externalIds: ['a', 'b'],
      ordinalEntries: [{ externalId: 'a', ordinal: 0 }, { externalId: 'b', ordinal: 1 }],
      edgeCount: 10,
    });
    const packetGraphLeiden = buildGraphProjectionManifestV1({
      projectionName: 'packetGraph_leiden',
      nodeLabels: ['Packet'],
      relationshipTypes: ['SIMILAR_TOPOLOGY'],
      externalIds: ['a', 'b'],
      ordinalEntries: [{ externalId: 'a', ordinal: 0 }, { externalId: 'b', ordinal: 1 }],
      edgeCount: 3,
    });
    const diff = diffGraphProjectionManifests(codeTopology, packetGraphLeiden);
    expect(diff.identical).toBe(false);
    expect(diff.labelSetDiffers).toBe(true);
    expect(diff.relationshipSetDiffers).toBe(true);
    // Membership checksum matches (same node ids) even though the graphs differ structurally --
    // this is exactly the case that node/edge counts alone would NOT distinguish from "identical".
    expect(diff.membershipDiffers).toBe(false);
    expect(diff.onlyInA.relationshipTypes.sort()).toEqual(['CALLS', 'IMPORTS']);
    expect(diff.onlyInA.nodeLabels).toEqual(['CodebaseFile']);
    expect(diff.onlyInB.relationshipTypes).toEqual([]);
  });

  it('ordinal checksum catches a re-ordering that membership checksum alone would miss', () => {
    const base = { projectionName: 'p', nodeLabels: ['Packet'], relationshipTypes: ['SIMILAR_TOPOLOGY'], externalIds: ['a', 'b'], edgeCount: 1 };
    const first = buildGraphProjectionManifestV1({ ...base, ordinalEntries: [{ externalId: 'a', ordinal: 0 }, { externalId: 'b', ordinal: 1 }] });
    const reordered = buildGraphProjectionManifestV1({ ...base, ordinalEntries: [{ externalId: 'a', ordinal: 1 }, { externalId: 'b', ordinal: 0 }] });
    const diff = diffGraphProjectionManifests(first, reordered);
    expect(diff.membershipDiffers).toBe(false);
    expect(diff.ordinalAssignmentDiffers).toBe(true);
    expect(diff.identical).toBe(false);
  });
});
