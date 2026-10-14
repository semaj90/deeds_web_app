import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { buildAcePacketV3, verifyAcePacketV3 } from '../../../packages/parent-atlas/src/core/ace-packet-v3.js';
import { auditSummaryQuality } from '$lib/server/packet/summary-enrichment';
import { referenceBfs } from '$lib/server/atlas/graph/bfs-parity.js';
import {
  CodeAssetGraphV1Schema,
  codeAssetEdgeId,
  codeAssetId,
} from '$lib/server/atlas/code-archaeology/code-asset-graph.js';
import { materializeCandidateOrdinalMap } from '$lib/server/atlas/features/canonical-candidate-v1.js';
import { admitCurrentCandidateFeatureSnapshotV1 } from '$lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import { bridgeAcePacketsToContextManifestV1 } from '$lib/server/atlas/context/ace-packet-v3-context-manifest-bridge-v1.js';
import { writeAcePacketV3ToBitfrostV1 } from '$lib/server/atlas/cache/bitfrost-residency-warming-v1.js';

const fixtureRoot = path.resolve('tests/fixtures/repo-summary-ace');
const summaryProducerRevision = 'extractive-summary-fixture-v1';
const featureRevision = 'feature:repo-summary-fixture-v1';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function section<T>(data: T, status: 'CURRENT' | 'HINT' | 'PENDING', revision: string | null, evidenceRefs: string[] = []) {
  return { status, revision, evidence_refs: evidenceRefs, data };
}

describe('repo directory summary → Graphify → ACE E2E fixture', () => {
  it('summarizes exact files, traverses a bounded graph, builds canonical packets, and blocks cache injection without embedding proof', async () => {
    const sourceRefs = ['entry.ts', 'service.ts'];
    const files = await Promise.all(sourceRefs.map(async (sourceRef) => {
      const content = await readFile(path.join(fixtureRoot, sourceRef), 'utf8');
      const sourceRevision = `sha256:${sha256(content)}`;
      const symbols = [...content.matchAll(/export function ([A-Za-z0-9_]+)/g)].map((match) => match[1]!);
      const summary = `Defines ${symbols.join(', ')} for the repository analysis fixture.`;
      const quality = auditSummaryQuality(`packet:${sourceRef}`, summary);
      expect(quality.quality).toBe('good');
      return { sourceRef, content, sourceRevision, summary };
    }));
    const workspaceRevision = `sha256:${sha256(files
      .map((file) => `${file.sourceRef}:${file.sourceRevision}`)
      .sort()
      .join('|'))}`;

    const nodes = files.map((file) => ({
      schema: 'atlas.code-asset-node.v1' as const,
      assetId: codeAssetId({ sourceRef: file.sourceRef, kind: 'FILE', qualifiedName: file.sourceRef }),
      kind: 'FILE' as const,
      name: path.basename(file.sourceRef),
      qualifiedName: file.sourceRef,
      sourceRef: file.sourceRef,
      language: 'typescript',
      span: null,
      domains: ['OTHER'] as const,
      exported: false,
      async: false,
      signature: '',
      sourceRevision: file.sourceRevision,
      workspaceRevision,
      tags: [],
      reusableForNewFileCreation: false,
      repairEvidenceCandidate: false,
      canonicalWritesAllowed: false as const,
      producerRevision: 'repo-summary-e2e-fixture-v1',
    }));
    const edge = {
      schema: 'atlas.code-asset-edge.v1' as const,
      edgeId: codeAssetEdgeId({
        fromAssetId: nodes[0]!.assetId,
        relation: 'IMPORTS',
        toAssetId: nodes[1]!.assetId,
        sourceRevision: files[0]!.sourceRevision,
      }),
      fromAssetId: nodes[0]!.assetId,
      toAssetId: nodes[1]!.assetId,
      relation: 'IMPORTS' as const,
      sourceRef: files[0]!.sourceRef,
      confidence: 1,
      exact: true,
      evidence: 'fixture import relationship',
      sourceRevision: files[0]!.sourceRevision,
      canonicalWritesAllowed: false as const,
      producerRevision: 'repo-summary-e2e-fixture-v1',
    };
    const graphRevision = `sha256:${sha256(`${workspaceRevision}:${edge.edgeId}`)}`;
    const graph = CodeAssetGraphV1Schema.parse({
      schema: 'atlas.code-asset-graph.v1',
      graphId: sha256(nodes.map((node) => node.assetId).join('|')),
      workspaceRevision,
      extractionRevision: 'fixture-extraction-v1',
      generatedAt: '2026-10-13T00:00:00.000Z',
      sourceRoots: ['tests/fixtures/repo-summary-ace'],
      nodes,
      edges: [edge],
      statistics: { files: 2, symbols: 0, schemas: 0, sidecars: 0, edges: 1 },
      invariants: {
        sourceRefRequired: true,
        originalsPreserved: true,
        noMoves: true,
        noDeletes: true,
        canonicalWritesAllowed: false,
        executorMultiplicityAddsVotes: false,
      },
      producerRevision: 'repo-summary-e2e-fixture-v1',
    });
    const traversal = referenceBfs({
      seed: graph.nodes[0]!.assetId,
      edges: graph.edges.map((item) => ({ from: item.fromAssetId, to: item.toAssetId, type: item.relation })),
      maxHops: 1,
      direction: 'out',
      edgeTypes: ['IMPORTS'],
    });
    expect(traversal.visited).toEqual([graph.nodes[0]!.assetId, graph.nodes[1]!.assetId].sort());

    const ordinalMap = materializeCandidateOrdinalMap({
      candidates: files.map((file) => ({
        canonicalId: `fixture:${file.sourceRef}`,
        packetKey: `packet:${file.sourceRef}`,
        sourceRef: file.sourceRef,
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision,
        sourceRevision: file.sourceRevision,
        graphRevision,
        semanticRevision: null,
        degradedIdentity: false,
        evidenceRefs: [`source:${file.sourceRef}:${file.sourceRevision}`],
      })),
      candidateSnapshotRevision: `snapshot:${sha256(files.map((file) => file.sourceRevision).join('|'))}`,
      workspaceRevision,
      producerRevision: 'repo-summary-e2e-fixture-v1',
    });
    const rows = ordinalMap.candidates.map((candidate) => ({
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision,
      semanticRevision: null,
      featureRevision,
      representationBindings: [],
      semanticRelevance: null,
      lexicalRelevance: null,
      astAffinity: null,
      graphAuthority: 1,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: null,
      memoryUtility: null,
      laneMask: ['graph'] as const,
      degradedIdentity: false,
      evidenceRefs: candidate.evidenceRefs,
    }));
    const featureAdmission = admitCurrentCandidateFeatureSnapshotV1({
      ordinalMap,
      rows,
      featureRevision,
      producerRevision: 'repo-summary-e2e-fixture-v1',
      sourceRevisionSetChecksum: sha256(files.map((file) => file.sourceRevision).sort().join('|')),
      candidateSetChecksum: sha256(ordinalMap.candidates.map((candidate) => candidate.canonicalId).join('|')),
      sourceChunkCohortStatus: 'REVISION_QUALIFIED',
      semanticCohortStatus: 'ADMITTED',
      graphFeatureStatus: 'ADMITTED',
    });
    expect(featureAdmission.status).toBe('ADMITTED');
    expect(featureAdmission.writesPerformed).toBe(false);

    const packets = ordinalMap.candidates.map((candidate) => {
      const file = files.find((item) => item.sourceRef === candidate.sourceRef)!;
      const inputDigest = file.sourceRevision;
      return buildAcePacketV3({
        base: {
          packet_revision: `packet-revision:${candidate.packetKey}`,
          envelope: {
            packet_key: candidate.packetKey!,
            source_ref: file.sourceRef,
            canonical_source_ref: file.sourceRef,
            feature_id: null,
            source_revision: file.sourceRevision,
          },
          hypergraph: null,
          producer_revision: 'repo-summary-e2e-fixture-v1',
        },
        identity: {
          packet_key: candidate.packetKey!,
          source_ref: file.sourceRef,
          workspace_revision: workspaceRevision,
          source_revision: file.sourceRevision,
          packet_revision: `packet-revision:${candidate.packetKey}`,
          producer_revision: 'repo-summary-e2e-fixture-v1',
          representation_id: 'semantic_768',
          representation_revision: null,
          feature_revision: featureRevision,
          graph_revision: graphRevision,
          symbol_version_id: null,
          tree_node_id: null,
        },
        source: section({
          language: 'typescript',
          source_digest: file.sourceRevision,
          start_byte: null,
          end_byte: null,
          ast_state: 'NOT_MATERIALIZED',
        }, 'CURRENT', file.sourceRevision, [`source:${file.sourceRef}:${file.sourceRevision}`]),
        semantic: section({
          summary: section({ text: file.summary, input_digest: inputDigest, model_revision: summaryProducerRevision }, 'CURRENT', summaryProducerRevision),
          embedding: section({ model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null }, 'PENDING', null),
          keywords: [],
          entities: [],
          concept_ids: [],
          domain_class: null,
        }, 'CURRENT', summaryProducerRevision),
        topology: section({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }, 'HINT', graphRevision),
        residency: section({ tier: 'COLD', lod: 'SOURCE_SPAN', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING', null),
        evidence: section({ refs: candidate.evidenceRefs, contradictions: [], stale_refs: [] }, 'CURRENT', file.sourceRevision),
      });
    });
    packets.forEach((packet) => expect(verifyAcePacketV3(packet).integrity.packet_checksum).toMatch(/^sha256:[0-9a-f]{64}$/));

    const bridged = bridgeAcePacketsToContextManifestV1({
      featureAdmission,
      selectedOrdinals: ordinalMap.candidates.map((candidate) => candidate.candidateOrdinal),
      packets,
      requestId: 'request:repo-summary-e2e-fixture',
      tokenBudget: 1024,
      retrievalPolicyRevision: 'retrieval-policy:fixture-v1',
      acePlaybookRevision: 'ace-playbook:fixture-v1',
    });
    expect(bridged.admission.manifest.requestId).toBe('request:repo-summary-e2e-fixture');
    expect(bridged.receipt.canonicalAuthority).toBe(false);
    expect(bridged.receipt.writesPerformed).toBe(false);

    const redis = { set: vi.fn(async () => 'OK') };
    const firstPacket = packets[0]!;
    const cacheResult = await writeAcePacketV3ToBitfrostV1(redis as never, {
      packet: firstPacket,
      cacheIdentity: {
        cacheKind: 'ACE_PACKET',
        artifactKind: 'ace_packet_v3',
        workspaceRevision,
        sourceRevision: firstPacket.identity.source_revision,
        packetRevision: firstPacket.identity.packet_revision,
        representationId: firstPacket.identity.representation_id,
        representationRevision: 'embedding-revision:missing-from-fixture',
        candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
        ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
        graphRevision,
        featureRevision,
        producerRevision: firstPacket.identity.producer_revision,
        normalizationPolicyRevision: 'normalization:fixture-v1',
        artifactChecksum: firstPacket.integrity.packet_checksum,
      },
      embedAllowedPacketKeys: new Set(packets.map((packet) => packet.identity.packet_key)),
    });
    expect(cacheResult).toEqual({ status: 'BLOCKED', cacheKey: null, reason: 'EMBEDDING_NOT_CURRENT' });
    expect(redis.set).not.toHaveBeenCalled();
  });
});
