import { describe, expect, it } from 'vitest';
import { buildFeatureRowV1, type FeatureRowV1 } from '../ranking/feature-row-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
	bindFeatureRowRpcPacketToOrdinalMapV1,
	buildFeatureRowRpcPacketV1,
	decodeOrdinalBoundFeatureRowRpcPacketV1,
	decodeFeatureRowRpcPacketV1,
	float32ToFloat16Bytes,
	quantizeFloat32ToInt8,
	paginateTopkRecommendationsFromPacketV1,
	createFeatureRowRpcResultEnvelopeV1,
	verifyFeatureRowRpcResultEnvelopeV1,
	FEATURE_ROW_RPC_RESULT_ENVELOPE_SCHEMA_V1,
	FEATURE_ROW_NUMERIC_COLS,
	decodeLowRankKeyframeChunks64BV2,
	encodeLowRankKeyframeChunks64BV2,
	decodeTurboVecFeatureRows24B,
	encodeTurboVecFeatureRows24B,
	LOWRANK_KEYFRAME_CHUNK_SIZE_V2,
	TURBOVEC_FEATURE_ROW_SIZE_24B,
	type LowRankKeyframeChunk64BV2,
	type TurboVecFeatureRow24B,
} from './feature-row-rpc-packet-v1.js';

describe('feature-row-rpc-packet-v1', () => {
	const makeRow = (id: string, score: number, rrf = 0.8): FeatureRowV1 =>
		buildFeatureRowV1({
			locator: {
				schema: 'atlas.evidence-locator.v1',
				canonicalId: `canonical:${id}`,
				packetKey: `packet:${id}`,
				sourceRef: `src/${id}.ts`,
				sourceKind: 'code_file',
				filePath: `src/${id}.ts`,
				sourceUrl: null,
				contentHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
				workspaceRevision: 'ws-rev-1',
				sourceRevision: 'src-rev-1',
				span: { startByte: 0, endByte: 100 },
				domain: null,
			},
			featureRevision: 'feat-rev-1',
			graphRevision: 'graph-rev-1',
			semanticRevision: 'sem-rev-1',
			dense: score,
			sparse: 0.5,
			rrf,
			ast: 0.6,
			pagerank: { pagerank_l1: 0.7 },
			pprAffinity: 0.3,
			domainAffinity: 0.9,
			freshness: 0.85,
			crossEncoder: 0.95,
			executionUtility: 0.6,
			evidenceRefs: [`evidence:${id}`],
		});

	it('packages a batch of FeatureRowV1 into a contiguous tensor buffer with MessagePack metadata', () => {
		const row1 = makeRow('item1', 0.9);
		const row2 = makeRow('item2', 0.75);

		const packet = buildFeatureRowRpcPacketV1([row1, row2]);

		expect(packet.schema).toBe('atlas.feature-row-rpc-packet.v1');
		expect(packet.rows).toBe(2);
		expect(packet.cols).toBe(FEATURE_ROW_NUMERIC_COLS);
		expect(packet.candidatePacketKeys).toEqual(['packet:item1', 'packet:item2']);
		expect(packet.canonicalIds).toEqual(['canonical:item1', 'canonical:item2']);
		expect(packet.sourceRefs).toEqual(['src/item1.ts', 'src/item2.ts']);
		expect(packet.sourceRevisions).toEqual(['src-rev-1', 'src-rev-1']);
		expect(packet.evidenceRefs).toEqual([['evidence:item1'], ['evidence:item2']]);
		expect(packet.numericBufferBytes.byteLength).toBe(2 * 10 * 4); // 80 bytes
		expect(packet.numericEncoding).toBe('float32-le');
		expect(packet.presenceMaskBitOrder).toBe('lsb0');
		expect(packet.canonicalAuthority).toBe(false);
		expect(packet.writesPerformed).toBe(false);
		expect(packet.messagePackEnvelope.schema).toBe('atlas.messagepack-transport.v1');

		const decoded = decodeFeatureRowRpcPacketV1(packet);
		expect(decoded.verified).toBe(true);
		expect(decoded.shape).toEqual([2, 10]);
		expect(decoded.tensor).toHaveLength(20);
		expect(decoded.tensor[0]).toBeCloseTo(0.9); // dense score of item1
		expect(decoded.tensor[10]).toBeCloseTo(0.75); // dense score of item2
	});

	it('preserves missing nullable features in the presence mask', () => {
		const row = { ...makeRow('nullable', 0.4), pprAffinity: null, crossEncoder: null };
		const packet = buildFeatureRowRpcPacketV1([row]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);
		const pprBit = 5;
		const crossEncoderBit = 8;
		expect(packet.presenceMaskBytes[pprBit >> 3] & (1 << (pprBit & 7))).toBe(0);
		expect(packet.presenceMaskBytes[crossEncoderBit >> 3] & (1 << (crossEncoderBit & 7))).toBe(0);
		expect(decoded.tensor[pprBit]).toBe(0);
		expect(decoded.verified).toBe(true);
	});

	it('refuses tensor-byte or MessagePack-metadata tampering', () => {
		const packet = buildFeatureRowRpcPacketV1([makeRow('tamper', 0.7)]);
		const changedTensor = { ...packet, numericBufferBytes: new Uint8Array(packet.numericBufferBytes) };
		changedTensor.numericBufferBytes[0] ^= 0xff;
		expect(() => decodeFeatureRowRpcPacketV1(changedTensor)).toThrow('FEATURE_ROW_RPC_PACKET_CHECKSUM_MISMATCH');

		const changedMetadata = {
			...packet,
			messagePackEnvelope: {
				...packet.messagePackEnvelope,
				payloadBytes: new Uint8Array(packet.messagePackEnvelope.payloadBytes),
			},
		};
		changedMetadata.messagePackEnvelope.payloadBytes[0] ^= 0xff;
		expect(() => decodeFeatureRowRpcPacketV1(changedMetadata)).toThrow();
	});

	it('rejects duplicate canonical candidate identities', () => {
		const first = makeRow('same', 0.7);
		const second = { ...makeRow('other', 0.6), canonicalId: first.canonicalId };
		expect(() => buildFeatureRowRpcPacketV1([first, second])).toThrow('FEATURE_ROW_RPC_PACKET_DUPLICATE_CANDIDATE_IDENTITY');
	});

	it('fails closed when batch mixes workspace revisions', () => {
		const row1 = makeRow('item1', 0.9);
		const row2 = {
			...makeRow('item2', 0.75),
			workspaceRevision: 'ws-rev-other',
		};

		expect(() => buildFeatureRowRpcPacketV1([row1, row2])).toThrow(
			/FEATURE_ROW_RPC_PACKET_MIXED_WORKSPACE_REVISION/,
		);
	});

	it('fails closed on empty row batch', () => {
		expect(() => buildFeatureRowRpcPacketV1([])).toThrow(
			/FEATURE_ROW_RPC_PACKET_EMPTY_ROWS/,
		);
	});

	it('quantizes decoded FP32 tensor to FP16 half-precision buffer', () => {
		const row = makeRow('fp16-test', 0.85);
		const packet = buildFeatureRowRpcPacketV1([row]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);

		const fp16Bytes = float32ToFloat16Bytes(decoded.tensor);
		expect(fp16Bytes).toBeInstanceOf(Uint8Array);
		expect(fp16Bytes.byteLength).toBe(decoded.tensor.length * 2); // 20 bytes (half of 40)
	});

	it('quantizes decoded FP32 tensor to INT8 with scale and zero-point for Ampere Tensor Cores', () => {
		const row1 = makeRow('int8-item1', 0.95);
		const row2 = makeRow('int8-item2', 0.1);
		const packet = buildFeatureRowRpcPacketV1([row1, row2]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);

		const quantized = quantizeFloat32ToInt8(decoded.tensor);
		expect(quantized.data).toBeInstanceOf(Int8Array);
		expect(quantized.data.length).toBe(decoded.tensor.length);
		expect(quantized.scale).toBeGreaterThan(0);
		for (let i = 0; i < quantized.data.length; i++) {
			expect(quantized.data[i]).toBeGreaterThanOrEqual(-128);
			expect(quantized.data[i]).toBeLessThanOrEqual(127);
		}
	});

	it('paginates Top-K grounded recommendations mapped to ingested packet symbols', () => {
		const row1 = makeRow('candidate-high', 0.95, 0.2);
		const row2 = makeRow('candidate-low', 0.2, 0.9);
		const packet = buildFeatureRowRpcPacketV1([row1, row2]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);

		const paginated = paginateTopkRecommendationsFromPacketV1(decoded, { page: 1, pageSize: 1 });
		expect(paginated.page).toBe(1);
		expect(paginated.pageSize).toBe(1);
		expect(paginated.totalCandidates).toBe(2);
		expect(paginated.totalPages).toBe(2);
		expect(paginated.items).toHaveLength(1);

		const topItem = paginated.items[0];
		expect(topItem.rank).toBe(1);
		expect(topItem.canonicalId).toBe('canonical:candidate-low');
		expect(topItem.sourceRef).toBe('src/candidate-low.ts');
		expect(topItem.denseRelevance).toBeCloseTo(0.2, 2);
		expect(topItem.rrfScore).toBeCloseTo(0.9, 2);
		expect(topItem.compositeScore).toBe(topItem.rrfScore);
	});

	it('binds packet rows to verified ordinals by full canonical source identity before tensor decode', () => {
		const row = makeRow('ordinal-bound', 0.75);
		const packet = buildFeatureRowRpcPacketV1([row]);
		const ordinalMap = materializeCandidateOrdinalMap({
			candidateSnapshotRevision: 'snapshot-r1',
			workspaceRevision: row.workspaceRevision,
			producerRevision: 'ordinal-producer-r1',
			candidates: [{
				canonicalId: row.canonicalId,
				packetKey: row.packetKey,
				sourceRef: row.sourceRef,
				treeNodeId: null,
				symbolVersionId: null,
				workspaceRevision: row.workspaceRevision,
				sourceRevision: row.sourceRevision,
				graphRevision: row.graphRevision,
				semanticRevision: row.semanticRevision,
				degradedIdentity: false,
				evidenceRefs: row.evidenceRefs,
				representationBindings: [],
			}],
		});
		const binding = bindFeatureRowRpcPacketToOrdinalMapV1(packet, ordinalMap);
		const decoded = decodeOrdinalBoundFeatureRowRpcPacketV1({ packet, binding, ordinalMap });
		expect(binding.candidateOrdinals).toEqual([0]);
		expect(binding.ordinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
		expect(decoded.candidateOrdinals).toEqual([0]);
		expect(decoded.canonicalIds).toEqual([row.canonicalId]);

		const changedMap = materializeCandidateOrdinalMap({
			candidateSnapshotRevision: 'snapshot-r1',
			workspaceRevision: row.workspaceRevision,
			producerRevision: 'ordinal-producer-r1',
			candidates: [{
				canonicalId: row.canonicalId,
				packetKey: row.packetKey,
				sourceRef: row.sourceRef,
				treeNodeId: null,
				symbolVersionId: null,
				workspaceRevision: row.workspaceRevision,
				sourceRevision: 'stale-source-revision',
				graphRevision: row.graphRevision,
				semanticRevision: row.semanticRevision,
				degradedIdentity: false,
				evidenceRefs: row.evidenceRefs,
				representationBindings: [],
			}],
		});
		expect(() => bindFeatureRowRpcPacketToOrdinalMapV1(packet, changedMap))
			.toThrow('FEATURE_ROW_RPC_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
		expect(() => decodeOrdinalBoundFeatureRowRpcPacketV1({
			packet,
			binding: { ...binding, candidateOrdinals: [1] },
			ordinalMap,
		})).toThrow('FEATURE_ROW_RPC_ORDINAL_BINDING_MISMATCH');
	});

	it('creates and verifies a qualified FeatureRowRpcResultEnvelopeV1', () => {
		const row = makeRow('item-env', 0.88);
		const packet = buildFeatureRowRpcPacketV1([row]);

		const receiptHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		const envelope = createFeatureRowRpcResultEnvelopeV1({
			inputPacket: packet,
			modelRevision: 'model-gemma-v1',
			rankingAlgorithm: 'RRF_FUSION_V1',
			selectedOrdinals: [0],
			selectedCanonicalIds: [row.canonicalId],
			scores: [0.88],
			executionReceiptSha256: receiptHash,
		});

		expect(envelope.schema).toBe(FEATURE_ROW_RPC_RESULT_ENVELOPE_SCHEMA_V1);
		expect(envelope.inputPacketChecksumSha256).toBe(packet.checksumSha256);
		expect(envelope.workspaceRevision).toBe(packet.workspaceRevision);
		expect(envelope.modelRevision).toBe('model-gemma-v1');
		expect(envelope.selectedOrdinals).toEqual([0]);
		expect(envelope.selectedCanonicalIds).toEqual([row.canonicalId]);
		expect(envelope.scores).toEqual([0.88]);
		expect(envelope.executionReceiptSha256).toBe(receiptHash);
		expect(envelope.canonicalAuthority).toBe(false);
		expect(envelope.writesPerformed).toBe(false);

		expect(verifyFeatureRowRpcResultEnvelopeV1(envelope, packet)).toBe(true);

		// Tampered packet should fail verification
		const otherRow = makeRow('item-other', 0.5);
		const otherPacket = buildFeatureRowRpcPacketV1([otherRow]);
		expect(verifyFeatureRowRpcResultEnvelopeV1(envelope, otherPacket)).toBe(false);

		// Length mismatch should throw on creation
		expect(() =>
			createFeatureRowRpcResultEnvelopeV1({
				inputPacket: packet,
				modelRevision: 'model-gemma-v1',
				rankingAlgorithm: 'RRF_FUSION_V1',
				selectedOrdinals: [0, 1],
				selectedCanonicalIds: [row.canonicalId],
				scores: [0.88],
				executionReceiptSha256: receiptHash,
			}),
		).toThrow('FEATURE_ROW_RPC_RESULT_LENGTH_MISMATCH');
	});

	it('encodes and decodes v2 64-byte keyframe chunks with ordinal and reserved validation', () => {
		const chunk1: LowRankKeyframeChunk64BV2 = {
			morton: 1024,
			ordinal: 0,
			cluster: 3,
			reserved: 0,
			pos: [0.125, -0.5, 0.875],
			finalScore: 0.91234567,
			feature: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
		};
		const chunk2: LowRankKeyframeChunk64BV2 = {
			morton: 2048,
			ordinal: 1,
			cluster: 7,
			reserved: 0,
			pos: [-0.25, 0.5, -0.75],
			finalScore: 0.45678912,
			feature: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
		};

		const encoded = encodeLowRankKeyframeChunks64BV2([chunk1, chunk2]);
		expect(encoded.byteLength).toBe(2 * LOWRANK_KEYFRAME_CHUNK_SIZE_V2);

		const decoded = decodeLowRankKeyframeChunks64BV2(encoded, 2);
		expect(decoded.length).toBe(2);
		expect(decoded[0].ordinal).toBe(0);
		expect(decoded[0].cluster).toBe(3);
		expect(decoded[0].reserved).toBe(0);
		expect(decoded[0].morton).toBe(1024);
		expect(decoded[0].pos[0]).toBeCloseTo(0.125, 5);
		expect(decoded[0].finalScore).toBeCloseTo(0.91234567, 7);
		expect(decoded[0].feature[7]).toBeCloseTo(0.8, 5);

		expect(decoded[1].ordinal).toBe(1);
		expect(decoded[1].cluster).toBe(7);

		// Misaligned buffer rejected
		expect(() => decodeLowRankKeyframeChunks64BV2(encoded.subarray(0, 100))).toThrow(
			/CHUNK_BUFFER_MISALIGNED/,
		);

		// Count mismatch rejected
		expect(() => decodeLowRankKeyframeChunks64BV2(encoded, 1)).toThrow(/CHUNK_COUNT_MISMATCH/);

		// Nonzero reserved rejected
		const corrupted = new Uint8Array(encoded);
		corrupted[10] = 0x01; // set reserved byte
		expect(() => decodeLowRankKeyframeChunks64BV2(corrupted)).toThrow(/RESERVED_NONZERO_AT_INDEX_0/);
	});

	it('encodes and decodes 24-byte TurboVec feature rows with field accuracy', () => {
		const row1: TurboVecFeatureRow24B = {
			lexical: 0.95,
			dense: 0.88,
			sparse: 0.45,
			pagerank: 0.72,
			clusterId: 12,
			flags: 0x0003,
			ordinal: 42,
		};
		const row2: TurboVecFeatureRow24B = {
			lexical: 0.35,
			dense: 0.62,
			sparse: 0.15,
			pagerank: 0.55,
			clusterId: 4,
			flags: 0x0001,
			ordinal: 43,
		};

		const encoded = encodeTurboVecFeatureRows24B([row1, row2]);
		expect(encoded.byteLength).toBe(2 * TURBOVEC_FEATURE_ROW_SIZE_24B);

		const decoded = decodeTurboVecFeatureRows24B(encoded, 2);
		expect(decoded.length).toBe(2);
		expect(decoded[0].ordinal).toBe(42);
		expect(decoded[0].clusterId).toBe(12);
		expect(decoded[0].flags).toBe(0x0003);
		expect(decoded[0].lexical).toBeCloseTo(0.95, 5);
		expect(decoded[0].dense).toBeCloseTo(0.88, 5);
		expect(decoded[0].sparse).toBeCloseTo(0.45, 5);
		expect(decoded[0].pagerank).toBeCloseTo(0.72, 5);

		expect(decoded[1].ordinal).toBe(43);
		expect(decoded[1].clusterId).toBe(4);

		// Misaligned buffer rejected
		expect(() => decodeTurboVecFeatureRows24B(encoded.subarray(0, 30))).toThrow(
			/TURBOVEC_BUFFER_MISALIGNED/,
		);

		// Count mismatch rejected
		expect(() => decodeTurboVecFeatureRows24B(encoded, 5)).toThrow(/TURBOVEC_ROW_COUNT_MISMATCH/);
	});
});
