import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	CHR_BANK_BYTES,
	CHR_TILE_BYTES,
	NESCHROM97_METADATA_BYTES,
	assertChrTileDistinctFromChrom97,
	buildParentAtlasChrRom8KiB,
	decodeChrTile8x8,
	encodeChrTile8x8,
	encodeTextToNametable,
	getDomainIconTileIndex,
	nesPixel,
	packNesChrom97MetadataGlyph8B,
	renderNametableToRgba,
	resolveChrPaletteForNesHex,
	unpackNesChrom97MetadataGlyph8B,
} from '$lib/atlas/chr-glyph-atlas-v1.js';
import type { CsrGraphCursor } from '../graph/csr-traversal-cursor.js';
import {
	DEFAULT_POLICY_GRANT_V1,
	DoubleBufferDescriptorSlotV1,
	FROZEN_GRAPH_REVISION_V1,
	FROZEN_NES_FSM_BATCH_V1,
	FROZEN_SOURCE_REVISION_V1,
	NES_FSM_BINARY_ALIGNMENT_BYTES,
	NES_FSM_BINARY_ENDIAN_TAG_BE,
	NES_FSM_BINARY_HEADER_BYTES,
	NES_FSM_BINARY_RECORD_BYTES,
	NES_FSM_BINARY_SCHEMA_REVISION_V1,
	type AtlasNativeCoreBindings,
	type FrozenCandidateBatchV1,
	type PolicyAuthorizationGrantV1,
	loadAtlasNativeCoreAddon,
	readbackAndVerifyBinaryDescriptorV1,
	runNesFsmNativeRuntimeV1,
} from './nes-fsm-native-runtime-v1.js';
import { load as loadNesFsmDemoPage } from '../../../../routes/demos/nes-fsm-chr-runtime/+page.server.js';

function recomputePayloadDigest(buf: Uint8Array, candidateCount: number): void {
	const payloadStart = NES_FSM_BINARY_HEADER_BYTES;
	const payloadEnd = payloadStart + candidateCount * NES_FSM_BINARY_RECORD_BYTES;
	const digest = crypto.createHash('sha256').update(buf.subarray(payloadStart, payloadEnd)).digest();
	buf.set(digest.subarray(0, 16), 48);
}

describe('PARENT-ATLAS-NES-FSM-NATIVE-RUNTIME-01 (CPU-only vertical slice)', () => {
	it('executes the 10-step native FSM runtime on the frozen 16-candidate batch with verified readback and buffer swap', () => {
		const bufferSlot = new DoubleBufferDescriptorSlotV1();
		expect(bufferSlot.getSnapshot().hasActive).toBe(false);

		const report = runNesFsmNativeRuntimeV1({ bufferSlot });

		// Proposal-only & zero mutation guarantees
		expect(report.canonicalAuthority).toBe(false);
		expect(report.promotionEligible).toBe(false);
		expect(report.writesPerformed).toBe(false);
		expect(report.valkeyWritesPerformed).toBe(false);
		expect(report.readback.canonicalAuthority).toBe(false);
		expect(report.readback.promotionEligible).toBe(false);
		expect(report.readback.writesPerformed).toBe(false);
		expect(report.readback.authorityFlagsByte).toBe(0);

		// Never leak hidden thought / KV cache / raw tensor keys
		const serialized = JSON.stringify(report);
		for (const forbidden of ['hiddenThoughts', 'chainOfThought', 'kv_cache', '"tensor"']) {
			expect(serialized).not.toContain(forbidden);
		}

		// Native addon active guard verification
		expect(report.nativeGuards.addonLoaded).toBe(true);
		expect(report.nativeGuards.max65536RowsEnforced).toBe(true);
		expect(report.nativeGuards.duplicateOrdinalsEnforced).toBe(true);
		expect(report.nativeGuards.somBmuRange400Enforced).toBe(true);
		expect(report.nativeDfaProposal?.authority).toBe('PROPOSAL_ONLY');

		// Binary layout & endianness
		expect(report.binarySchemaRevision).toBe(NES_FSM_BINARY_SCHEMA_REVISION_V1);
		expect(report.endianness).toBe('LE');
		expect(report.serializedLayoutAlignmentBytes).toBe(NES_FSM_BINARY_ALIGNMENT_BYTES);
		expect(report.descriptorByteLength).toBe(320);
		expect(report.descriptorByteLength % 64).toBe(0);
		expect(report.candidateCount).toBe(16);

		// Lead record after radix sort: cluster=0, som=3, ordinal=102 (primaryLutByte=1, auth, nesHex=0x16)
		expect(report.sortedRecords[0]?.candidateOrdinal).toBe(102);
		expect(report.sortedRecords[0]?.primaryLutByte).toBe(1);
		expect(report.batchPrimaryLutByte).toBe(1);
		expect(report.batchNesHex).toBe('0x16');
		expect(report.batchDomainBitmask).toBe(0x0003);

		// Monotonic radix sort key across all 16 sorted records
		let prevKey = -1n;
		for (const rec of report.sortedRecords) {
			const key =
				(BigInt(rec.kmeansClusterId) << 48n) |
				(BigInt(rec.somBmuId) << 32n) |
				BigInt(rec.candidateOrdinal);
			expect(key > prevKey).toBe(true);
			prevKey = key;
		}

		// Bounded CSR traversal + BitFrost residency + TaskLifecycleFSM transition
		expect(report.csrResult.totalVisited).toBe(5);
		expect(report.csrResult.cursor.graphRevision).toBe(FROZEN_GRAPH_REVISION_V1);
		expect(report.taskTransition.fromState).toBe('DEPENDENCY_CHECKED');
		expect(report.taskTransition.toState).toBe('READY');
		expect(report.bitfrostResidentOrdinals).toHaveLength(12);
		expect(report.bitfrostAdmittedOrdinals).toHaveLength(4);
		expect(report.bitfrostLeaseReleasedCount).toBe(12);

		// Double-buffer swap + readback match
		expect(report.bufferSwap.bufferSwapped).toBe(true);
		expect(report.bufferSwap.swapCount).toBe(1);
		expect(report.bufferSwap.previousActiveChecksum).toBeNull();
		expect(report.bufferSwap.activeChecksum).toBe(report.outputBufferChecksum);
		expect(report.bufferSwap.readbackVerified).toBe(true);
		expect(report.readback.payloadDigestMatch).toBe(true);
		expect(report.readback.sourceRevisionPrefixMatch).toBe(true);
		expect(report.readback.ordinalMapPrefixMatch).toBe(true);
		expect(report.readback.csrCursorPrefixMatch).toBe(true);

		const snapAfterFirst = bufferSlot.getSnapshot();
		expect(snapAfterFirst.hasActive).toBe(true);
		expect(snapAfterFirst.activeByteLength).toBe(320);
		expect(snapAfterFirst.activeChecksum).toBe(report.outputBufferChecksum);

		// Second valid run with HOLD_BLOCKED swaps cleanly and links previousActiveChecksum
		const blockedReport = runNesFsmNativeRuntimeV1({
			bufferSlot,
			event: 'HOLD_BLOCKED',
		});
		expect(blockedReport.taskTransition.toState).toBe('BLOCKED');
		expect(blockedReport.bufferSwap.swapCount).toBe(2);
		expect(blockedReport.bufferSwap.previousActiveChecksum).toBe(report.outputBufferChecksum);
		expect(bufferSlot.getSnapshot().activeChecksum).toBe(blockedReport.outputBufferChecksum);
	});

	it('rejects wrong byte order (big-endian endian tag) during readback without corrupting active buffer', () => {
		const bufferSlot = new DoubleBufferDescriptorSlotV1();
		const valid = runNesFsmNativeRuntimeV1({ bufferSlot });
		const rawBytes = Uint8Array.from(Buffer.from(valid.descriptorHex, 'hex'));

		const mutated = new Uint8Array(rawBytes);
		const view = new DataView(mutated.buffer, mutated.byteOffset, mutated.byteLength);
		view.setUint32(4, NES_FSM_BINARY_ENDIAN_TAG_BE, true);

		expect(() =>
			readbackAndVerifyBinaryDescriptorV1(mutated, {
				sourceRevision: valid.sourceRevision,
				candidateOrdinalMapChecksum: valid.candidateOrdinalMapChecksum,
				csrCursorChecksum: valid.csrResult.cursor.discoveryPrefixChecksum,
				sortedRecords: valid.sortedRecords,
			})
		).toThrow(/BINARY_DESCRIPTOR_ENDIANNESS_MISMATCH/);

		expect(bufferSlot.getSnapshot().activeChecksum).toBe(valid.outputBufferChecksum);
	});

	it('rejects duplicate candidate ordinals in both batch preflight and corrupted binary readback', () => {
		const dupRecords = FROZEN_NES_FSM_BATCH_V1.records.map((rec, idx) =>
			idx === 5 ? { ...rec, candidateOrdinal: FROZEN_NES_FSM_BATCH_V1.records[0]!.candidateOrdinal } : rec
		);
		const dupBatch: FrozenCandidateBatchV1 = {
			...FROZEN_NES_FSM_BATCH_V1,
			records: dupRecords,
		};

		expect(() => runNesFsmNativeRuntimeV1({ batch: dupBatch })).toThrow(
			/SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE/
		);

		// Also corrupt a serialized buffer so record[1] duplicates record[0]'s ordinal & recompute payload digest
		const valid = runNesFsmNativeRuntimeV1();
		const mutated = Uint8Array.from(Buffer.from(valid.descriptorHex, 'hex'));
		const view = new DataView(mutated.buffer, mutated.byteOffset, mutated.byteLength);
		const firstOrdinal = view.getUint32(NES_FSM_BINARY_HEADER_BYTES, true);
		view.setUint32(NES_FSM_BINARY_HEADER_BYTES + NES_FSM_BINARY_RECORD_BYTES, firstOrdinal, true);
		recomputePayloadDigest(mutated, valid.candidateCount);

		expect(() =>
			readbackAndVerifyBinaryDescriptorV1(mutated, {
				sourceRevision: valid.sourceRevision,
				candidateOrdinalMapChecksum: valid.candidateOrdinalMapChecksum,
				csrCursorChecksum: valid.csrResult.cursor.discoveryPrefixChecksum,
			})
		).toThrow(/BINARY_DESCRIPTOR_DUPLICATE_ORDINAL/);
	});

	it('enforces mask validation and keeps visual nesHex/metadata strictly non-authorizing', () => {
		// 1. Invalid domainBitmask (bit 10 -> 0x0400 exceeds 10-bit 0..1023 domain mask)
		const badMaskBatch: FrozenCandidateBatchV1 = {
			...FROZEN_NES_FSM_BATCH_V1,
			records: FROZEN_NES_FSM_BATCH_V1.records.map((rec, idx) =>
				idx === 0 ? { ...rec, domainBitmask: 0x0400 } : rec
			),
		};
		expect(() => runNesFsmNativeRuntimeV1({ batch: badMaskBatch })).toThrow(/INVALID_DOMAIN_BITMASK/);

		// 2. primaryLutByte absent from record's own domainBitmask
		const mismatchedLutBatch: FrozenCandidateBatchV1 = {
			...FROZEN_NES_FSM_BATCH_V1,
			records: FROZEN_NES_FSM_BATCH_V1.records.map((rec, idx) =>
				idx === 0 ? { ...rec, primaryLutByte: 1, domainBitmask: 0x0200 } : rec
			),
		};
		expect(() => runNesFsmNativeRuntimeV1({ batch: mismatchedLutBatch })).toThrow(
			/PRIMARY_LUT_NOT_IN_DOMAIN_BITMASK/
		);

		// 3. Policy mask insufficient for EVALUATE_READY
		const deniedGrant: PolicyAuthorizationGrantV1 = {
			...DEFAULT_POLICY_GRANT_V1,
			grantedPolicyMask: 0x0001,
			requiredPolicyMask: 0x0007,
		};
		expect(() => runNesFsmNativeRuntimeV1({ authorizationGrant: deniedGrant })).toThrow(
			/POLICY_AUTHORIZATION_DENIED/
		);

		// 4. Passing visual nesHex inside authorization grant is explicitly rejected
		const sneakyGrant = {
			...DEFAULT_POLICY_GRANT_V1,
			nesHex: '0x16',
		} as unknown as PolicyAuthorizationGrantV1;
		expect(() => runNesFsmNativeRuntimeV1({ authorizationGrant: sneakyGrant })).toThrow(
			/NON_AUTHORIZING_FIELD_PASSED_AS_POLICY_GRANT/
		);

		// 5. Non-zero authorityFlagsByte in serialized descriptor header fails readback
		const valid = runNesFsmNativeRuntimeV1();
		const mutated = Uint8Array.from(Buffer.from(valid.descriptorHex, 'hex'));
		mutated[22] = 0x01;
		expect(() =>
			readbackAndVerifyBinaryDescriptorV1(mutated, {
				sourceRevision: valid.sourceRevision,
				candidateOrdinalMapChecksum: valid.candidateOrdinalMapChecksum,
				csrCursorChecksum: valid.csrResult.cursor.discoveryPrefixChecksum,
			})
		).toThrow(/BINARY_DESCRIPTOR_NON_ZERO_AUTHORITY_FLAGS/);
	});

	it('rejects stale source revisions, stale CSR graph revisions, and tampered descriptor revisions', () => {
		expect(() =>
			runNesFsmNativeRuntimeV1({
				expectedSourceRevision: 'git:stale/other-revision',
			})
		).toThrow(/FSM_REVISION_MISMATCH/);

		const staleCsrCursor: CsrGraphCursor = {
			graphRevision: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
			edgePolicyRevision: 'atlas.edge-policy.v1',
			frontier: [6],
			visitedBitmaskHex: '00',
			depth: 0,
			stepsExecuted: 0,
			discoveryPrefixChecksum: '0'.repeat(64),
			exhausted: false,
		};
		expect(() => runNesFsmNativeRuntimeV1({ csrCursor: staleCsrCursor })).toThrow();

		const valid = runNesFsmNativeRuntimeV1();
		const rawBytes = Uint8Array.from(Buffer.from(valid.descriptorHex, 'hex'));
		expect(() =>
			readbackAndVerifyBinaryDescriptorV1(rawBytes, {
				sourceRevision: `${FROZEN_SOURCE_REVISION_V1}-stale`,
				candidateOrdinalMapChecksum: valid.candidateOrdinalMapChecksum,
				csrCursorChecksum: valid.csrResult.cursor.discoveryPrefixChecksum,
			})
		).toThrow(/BINARY_DESCRIPTOR_STALE_SOURCE_REVISION/);
	});

	it('cancels cleanly before buffer swap on pre-aborted and mid-flight AbortSignal without clobbering active buffer', () => {
		const bufferSlot = new DoubleBufferDescriptorSlotV1();
		const initial = runNesFsmNativeRuntimeV1({ bufferSlot });

		// Pre-aborted signal
		const preAborted = new AbortController();
		preAborted.abort();
		expect(() =>
			runNesFsmNativeRuntimeV1({
				bufferSlot,
				signal: preAborted.signal,
			})
		).toThrow(/NES_FSM_RUNTIME_CANCELLED/);
		expect(bufferSlot.getSnapshot().swapCount).toBe(1);
		expect(bufferSlot.getSnapshot().activeChecksum).toBe(initial.outputBufferChecksum);

		// Mid-flight signal triggered right as native radix sort completes
		const { addon } = loadAtlasNativeCoreAddon();
		const midFlightController = new AbortController();
		const cancellingAddon: AtlasNativeCoreBindings = {
			radixSortSomCandidateIndicesV1(clusters, somCells, ordinals) {
				const out = addon.radixSortSomCandidateIndicesV1(clusters, somCells, ordinals);
				if (ordinals.length === 16) {
					midFlightController.abort();
				}
				return out;
			},
			detectRfcOrLanguage: addon.detectRfcOrLanguage,
		};

		expect(() =>
			runNesFsmNativeRuntimeV1({
				bufferSlot,
				signal: midFlightController.signal,
				addonOverride: cancellingAddon,
			})
		).toThrow(/NES_FSM_RUNTIME_CANCELLED/);

		// Double-buffer active slot remained completely untouched
		expect(bufferSlot.getSnapshot().swapCount).toBe(1);
		expect(bufferSlot.getSnapshot().activeChecksum).toBe(initial.outputBufferChecksum);
	});

	it('decodes 16-byte 2bpp 8x8 CHR glyph tiles and enforces strict separation from 8-byte NESCHROM97 metadata', () => {
		const chrBank = buildParentAtlasChrRom8KiB();
		expect(chrBank.byteLength).toBe(CHR_BANK_BYTES);
		expect(chrBank.byteLength).toBe(8192);

		// Round-trip a synthetic 8x8 tile with all 4 palette values (0..3)
		const pixels = new Uint8Array(64);
		for (let i = 0; i < 64; i += 1) {
			pixels[i] = i & 3;
		}
		const encodedTile = encodeChrTile8x8(pixels);
		expect(encodedTile.byteLength).toBe(CHR_TILE_BYTES);
		for (let y = 0; y < 8; y += 1) {
			for (let x = 0; x < 8; x += 1) {
				expect(nesPixel(encodedTile, 0, x, y)).toBe(pixels[y * 8 + x]);
			}
		}
		expect(Array.from(decodeChrTile8x8(encodedTile, 0))).toEqual(Array.from(pixels));

		// Nametable + RGBA render for "CASE EVIDENCE READY" with domain icon tile
		const iconTile = getDomainIconTileIndex(10);
		const nametable = encodeTextToNametable('CASE EVIDENCE READY', 24, iconTile);
		const palette = resolveChrPaletteForNesHex('0x2a');
		const rendered = renderNametableToRgba(chrBank, nametable.tiles, nametable.columns, nametable.rows, '0x2a');
		expect(rendered.width).toBe(24 * 8);
		expect(rendered.height).toBe(8);
		expect(rendered.rgba.byteLength).toBe(24 * 8 * 8 * 4);
		expect(rendered.paletteRgba[2]).toEqual(palette[2]);

		// Pack and unpack 8-byte NESCHROM97 metadata glyph
		const chrom97 = packNesChrom97MetadataGlyph8B({
			isExported: true,
			isAsync: false,
			complexity: 5,
			domainClass: 10,
			latentCluster: 2,
			authority: 0,
			confidence: 230,
			freshnessDays: 1,
		});
		expect(chrom97.byteLength).toBe(NESCHROM97_METADATA_BYTES);
		const unpacked = unpackNesChrom97MetadataGlyph8B(chrom97);
		expect(unpacked.kind).toBe('NESCHROM97_META_8B');
		expect(unpacked.isPixelTile).toBe(false);
		expect(unpacked.canonicalAuthority).toBe(false);
		expect(unpacked.complexity).toBe(5);
		expect(unpacked.domainClass).toBe(10);
		expect(unpacked.confidence).toBe(230);

		// Mutual exclusion checks
		expect(() => assertChrTileDistinctFromChrom97(chrom97, 'CHR_TILE_16B')).toThrow(/CHR_FORMAT_VIOLATION/);
		expect(() => nesPixel(chrom97, 0, 0, 0)).toThrow(/CHR_FORMAT_VIOLATION/);
		expect(() => renderNametableToRgba(chrom97, nametable.tiles, 1, 1, '0x2a')).toThrow(/CHR_FORMAT_VIOLATION/);
		expect(() => unpackNesChrom97MetadataGlyph8B(encodedTile)).toThrow(/NESCHROM97_FORMAT_VIOLATION/);
	});

	it('executes the isolated SvelteKit /demos/nes-fsm-chr-runtime server load() and verifies JSON-serializable CHR + FSM payload', async () => {
		// Also verify C++ lexical DFA authority cannot escalate beyond PROPOSAL_ONLY
		const { addon } = loadAtlasNativeCoreAddon();
		expect(() =>
			runNesFsmNativeRuntimeV1({
				addonOverride: {
					radixSortSomCandidateIndicesV1: addon.radixSortSomCandidateIndicesV1,
					detectRfcOrLanguage: () => ({
						matched: true,
						authority: 'CANONICAL',
						domainTopic: 'retrieval',
						rfcId: 'RFC-TEST',
						featureLabel: 'search_rag',
						languageId: 'ts',
						byteOffset: 0,
						stateTransitions: 1,
					}),
				},
			})
		).toThrow(/NATIVE_DFA_AUTHORITY_ESCALATION_FORBIDDEN/);

		const result = await loadNesFsmDemoPage({} as never);
		expect(result).toBeTruthy();
		if (!result) {
			throw new Error('DEMO_LOAD_RETURNED_EMPTY');
		}
		const roundTripped = JSON.parse(JSON.stringify(result));
		expect(roundTripped.chr.bankByteLength).toBe(8192);
		expect(roundTripped.chr.chrom97Sample.isPixelTile).toBe(false);
		expect(roundTripped.chr.chrom97Sample.canonicalAuthority).toBe(false);
		expect(roundTripped.report.canonicalAuthority).toBe(false);
		expect(roundTripped.report.promotionEligible).toBe(false);
		expect(roundTripped.report.writesPerformed).toBe(false);
		expect(roundTripped.report.outputBufferChecksum).toBe(
			'b00d6db4467a57ad5c048da11345d89c1d817ce8f0dc241cf2f3a221df7de209'
		);
	});
});
