import { describe, expect, it } from 'vitest';
import { auditGraphIdentityPopulation } from './graph-identity-audit.js';

const meta = { runId: 'run-1' };

describe('auditGraphIdentityPopulation', () => {
  it('reports zero collisions and proves identity gates on a clean population', () => {
    const receipt = auditGraphIdentityPopulation(
      {
        treeNodeIds: ['t1', 't2'],
        pageIndexPaths: ['p1', 'p2'],
        parseNodeIds: ['pn1', 'pn2'],
        symbolIds: ['s1', 's2'],
        symbolVersionIds: ['sv1', 'sv2'],
        canonicalDocumentSourceRefs: ['doc1'],
        canonicalChunkPacketKeys: ['pk1', 'pk2'],
        linkedPacketKeys: ['pk1', 'pk2'],
        orphanPacketKeys: [],
        maxDepth: 3,
        parserManifestBackend: 'tree-sitter',
        parserRuntimeBackend: 'tree-sitter',
      },
      meta,
    );

    expect(receipt.collisions).toEqual({
      pageIndexPath: 0,
      graphNodeKey: 0,
      parseNodeId: 0,
      symbolId: 0,
      symbolVersionId: 0,
    });
    expect(receipt.gates.packetTreeLineageProven).toBe(true);
    expect(receipt.gates.parseNodeIdentityProven).toBe(true);
    expect(receipt.gates.stableSymbolIdentityProven).toBe(true);
    expect(receipt.gates.symbolVersionIdentityProven).toBe(true);
    expect(receipt.gates.parserManifestAlignmentProven).toBe(true);
    expect(receipt.gates.canonicalGraphSnapshotProven).toBe(false);
  });

  it('detects duplicate symbolIds and fails the stable-symbol-identity gate', () => {
    const receipt = auditGraphIdentityPopulation(
      {
        treeNodeIds: ['t1'],
        pageIndexPaths: ['p1'],
        parseNodeIds: ['pn1'],
        symbolIds: ['s1', 's1', 's2'],
        symbolVersionIds: ['sv1'],
        canonicalDocumentSourceRefs: [],
        canonicalChunkPacketKeys: [],
        linkedPacketKeys: [],
        orphanPacketKeys: [],
        maxDepth: 1,
      },
      meta,
    );

    expect(receipt.collisions.symbolId).toBe(1);
    expect(receipt.gates.stableSymbolIdentityProven).toBe(false);
  });

  it('marks packetTreeLineageProven false when orphan packets exist', () => {
    const receipt = auditGraphIdentityPopulation(
      {
        treeNodeIds: [],
        pageIndexPaths: [],
        parseNodeIds: [],
        symbolIds: [],
        symbolVersionIds: [],
        canonicalDocumentSourceRefs: [],
        canonicalChunkPacketKeys: ['pk1'],
        linkedPacketKeys: ['pk1'],
        orphanPacketKeys: ['pk-orphan'],
        maxDepth: 0,
      },
      meta,
    );

    expect(receipt.gates.packetTreeLineageProven).toBe(false);
    expect(receipt.counts.orphanPackets).toBe(1);
  });

  it('marks parserManifestAlignmentProven false on backend mismatch', () => {
    const receipt = auditGraphIdentityPopulation(
      {
        treeNodeIds: [],
        pageIndexPaths: [],
        parseNodeIds: ['pn1'],
        symbolIds: [],
        symbolVersionIds: [],
        canonicalDocumentSourceRefs: [],
        canonicalChunkPacketKeys: [],
        linkedPacketKeys: [],
        orphanPacketKeys: [],
        maxDepth: 0,
        parserManifestBackend: 'tree-sitter',
        parserRuntimeBackend: 'ts-morph',
      },
      meta,
    );

    expect(receipt.gates.parserManifestAlignmentProven).toBe(false);
    expect(receipt.gates.parseNodeIdentityProven).toBe(false);
  });

  it('never auto-promotes canonicalGraphSnapshotProven', () => {
    const receipt = auditGraphIdentityPopulation(
      {
        treeNodeIds: ['t1'],
        pageIndexPaths: ['p1'],
        parseNodeIds: ['pn1'],
        symbolIds: ['s1'],
        symbolVersionIds: ['sv1'],
        canonicalDocumentSourceRefs: ['doc1'],
        canonicalChunkPacketKeys: ['pk1'],
        linkedPacketKeys: ['pk1'],
        orphanPacketKeys: [],
        maxDepth: 1,
        parserManifestBackend: 'x',
        parserRuntimeBackend: 'x',
      },
      meta,
    );

    expect(receipt.gates.canonicalGraphSnapshotProven).toBe(false);
    expect(receipt.gates.packetToSymbolLineageProven).toBe(false);
  });
});
