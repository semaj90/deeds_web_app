import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { materializeGraphSnapshot, type GraphSnapshotMaterializerInput } from './graph-snapshot-materializer.js';
import { admitNaryFactProposalV1 } from './nary-fact-admission-v1.js';
import { createNaryFactProposalV1 } from './nary-fact-proposal-v1.js';

const snapshotId = '44444444-4444-4444-8444-444444444444';
const baseInput = {
  snapshotId,
  workspaceId: 'workspace:parent-atlas',
  sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
  identityContractVersion: 'identity-contract-v1',
  parserContractVersion: 'tree-sitter-typescript-v1',
  generatedAt: '2026-07-23T12:00:00.000Z',
  treeNodes: [
    {
      nodeId: '11111111-1111-4111-8111-111111111111',
      parentId: null,
      rootId: '11111111-1111-4111-8111-111111111111',
      pageIndexPath: 'doc:root',
      nodeType: 'document',
      treeDepth: 0,
      sourceRef: 'src/root.md',
      filePath: 'src/root.md',
      packetKey: null,
      featureId: null,
      title: 'Root',
      summary: 'Root node',
      contentPreview: 'Root preview',
      domain: 'docs',
      somCluster: 1,
      communityId: 1,
      metadata: { lane: 'root', source: 'atlas_packets' },
      ledgerType: 'canonical',
      lineageVersion: 'tree-v1'
    },
    {
      nodeId: '22222222-2222-4222-8222-222222222222',
      parentId: '11111111-1111-4111-8111-111111111111',
      rootId: '11111111-1111-4111-8111-111111111111',
      pageIndexPath: 'doc:root/page:1',
      nodeType: 'page',
      treeDepth: 1,
      sourceRef: 'src/root.md',
      filePath: 'src/root.md',
      packetKey: null,
      featureId: 'feature:alpha',
      title: 'Page',
      summary: 'Page node',
      contentPreview: 'Page preview',
      domain: 'docs',
      somCluster: 2,
      communityId: 1,
      metadata: { lane: 'page', source: 'atlas_packets' },
      ledgerType: 'canonical',
      lineageVersion: 'tree-v1'
    },
    {
      nodeId: '33333333-3333-4333-8333-333333333333',
      parentId: '99999999-9999-4999-8999-999999999999',
      rootId: '11111111-1111-4111-8111-111111111111',
      pageIndexPath: 'doc:root/page:2',
      nodeType: 'page',
      treeDepth: 1,
      sourceRef: 'src/root.md',
      filePath: 'src/root.md',
      packetKey: null,
      featureId: 'feature:orphan',
      title: 'Orphan',
      summary: 'Orphan node',
      contentPreview: 'Orphan preview',
      domain: 'docs',
      somCluster: 3,
      communityId: 1,
      metadata: { lane: 'orphan', source: 'atlas_packets' },
      ledgerType: 'canonical',
      lineageVersion: 'tree-v1'
    }
  ],
  packets: [
    {
      packetKey: 'packet:alpha',
      sourceRef: 'src/root.md',
      canonicalSourceRef: 'src/root.md',
      directoryPath: 'src',
      filePath: 'src/root.md',
      functionSymbol: null,
      featureId: 'feature:alpha',
      featureLabel: 'Alpha',
      titleId: null,
      communityId: 7,
      clusterId: 3,
      sha256: 'sha-alpha',
      sourceKind: 'codebase',
      sourcePath: 'src/root.md',
      topology: { lane: 'alpha' },
      vectors: {},
      metadata: { summary: 'Alpha packet' },
      domainClass: 'code',
      tags: ['alpha'],
      lineageVersion: 'packet-v1',
      ledgerType: 'canonical',
      canonical: true,
      treeNodeId: '22222222-2222-4222-8222-222222222222',
      qdrantCollection: 'codebase_chunks_384_hybrid',
      qdrantVectorDim: 384
    },
    {
      packetKey: 'packet:orphan',
      sourceRef: 'src/root.md',
      canonicalSourceRef: 'src/root.md',
      directoryPath: 'src',
      filePath: 'src/root.md',
      functionSymbol: null,
      featureId: 'feature:orphan',
      featureLabel: 'Orphan',
      titleId: null,
      communityId: 8,
      clusterId: 4,
      sha256: 'sha-orphan',
      sourceKind: 'codebase',
      sourcePath: 'src/root.md',
      topology: { lane: 'orphan' },
      vectors: {},
      metadata: { summary: 'Orphan packet' },
      domainClass: 'code',
      tags: ['orphan'],
      lineageVersion: 'packet-v1',
      ledgerType: 'canonical',
      canonical: true,
      treeNodeId: null,
      qdrantCollection: 'codebase_chunks_384_hybrid',
      qdrantVectorDim: 384
    },
    {
      packetKey: 'packet:missing-tree',
      sourceRef: 'src/root.md',
      canonicalSourceRef: 'src/root.md',
      directoryPath: 'src',
      filePath: 'src/root.md',
      functionSymbol: null,
      featureId: 'feature:missing-tree',
      featureLabel: 'Missing tree',
      titleId: null,
      communityId: 9,
      clusterId: 5,
      sha256: 'sha-missing-tree',
      sourceKind: 'codebase',
      sourcePath: 'src/root.md',
      topology: { lane: 'missing-tree' },
      vectors: {},
      metadata: { summary: 'Missing tree packet' },
      domainClass: 'code',
      tags: ['missing-tree'],
      lineageVersion: 'packet-v1',
      ledgerType: 'canonical',
      canonical: true,
      treeNodeId: '99999999-9999-4999-8999-999999999999',
      qdrantCollection: 'codebase_chunks_384_hybrid',
      qdrantVectorDim: 384
    }
  ]
} as const;

describe('graph snapshot materializer', () => {
  it('materializes only exact-revision, packet-bound n-ary relation candidates', () => {
    const sourceBytes = Buffer.from('state drives component', 'utf8');
    const spanSha256 = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    const sourceRevision = spanSha256;
    const workspaceRevision = `sha256:${'b'.repeat(64)}`;
    const extraPackets = ['beta', 'gamma'].map((name, index) => ({
      ...baseInput.packets[0],
      packetKey: `packet:${name}`,
      featureId: `feature:${name}`,
      featureLabel: name,
      sourceRevision,
      treeNodeId: index === 0
        ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    }));
    const extraTreeNodes = extraPackets.map((packet, index) => ({
      ...baseInput.treeNodes[1],
      nodeId: packet.treeNodeId!,
      parentId: baseInput.treeNodes[0].nodeId,
      rootId: baseInput.treeNodes[0].nodeId,
      pageIndexPath: `doc:root/chunk:${index}`,
      nodeType: 'chunk',
      packetKey: packet.packetKey,
      sourceRevision,
      metadata: { source: 'atlas_packets', lane: 'chunk' }
    }));
    const input: GraphSnapshotMaterializerInput = {
      ...baseInput,
      workspaceRevision,
      treeNodes: [
        ...baseInput.treeNodes.map((node) => node.nodeId === baseInput.treeNodes[1].nodeId
          ? { ...node, sourceRevision }
          : node),
        ...extraTreeNodes
      ],
      packets: [
        { ...baseInput.packets[0], sourceRevision },
        ...baseInput.packets.slice(1),
        ...extraPackets
      ],
      relationCandidates: [{
        relationId: 'relation:rune-to-component',
        relationType: 'RUNE_DEPENDENCY',
        sourceRef: 'src/root.md',
        sourceRevision,
        workspaceRevision,
        confidence: 1,
        sourceSpan: {
          coordinateSystem: 'utf8-byte',
          startByte: 0,
          endByte: sourceBytes.byteLength,
          nodeContentSha256: spanSha256,
          parserId: 'svelte-compiler',
          parserVersion: '5.x-fixture',
          producerId: 'fixture-only',
          producerRevision: 'fixture-only:v1',
          evidenceRefs: ['ev:source-span:1']
        },
        participants: [
          { nodeKey: 'packet:alpha', role: 'component', ordinal: 0 },
          { nodeKey: 'packet:beta', role: 'state', ordinal: 1 },
          { nodeKey: 'packet:gamma', role: 'consumer', ordinal: 2 }
        ]
      }]
    };

    const result = materializeGraphSnapshot(input);
    expect(result.graphSnapshotRelationEvents).toHaveLength(1);
    expect(result.graphSnapshotRelationParticipants).toHaveLength(3);
    expect(result.graphSnapshot.relationEventCount).toBe(1);
    expect(result.graphSnapshotProof).toMatchObject({ eligibleRelationCount: 1, persistedRelationCount: 1, replayMatches: true });
    expect(result.graphSnapshotRelationEvents[0].topologyHash).toBe(result.graphSnapshot.topologyHash);
    expect(JSON.parse(result.graphSnapshotRelationEvents[0].evidenceSpan)).toMatchObject({
      sourceRevision,
      workspaceRevision,
      coordinateSystem: 'utf8-byte',
      startByte: 0,
      endByte: sourceBytes.byteLength,
      evidenceRefs: ['ev:source-span:1']
    });

    const tuple = {
      tupleId: 'tuple:rune-component-state',
      schemaVersion: 'ontology-linked-tuple.v1' as const,
      packetKey: 'packet:alpha',
      sourceRef: 'src/root.md',
      surfaceText: sourceBytes.toString('utf8'),
      label: 'RUNE_DEPENDENCY',
      labelKind: 'ontology' as const,
      labelSource: 'manual' as const,
      ontologyIds: [],
      conceptIds: [],
      participants: [
        { entityId: 'packet:alpha', entityKind: 'packet' as const, role: 'symbol' as const },
        { entityId: 'packet:beta', entityKind: 'packet' as const, role: 'input' as const },
        { entityId: 'packet:gamma', entityKind: 'packet' as const, role: 'output' as const }
      ],
      evidenceRefs: ['ev:source-span:1'],
      evidenceSpan: { sourceRef: 'src/root.md', start: 0, end: sourceBytes.byteLength },
      confidence: 1,
      evidenceState: 'ACTIVE_VERIFIED' as const,
      provenance: {
        sourceTables: [], labelerVersion: null, taggerVersion: null,
        ontologyVersion: null, nlpVersion: null, sourceRevision,
        workspaceRevision, evidenceSpanChecksum: spanSha256,
        producerId: 'fixture-only', producerRevision: 'fixture-only:v1'
      }
    };
    const proposedProposal = createNaryFactProposalV1({
      sourceRef: tuple.sourceRef,
      sourceRevision,
      workspaceRevision,
      packetKey: 'packet:alpha',
      graphRevision: `sha256:${'d'.repeat(64)}`,
      producerRevision: 'fixture-only:v1',
      predicate: 'RUNE_DEPENDENCY',
      participants: tuple.participants.map((participant, ordinal) => ({
        canonicalId: participant.entityId,
        role: participant.role,
        ordinal,
        entityType: participant.entityKind.toUpperCase()
      })),
      evidenceRefs: tuple.evidenceRefs,
      admission: 'PROPOSED'
    });
    const proposal = admitNaryFactProposalV1({
      proposal: proposedProposal,
      owners: proposedProposal.participants.map(({ canonicalId, entityType, entityRevision, sourceRef }) => ({
        canonicalId, entityType, entityRevision, sourceRef
      })),
      expectedWorkspaceRevision: workspaceRevision,
      expectedGraphRevision: proposedProposal.graphRevision,
      currentness: {
        status: 'GRAPHIFY_RUN_OWNER_COMPLETE',
        workspaceRevision,
        graphRevision: proposedProposal.graphRevision,
        authoritativeGraphRun: true
      }
    });
    const tupleResult = materializeGraphSnapshot({
      ...input,
      relationCandidates: [],
      ontologyTupleCandidates: [{
        tuple,
        proposal,
        sourceSpanProof: {
          sourceRef: 'src/root.md', sourceRevision, workspaceRevision,
          coordinateSystem: 'utf8-byte', sourceBytes,
          producerId: 'fixture-only', producerRevision: 'fixture-only:v1',
          evidenceRefs: ['ev:source-span:1']
        }
      }]
    });
    expect(tupleResult.graphSnapshotRelationEvents).toHaveLength(1);
    expect(tupleResult.graphSnapshotRelationEvents[0]).toMatchObject({ relationId: 'nary:tuple:rune-component-state', sourceRef: 'src/root.md' });
    expect(tupleResult.graphSnapshotRelationParticipants).toHaveLength(3);

    const createAdmittedProposal = (participants: typeof proposal.participants) => createNaryFactProposalV1({
      sourceRef: proposal.sourceRef,
      sourceRevision: proposal.sourceRevision,
      workspaceRevision: proposal.workspaceRevision,
      packetKey: proposal.packetKey,
      graphRevision: proposal.graphRevision,
      producerRevision: proposal.producerRevision,
      ontologyRevision: proposal.ontologyRevision,
      predicate: proposal.predicate,
      predicatePolicy: proposal.predicatePolicy,
      participants,
      evidenceRefs: proposal.evidenceRefs,
      admission: 'ADMITTED'
    });
    const sourceRefMismatch = createAdmittedProposal(proposal.participants.map((participant, index) => index === 1
      ? { ...participant, sourceRef: 'src/other.ts' }
      : participant));
    const revisionMismatch = createAdmittedProposal(proposal.participants.map((participant, index) => index === 1
      ? { ...participant, entityRevision: `sha256:${'c'.repeat(64)}` }
      : participant));
    for (const [invalidProposal, expectedReason] of [
      [sourceRefMismatch, 'ONTOLOGY_TUPLE_PARTICIPANT_SOURCE_REF_MISMATCH'],
      [revisionMismatch, 'ONTOLOGY_TUPLE_PARTICIPANT_SOURCE_REVISION_MISMATCH']
    ] as const) {
      const invalidResult = materializeGraphSnapshot({
        ...input,
        relationCandidates: [],
        ontologyTupleCandidates: [{
          tuple,
          proposal: invalidProposal,
          sourceSpanProof: {
            sourceRef: 'src/root.md', sourceRevision, workspaceRevision,
            coordinateSystem: 'utf8-byte', sourceBytes,
            producerId: 'fixture-only', producerRevision: 'fixture-only:v1',
            evidenceRefs: ['ev:source-span:1']
          }
        }]
      });
      expect(invalidResult.graphSnapshotRelationEvents).toHaveLength(0);
      expect(invalidResult.graphSnapshotExclusions).toContainEqual(expect.objectContaining({ exclusionReason: expectedReason }));
    }

    const proposedOnlyResult = materializeGraphSnapshot({
      ...input,
      relationCandidates: [],
      ontologyTupleCandidates: [{
        tuple,
        proposal: proposedProposal,
        sourceSpanProof: {
          sourceRef: 'src/root.md', sourceRevision, workspaceRevision,
          coordinateSystem: 'utf8-byte', sourceBytes,
          producerId: 'fixture-only', producerRevision: 'fixture-only:v1',
          evidenceRefs: ['ev:source-span:1']
        }
      }]
    });
    expect(proposedOnlyResult.graphSnapshotRelationEvents).toHaveLength(0);
    expect(proposedOnlyResult.graphSnapshotExclusions).toContainEqual(expect.objectContaining({
      exclusionReason: 'NARY_PROPOSAL_NOT_ADMITTED'
    }));

    const mismatchedProofResult = materializeGraphSnapshot({
      ...input,
      relationCandidates: [],
      ontologyTupleCandidates: [{
        tuple,
        proposal,
        sourceSpanProof: {
          sourceRef: 'src/root.md', sourceRevision, workspaceRevision,
          coordinateSystem: 'utf8-byte', sourceBytes: Buffer.from('state drives incorrect', 'utf8'),
          producerId: 'fixture-only', producerRevision: 'fixture-only:v1',
          evidenceRefs: ['ev:source-span:1']
        }
      }]
    });
    expect(mismatchedProofResult.graphSnapshotRelationEvents).toHaveLength(0);
    expect(mismatchedProofResult.graphSnapshotExclusions).toContainEqual(expect.objectContaining({
      exclusionReason: 'ONTOLOGY_TUPLE_SOURCE_BYTES_MISMATCH'
    }));
  });

  it('excludes an n-ary relation when participant packet identity is unresolved', () => {
    const input = {
      ...baseInput,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      relationCandidates: [{
        relationId: 'relation:unresolved',
        relationType: 'CALLS',
        sourceRef: 'src/root.md',
        sourceRevision: `sha256:${'a'.repeat(64)}`,
        workspaceRevision: `sha256:${'b'.repeat(64)}`,
        confidence: 0.9,
        sourceSpan: {
          coordinateSystem: 'utf8-byte', startByte: 1, endByte: 2,
          nodeContentSha256: `sha256:${'c'.repeat(64)}`,
          parserId: 'tree-sitter', parserVersion: 'fixture', producerId: 'fixture', producerRevision: 'fixture:v1', evidenceRefs: ['ev:1']
        },
        participants: [
          { nodeKey: 'packet:alpha', role: 'caller', ordinal: 0 },
          { nodeKey: 'packet:missing-a', role: 'callee', ordinal: 1 },
          { nodeKey: 'packet:missing-b', role: 'evidence', ordinal: 2 }
        ]
      }]
    };
    const result = materializeGraphSnapshot(input);

    expect(result.graphSnapshotRelationEvents).toHaveLength(0);
    expect(result.graphSnapshotRelationParticipants).toHaveLength(0);
    expect(result.graphSnapshotExclusions).toContainEqual(expect.objectContaining({
      exclusionStage: 'relation_materialization',
      exclusionReason: 'RELATION_PARTICIPANT_IDENTITY_UNQUALIFIED',
      candidateKey: 'relation:unresolved'
    }));
  });

  it('includes an explicitly source-bound tree revision in the node row and inventory identity', () => {
    const sourceRevision = `sha256:${'a'.repeat(64)}`;
    const unbound = materializeGraphSnapshot(baseInput);
    const bound = materializeGraphSnapshot({
      ...baseInput,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      treeNodes: baseInput.treeNodes.map((node, index) => index === 0 ? { ...node, sourceRevision } : node),
    });
    const root = bound.graphSnapshotNodes.find((node) => node.nodeKey === 'tree:11111111-1111-4111-8111-111111111111');

    expect(root?.properties).toMatchObject({ sourceRevision, workspaceRevision: `sha256:${'b'.repeat(64)}` });
    expect(bound.graphSnapshot.sourceManifest).toMatchObject({ workspaceRevision: `sha256:${'b'.repeat(64)}` });
    expect(unbound.graphSnapshot.sourceManifest).toMatchObject({ workspaceRevision: null });
    expect(bound.graphSnapshotProof.sourceInventoryHash).not.toBe(unbound.graphSnapshotProof.sourceInventoryHash);
  });

  it('materializes a Graphify reference only after exact symbol, byte-span, packet, and revision binding', () => {
    const sourceBytes = Buffer.from('function caller() { helper(); }\n', 'utf8');
    const targetSourceBytes = Buffer.from('export function helper() {}\n', 'utf8');
    const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    const targetSourceRevision = `sha256:${createHash('sha256').update(targetSourceBytes).digest('hex')}`;
    const workspaceRevision = `sha256:${'b'.repeat(64)}`;
    const targetTreeNodeId = '44444444-4444-4444-8444-444444444444';
    const declarationSpan = (bytes: Buffer) => ({ startByte: 0, endByte: bytes.indexOf(0x0a) });
    const sourceSymbolSpan = declarationSpan(sourceBytes);
    const targetSymbolSpan = declarationSpan(targetSourceBytes);
    const symbol = (input: {
      stableSymbolKey: string;
      sourceRef: string;
      sourceRevision: string;
      sourceBytes: Buffer;
      span: { startByte: number; endByte: number };
      fileId: string;
    }) => ({
      schema: 'atlas.graphify-symbol-projection-candidate.v1' as const,
      fileId: input.fileId,
      workspaceRevision,
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      stableSymbolKey: input.stableSymbolKey,
      symbolKind: 'function',
      qualifiedName: input.stableSymbolKey,
      parentStableSymbolKey: null,
      ...input.span,
      startRow: 0,
      endRow: 0,
      signatureText: null,
      sourceTextHash: createHash('sha256').update(input.sourceBytes.slice(input.span.startByte, input.span.endByte)).digest('hex'),
      astFingerprint: 'a'.repeat(64),
      upstreamNodeId: input.stableSymbolKey,
      upstreamSymbolId: null,
      upstreamChunkId: `chunk:${input.stableSymbolKey}`,
      extractorRevision: 'extractor:v1'
    });
    const subjectSymbol = {
      ...symbol({
      stableSymbolKey: 'symbol:caller', sourceRef: 'src/root.md', sourceRevision,
      sourceBytes, span: sourceSymbolSpan, fileId: '77777777-7777-4777-8777-777777777777'
      }),
      upstreamNodeId: '55555555-5555-4555-8555-555555555555'
    };
    const targetSymbol = symbol({
      stableSymbolKey: 'symbol:helper', sourceRef: 'src/helper.ts', sourceRevision: targetSourceRevision,
      sourceBytes: targetSourceBytes, span: targetSymbolSpan, fileId: '88888888-8888-4888-8888-888888888888'
    });
    const callStart = sourceBytes.indexOf('helper()');
    const graphifyEdge = {
      schema: 'atlas.graphify-edge-projection-candidate.v1' as const,
      workspaceId: '99999999-9999-4999-8999-999999999999',
      workspaceRevision,
      sourceRef: 'src/root.md',
      sourceRevision,
      subjectStableSymbolKey: 'symbol:caller',
      predicate: 'CALLS',
      objectStableSymbolKey: 'symbol:helper',
      objectSourceRef: 'src/helper.ts',
      objectSourceRevision: targetSourceRevision,
      unresolvedTarget: null,
      evidenceKind: 'tree_sitter_reference',
      evidenceSpan: { startByte: callStart, endByte: callStart + Buffer.byteLength('helper()'), startRow: 0, endRow: 0 },
      confidence: 1,
      evidenceRefs: ['receipt:root-reference'],
      referenceId: 'reference:caller-helper'
    };
    const input = {
      ...baseInput,
      workspaceRevision,
      treeNodes: [
        ...baseInput.treeNodes.map((node) => ({ ...node, sourceRevision })),
        {
          ...baseInput.treeNodes[1],
          nodeId: targetTreeNodeId,
          parentId: baseInput.treeNodes[0].nodeId,
          rootId: baseInput.treeNodes[0].nodeId,
          pageIndexPath: 'doc:root/page:helper',
          sourceRef: 'src/helper.ts',
          filePath: 'src/helper.ts',
          sourceRevision: targetSourceRevision,
          title: 'helper'
        }
      ],
      packets: [
        ...baseInput.packets.map((packet) => ({
          ...packet,
          sourceRevision,
          ...(packet.packetKey === 'packet:alpha' ? { byteStart: 0, byteEnd: sourceBytes.byteLength } : {})
        })),
        {
          ...baseInput.packets[0],
          packetKey: 'packet:beta',
          sourceRef: 'src/helper.ts',
          canonicalSourceRef: 'src/helper.ts',
          filePath: 'src/helper.ts',
          sourcePath: 'src/helper.ts',
          sourceRevision: targetSourceRevision,
          sha256: targetSourceRevision,
          byteStart: 0,
          byteEnd: targetSourceBytes.byteLength,
          treeNodeId: targetTreeNodeId
        }
      ],
      graphifyPacketEdgeCandidates: [{
        edge: graphifyEdge,
        subjectSymbol,
        targetSymbol,
        sourcePacketKey: 'packet:alpha',
        targetPacketKey: 'packet:beta',
        sourceSymbolKey: 'symbol:caller',
        targetSymbolKey: 'symbol:helper',
        graphRevision: 'c'.repeat(64),
        sourceBytes,
        targetSourceBytes
      }]
    };
    const result = materializeGraphSnapshot(input);

    expect(result.graphSnapshotEdges).toContainEqual(expect.objectContaining({
      edgeType: 'CALLS',
      sourceNodeKey: 'packet:alpha',
      targetNodeKey: 'packet:beta',
      provenance: 'graphify_structural_reference',
      properties: expect.objectContaining({
        referenceId: 'reference:caller-helper',
        sourceSymbolKey: 'symbol:caller',
        targetSymbolKey: 'symbol:helper',
        sourceRevision,
        targetSourceRevision,
        canonicalAuthority: false
      })
    }));
    expect(result.graphSnapshotRelationEvents).toHaveLength(1);
    const callerSymbolNode = result.graphSnapshotNodes.find((node) => node.nodeType === 'symbol'
      && node.properties.graphifyStableSymbolKey === subjectSymbol.stableSymbolKey);
    const calleeSymbolNode = result.graphSnapshotNodes.find((node) => node.nodeType === 'symbol'
      && node.properties.graphifyStableSymbolKey === targetSymbol.stableSymbolKey);
    expect(callerSymbolNode).toMatchObject({
      packetKey: 'packet:alpha',
      treeNodeId: null,
      sourceRef: 'src/root.md',
      properties: { sourceRevision, workspaceRevision, canonicalAuthority: false }
    });
    expect(calleeSymbolNode).toMatchObject({
      packetKey: 'packet:beta',
      treeNodeId: null,
      sourceRef: 'src/helper.ts',
      properties: { sourceRevision: targetSourceRevision, workspaceRevision, canonicalAuthority: false }
    });
    expect(result.graphSnapshotRelationParticipants.map((participant) => [participant.nodeKey, participant.role])).toEqual([
      ['packet:alpha', 'CALLER_PACKET'],
      [callerSymbolNode!.nodeKey, 'CALLER_AST_SYMBOL'],
      [calleeSymbolNode!.nodeKey, 'CALLEE_AST_SYMBOL'],
      ['packet:beta', 'CALLEE_PACKET']
    ]);
    expect(result.graphSnapshotProof.eligibleNodeCount).toBe(result.graphSnapshotNodes.length);
    expect(result.graphSnapshotProof.replayMatches).toBe(true);

    const packetSpanMismatch = materializeGraphSnapshot({
      ...input,
      packets: input.packets.map((packet) => packet.packetKey === 'packet:alpha'
        ? { ...packet, byteEnd: subjectSymbol.startByte }
        : packet)
    });
    expect(packetSpanMismatch.graphSnapshotEdges.some((item) => item.provenance === 'graphify_structural_reference')).toBe(false);
    expect(packetSpanMismatch.graphSnapshotExclusions).toContainEqual(expect.objectContaining({
      exclusionReason: 'GRAPHIFY_EDGE_PACKET_SPAN_DOES_NOT_COVER_SYMBOL'
    }));
    expect(packetSpanMismatch.graphSnapshotRelationEvents).toHaveLength(0);
  });

  it('rejects Graphify edges when either symbol span does not match the revision-bound bytes', () => {
    const sourceBytes = Buffer.from('function caller() { helper(); }\n', 'utf8');
    const targetSourceBytes = Buffer.from('export function helper() {}\n', 'utf8');
    const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    const targetSourceRevision = `sha256:${createHash('sha256').update(targetSourceBytes).digest('hex')}`;
    const workspaceRevision = `sha256:${'b'.repeat(64)}`;
    const alteredSubject = {
      schema: 'atlas.graphify-symbol-projection-candidate.v1' as const,
      fileId: '77777777-7777-4777-8777-777777777777',
      workspaceRevision,
      sourceRef: 'src/root.md',
      sourceRevision,
      stableSymbolKey: 'symbol:caller',
      symbolKind: 'function',
      qualifiedName: 'caller',
      startByte: 0,
      endByte: 1,
      startRow: 0,
      endRow: 0,
      sourceTextHash: 'd'.repeat(64),
      astFingerprint: 'a'.repeat(64),
      upstreamNodeId: 'node:caller',
      upstreamChunkId: 'chunk:caller',
      extractorRevision: 'extractor:v1'
    };
    const targetSymbol = {
      ...alteredSubject,
      fileId: '88888888-8888-4888-8888-888888888888',
      sourceRef: 'src/helper.ts',
      sourceRevision: targetSourceRevision,
      stableSymbolKey: 'symbol:helper',
      qualifiedName: 'helper',
      endByte: Buffer.byteLength('export function helper() {}'),
      sourceTextHash: createHash('sha256').update(targetSourceBytes.slice(0, Buffer.byteLength('export function helper() {}'))).digest('hex')
    };
    const edge = {
      schema: 'atlas.graphify-edge-projection-candidate.v1' as const,
      workspaceId: '99999999-9999-4999-8999-999999999999',
      workspaceRevision,
      sourceRef: 'src/root.md',
      sourceRevision,
      subjectStableSymbolKey: 'symbol:caller',
      predicate: 'CALLS',
      objectStableSymbolKey: 'symbol:helper',
      objectSourceRef: 'src/helper.ts',
      objectSourceRevision: targetSourceRevision,
      unresolvedTarget: null,
      evidenceKind: 'tree_sitter_reference',
      evidenceSpan: { startByte: 0, endByte: 1, startRow: 0, endRow: 0 },
      confidence: 1,
      evidenceRefs: ['receipt:root-reference'],
      referenceId: 'reference:bad-span'
    };
    const result = materializeGraphSnapshot({
      ...baseInput,
      workspaceRevision,
      packets: baseInput.packets.map((packet) => ({
        ...packet,
        sourceRevision,
        ...(packet.packetKey === 'packet:alpha' ? { byteStart: 0, byteEnd: sourceBytes.byteLength } : {})
      })),
      graphifyPacketEdgeCandidates: [{
        edge,
        subjectSymbol: alteredSubject,
        targetSymbol,
        sourcePacketKey: 'packet:alpha',
        targetPacketKey: 'packet:alpha',
        sourceSymbolKey: 'symbol:caller',
        targetSymbolKey: 'symbol:helper',
        graphRevision: 'c'.repeat(64),
        sourceBytes,
        targetSourceBytes
      }]
    });

    expect(result.graphSnapshotEdges.some((item) => item.provenance === 'graphify_structural_reference')).toBe(false);
    expect(result.graphSnapshotExclusions).toContainEqual(expect.objectContaining({
      exclusionReason: 'GRAPHIFY_EDGE_SOURCE_BYTES_OR_SPAN_MISMATCH'
    }));
  });

  it('materializes a deterministic immutable snapshot with exclusion accounting', () => {
    const left = materializeGraphSnapshot(baseInput);
    const right = materializeGraphSnapshot({
      ...baseInput,
      treeNodes: [...baseInput.treeNodes].reverse(),
      packets: [...baseInput.packets].reverse()
    });

    expect(left.graphSnapshot.snapshotId).toBe(snapshotId);
    expect(left.graphSnapshot.status).toBe('BUILDING');
    expect(left.graphSnapshotManifest.status).toBe('MATERIALIZED');
    expect(left.graphSnapshotManifest.topologyHash).toBe(left.graphSnapshot.topologyHash);
    expect(left.graphSnapshotProof.replayMatches).toBe(true);
    expect(left.graphSnapshotProof.topologyHash).toBe(left.graphSnapshotProof.replayedTopologyHash);
    expect(left.graphSnapshotProof.topologyHash).toBe(right.graphSnapshotProof.topologyHash);

    expect(left.graphSnapshotNodes.every((node) => node.snapshotId === snapshotId)).toBe(true);
    expect(left.graphSnapshotEdges.every((edge) => edge.snapshotId === snapshotId)).toBe(true);
    expect(left.graphSnapshotExclusions.every((exclusion) => exclusion.snapshotId === snapshotId)).toBe(true);
    expect(left.graphSnapshotNodes.filter((node) => node.nodeType === 'packet').every((node) => node.treeNodeId === null)).toBe(true);
    expect(left.graphSnapshotEdges.map((edge) => edge.edgeType)).toEqual(expect.arrayContaining(['CONTAINS', 'DERIVED_FROM']));

    expect(left.graphSnapshotManifest).toMatchObject({
      snapshotId,
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      nodeCount: 4,
      edgeCount: 2,
      excludedNodeCount: 2,
      excludedEdgeCount: 1,
      status: 'MATERIALIZED'
    });

    expect(left.graphSnapshotProof).toMatchObject({
      snapshotId,
      eligibleNodeCount: 4,
      persistedNodeCount: 4,
      eligibleEdgeCount: 2,
      persistedEdgeCount: 2,
      excludedNodeCount: 2,
      excludedEdgeCount: 1,
      unresolvedEndpointCount: 2,
      duplicateRelationCount: 0,
      selfLoopCount: 0
    });
    expect(
      left.graphSnapshotEdges.find((edge) => edge.edgeType === 'DERIVED_FROM')
    ).toMatchObject({
      // NOT 'packet:packet:alpha' -- packet.packetKey ('packet:alpha') already
      // carries the canonical prefix; this must match the packet node's own
      // nodeKey (see the node-construction fix in graph-snapshot-materializer.ts)
      // or the edge points at a sourceNodeKey no real node has.
      sourceNodeKey: 'packet:alpha',
      targetNodeKey: 'tree:22222222-2222-4222-8222-222222222222',
      properties: {
        packetKey: 'packet:alpha',
        derivedFromTreeNodeId: '22222222-2222-4222-8222-222222222222'
      }
    });
    expect(
      left.graphSnapshotNodes.find((node) => node.nodeType === 'packet')?.nodeKey
    ).toBe('packet:alpha');

    expect(left.graphSnapshotExclusions.map((item) => item.exclusionReason)).toEqual(
      expect.arrayContaining(['MISSING_PARENT_NODE', 'MISSING_TREE_NODE_ID', 'UNRESOLVED_TREE_NODE_ID'])
    );
    expect(left.graphSnapshotProof.topologyHash).toBe(right.graphSnapshotProof.topologyHash);
  });

  it('records duplicate identities and self loops as exclusions instead of dropping them silently', () => {
    const result = materializeGraphSnapshot({
      ...baseInput,
      treeNodes: [
        baseInput.treeNodes[0],
        {
          nodeId: '44444444-4444-4444-8444-444444444444',
          parentId: '44444444-4444-4444-8444-444444444444',
          rootId: '11111111-1111-4111-8111-111111111111',
          pageIndexPath: 'doc:root/page:self',
          nodeType: 'page',
          treeDepth: 1,
          sourceRef: 'src/root.md',
          filePath: 'src/root.md',
          packetKey: null,
          featureId: 'feature:self',
          title: 'Self loop',
          summary: 'Self loop node',
          contentPreview: 'Self loop preview',
          domain: 'docs',
          somCluster: 4,
          communityId: 1,
          metadata: { lane: 'self', source: 'atlas_packets' },
          ledgerType: 'canonical',
          lineageVersion: 'tree-v1'
        },
        {
          nodeId: '44444444-4444-4444-8444-444444444444',
          parentId: '44444444-4444-4444-8444-444444444444',
          rootId: '11111111-1111-4111-8111-111111111111',
          pageIndexPath: 'doc:root/page:self',
          nodeType: 'page',
          treeDepth: 1,
          sourceRef: 'src/root.md',
          filePath: 'src/root.md',
          packetKey: null,
          featureId: 'feature:self',
          title: 'Self loop duplicate',
          summary: 'Self loop duplicate node',
          contentPreview: 'Self loop duplicate preview',
          domain: 'docs',
          somCluster: 4,
          communityId: 1,
          metadata: { lane: 'self-duplicate', source: 'atlas_packets' },
          ledgerType: 'canonical',
          lineageVersion: 'tree-v1'
        }
      ],
      packets: [
        baseInput.packets[0],
        {
          ...baseInput.packets[0],
          metadata: { summary: 'Duplicate packet identity' }
        }
      ]
    });

    expect(result.graphSnapshotManifest.excludedNodeCount).toBeGreaterThanOrEqual(2);
    expect(result.graphSnapshotProof.selfLoopCount).toBe(1);
    expect(result.graphSnapshotExclusions.map((item) => item.exclusionReason)).toEqual(
      expect.arrayContaining(['TREE_SELF_LOOP', 'DUPLICATE_TREE_NODE_ID', 'DUPLICATE_PACKET_KEY'])
    );
  });
});

describe('canonical graph eligibility (provenance-aware admission)', () => {
  const eligibilitySnapshotId = '55555555-5555-4555-8555-555555555555';
  const rootId = '66666666-6666-4666-8666-666666666666';

  function treeNode(overrides: {
    nodeId: string;
    nodeType: string;
    ledgerType: string | null;
    metadata: Record<string, unknown>;
  }) {
    return {
      nodeId: overrides.nodeId,
      parentId: null,
      rootId,
      pageIndexPath: `doc:${overrides.nodeId}`,
      nodeType: overrides.nodeType,
      treeDepth: overrides.nodeType === 'chunk' ? 1 : 0,
      sourceRef: 'src/eligibility.ts',
      filePath: 'src/eligibility.ts',
      packetKey: overrides.nodeType === 'chunk' ? `packet:${overrides.nodeId}` : null,
      featureId: null,
      title: null,
      summary: null,
      contentPreview: null,
      domain: null,
      somCluster: null,
      communityId: null,
      metadata: overrides.metadata,
      ledgerType: overrides.ledgerType,
      lineageVersion: 'tree-nodes-v1'
    };
  }

  function materialize(nodes: ReturnType<typeof treeNode>[]) {
    return materializeGraphSnapshot({
      snapshotId: eligibilitySnapshotId,
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:eligibility',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-08-10T00:00:00.000Z',
      treeNodes: nodes,
      packets: []
    });
  }

  it('admits a canonical atlas_packets document node', () => {
    const result = materialize([
      treeNode({ nodeId: '10000000-0000-4000-8000-000000000001', nodeType: 'document', ledgerType: 'canonical', metadata: { source: 'atlas_packets' } })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(1);
    expect(result.graphSnapshotNodes[0].properties).toMatchObject({ eligibilityFamily: 'packet_hierarchy' });
    expect(result.graphSnapshotProof.rejectionCounts).toEqual({});
  });

  it('admits a canonical atlas_packets chunk node', () => {
    const result = materialize([
      treeNode({ nodeId: '10000000-0000-4000-8000-000000000002', nodeType: 'chunk', ledgerType: 'canonical', metadata: { source: 'atlas_packets' } })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(1);
    expect(result.graphSnapshotNodes[0].properties).toMatchObject({ eligibilityFamily: 'packet_hierarchy' });
  });

  it('admits a canonical real tree-sitter AST symbol with structuralTruth proven', () => {
    const result = materialize([
      treeNode({
        nodeId: '10000000-0000-4000-8000-000000000003',
        nodeType: 'function_declaration',
        ledgerType: 'canonical',
        metadata: { extractionMethod: 'tree_sitter', structuralTruth: true, producerId: 'ast-treesitter-facts' }
      })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(1);
    expect(result.graphSnapshotNodes[0].properties).toMatchObject({ eligibilityFamily: 'ast_symbol' });
  });

  it('rejects a Batch A heuristic symbol as HEURISTIC_AST_PROJECTION even when ledger_type is canonical', () => {
    const result = materialize([
      treeNode({
        nodeId: '10000000-0000-4000-8000-000000000004',
        nodeType: 'arrow_function',
        ledgerType: 'canonical',
        metadata: { extractionMethod: 'regex_heuristic', structuralTruth: false, producerId: 'batch-a-structural-materializer' }
      })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(0);
    expect(result.graphSnapshotExclusions[0].exclusionReason).toBe('HEURISTIC_AST_PROJECTION');
    expect(result.graphSnapshotProof.rejectionCounts).toMatchObject({ HEURISTIC_AST_PROJECTION: 1 });
  });

  it('rejects a Batch A symbol correctly tagged non-canonical as NON_CANONICAL_LEDGER_TYPE', () => {
    const result = materialize([
      treeNode({
        nodeId: '10000000-0000-4000-8000-000000000005',
        nodeType: 'class_declaration',
        ledgerType: 'synthetic',
        metadata: { extractionMethod: 'regex_heuristic', structuralTruth: false, producerId: 'batch-a-structural-materializer' }
      })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(0);
    expect(result.graphSnapshotExclusions[0].exclusionReason).toBe('NON_CANONICAL_LEDGER_TYPE');
    expect(result.graphSnapshotProof.rejectionCounts).toMatchObject({ NON_CANONICAL_LEDGER_TYPE: 1 });
  });

  it('fails closed on a symbol with unknown/missing provenance instead of trusting it', () => {
    const result = materialize([
      treeNode({ nodeId: '10000000-0000-4000-8000-000000000006', nodeType: 'interface_declaration', ledgerType: 'canonical', metadata: {} })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(0);
    // Missing structuralTruth is the first provenance gap an unknown producer trips —
    // the important assertion is REJECT, not which specific reason fires first.
    expect(result.graphSnapshotExclusions[0].exclusionReason).toBe('STRUCTURAL_TRUTH_NOT_PROVEN');
  });

  it('rejects an untrusted packet-hierarchy source even when ledger_type is canonical', () => {
    const result = materialize([
      treeNode({ nodeId: '10000000-0000-4000-8000-000000000007', nodeType: 'document', ledgerType: 'canonical', metadata: { source: 'some-other-writer' } })
    ]);
    expect(result.graphSnapshotNodes).toHaveLength(0);
    expect(result.graphSnapshotExclusions[0].exclusionReason).toBe('UNTRUSTED_PACKET_HIERARCHY_SOURCE');
  });
});
