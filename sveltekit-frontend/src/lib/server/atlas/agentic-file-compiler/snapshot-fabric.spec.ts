import { describe, expect, it } from 'vitest';
import { buildSmartRpcPacket } from './smart-packet-fabric.js';
import { buildOrdinalRegistry, joinSmartPacketOrdinals } from './ordinal-registry.js';
import { materializeStructuralCoordinates } from './structural-coordinate-materializer.js';
import { buildGpuMaterializationReceipt, buildHypergraphSnapshot, gpuReceiptToArtifactRef } from './snapshot-fabric.js';
import { buildCompiledContextManifest, compilePrefillReceipt } from './context-prefill-compiler.js';

describe('ordinal and snapshot fabric', () => {
	const revisions = {
		workspaceRevision: 'ws-742',
		sourceRevision: 'src-11',
		graphRevision: 'graph-338',
		representationRevision: 'repr-109',
		featureRevision: 'feat-109',
	};

	it('joins canonical structural identity and ordinals without minting provisional IDs', () => {
		const packet = buildSmartRpcPacket({
			packetId: 'packet-C517', packetKey: 'P992', canonicalId: 'C517', revisions,
			structural: { sourceRef: 'src/lib/example.ts' }, ordinals: {}, evidenceRefs: [], producerRevision: 'test@1',
		});
		const structural = materializeStructuralCoordinates(packet, {
			schema: 'atlas.structural-identity-attestation.v1', canonicalId: 'C517', packetKey: 'P992',
			sourceRef: 'src/lib/example.ts', sourceRevision: 'src-11', treeNodeId: 'T8421', symbolVersionId: 'S331',
			nodeType: 'function_declaration', astPath: [2, 1, 0], parentAstPath: [2, 1], startByte: 10, endByte: 80,
			grammarRevision: 'tree-sitter-typescript@x', canonicalOwnerAttested: true, producerRevision: 'structural-owner@1',
		});
		const registry = buildOrdinalRegistry({
			registryId: 'ord-1', revisions, semanticSnapshotId: 'sem-1', graphSnapshotId: 'graph-1', featureSnapshotId: 'feat-1',
			bindings: [{ canonicalId: 'C517', packetKey: 'P992', treeNodeId: 'T8421', symbolVersionId: 'S331', semanticOrdinal: 19472, graphOrdinal: 7128, featureOrdinal: 19472, tensorRowOrdinal: 19472 }],
			producerRevision: 'ordinal@1',
		});
		const joined = joinSmartPacketOrdinals(structural, registry);
		expect(joined.structural.treeNodeId).toBe('T8421');
		expect(joined.ordinals).toEqual({ semanticOrdinal: 19472, graphOrdinal: 7128, featureOrdinal: 19472, tensorRowOrdinal: 19472 });
	});

	it('rejects duplicate ordinals and revision mismatches', () => {
		expect(() => buildOrdinalRegistry({
			registryId: 'bad', revisions,
			bindings: [
				{ canonicalId: 'C1', semanticOrdinal: 4 },
				{ canonicalId: 'C2', semanticOrdinal: 4 },
			],
			producerRevision: 'test',
		})).toThrow(/duplicate semanticOrdinal/);
	});

	it('materializes bounded n-ary snapshot metadata rather than JSON hyperedges', () => {
		const snapshot = buildHypergraphSnapshot({
			snapshotId: 'hg-1', revisions, ordinalMapRevision: 'ord-1', nodeCount: 10, hyperedgeCount: 4, membershipCount: 17,
			storage: {
				format: 'csr-nary-v1', nodeOrdinals: 'arrow://hg/node_ordinals', hyperedgeOffsets: 'arrow://hg/offsets',
				hyperedgeMembers: 'arrow://hg/members', relationTypes: 'arrow://hg/relation_types', directions: 'arrow://hg/directions', weights: 'arrow://hg/weights',
			},
			artifactRefs: ['weights', 'members', 'members'], producerRevision: 'hypergraph@1',
		});
		expect(snapshot.artifactRefs).toEqual(['members', 'weights']);
		expect(snapshot.storage.format).toBe('csr-nary-v1');
	});

	it('compiles a deterministic context manifest into a prefill receipt', () => {
		const gpu = buildGpuMaterializationReceipt({
			materializationId: 'mat-1', sourceArtifactId: 'semantic-row-1', sourceChecksum: 'source-check', revisions,
			tileId: 'gpu.semantic.17', dtype: 'bf16', shape: [256, 768], byteLength: 393216, residency: 'cuda',
			cudaIpcLeaseRef: 'lease-17', deviceId: 'cuda:0', producerRevision: 'gpu-materializer@1',
		});
		const tensorRef = gpuReceiptToArtifactRef(gpu, 'C517');
		const manifest = buildCompiledContextManifest({
			contextManifestId: 'ctx-1', requestId: 'req-1', revisions, queryDigest: 'query-sha',
			laneOrder: ['lexical', 'semantic', 'ast', 'graph', 'hypergraph'], candidateOrdinals: [9, 2, 9],
			selectedCanonicalIds: ['C517'], promotedArtifacts: [tensorRef],
			budgets: { maxTokens: 6000, maxCandidates: 256, maxGraphHops: 3, maxHyperedges: 128, maxToolCalls: 8, maxVramBytes: 8_000_000_000 },
			instructionRefs: ['instruction.rank.v3'], producerRevision: 'context-compiler@1',
		});
		const receipt = compilePrefillReceipt({
			prefillReceiptId: 'prefill-1', manifest, promptPlanChecksum: 'prompt-sha', modelRevision: 'model-1', adapterRevision: null,
			promptTemplateRevision: 'tmpl-1', tokenizerRevision: 'tok-1', toolSchemaRevision: 'tools-1', producerRevision: 'prefill@1',
		});
		expect(manifest.candidateOrdinals).toEqual([2, 9]);
		expect(receipt.tensorArtifactRefs).toEqual(['gpu.semantic.17']);
		expect(receipt.contextManifestChecksum).toBe(manifest.checksum);
	});
});
