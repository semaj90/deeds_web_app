import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	MAX_NES_FSM_BATCH_RECORDS_V1,
	NES_FSM_BINARY_ALIGNMENT_BYTES,
	NES_FSM_BINARY_HEADER_BYTES,
	NES_FSM_BINARY_RECORD_BYTES,
	NES_FSM_BINARY_SCHEMA_REVISION_V1,
	type NesFsmNativeRuntimeReportV1,
	readbackAndVerifyBinaryDescriptorV1,
} from './nes-fsm-native-runtime-v1.js';

export const NES_FSM_BINARY_PACKET_SCHEMA_V1 = 'atlas.nes-fsm-binary-packet.v1' as const;
export const NES_FSM_BINARY_PACKET_SCOPE_V1 = 'FIXTURE_ONLY' as const;
const MAX_PAYLOAD_BYTES =
	NES_FSM_BINARY_HEADER_BYTES + MAX_NES_FSM_BATCH_RECORDS_V1 * NES_FSM_BINARY_RECORD_BYTES;
const MAX_BASE64_CHARS = Math.ceil(MAX_PAYLOAD_BYTES / 3) * 4;

const CandidateIdentitySchema = z.object({
	sourceIndex: z.number().int().nonnegative().max(MAX_NES_FSM_BATCH_RECORDS_V1 - 1),
	candidateOrdinal: z.number().int().nonnegative().max(0xffff_ffff),
	sourceRef: z.string().min(1).max(2048),
}).strict();

export const NesFsmBinaryPacketSchemaV1 = z.object({
	schema: z.literal(NES_FSM_BINARY_PACKET_SCHEMA_V1),
	scope: z.literal(NES_FSM_BINARY_PACKET_SCOPE_V1),
	canonicalAuthority: z.literal(false),
	promotionEligible: z.literal(false),
	writesPerformed: z.literal(false),
	sourceRevision: z.string().startsWith('fixture:'),
	workspaceRevision: z.string().startsWith('fixture:'),
	binarySchemaRevision: z.literal(NES_FSM_BINARY_SCHEMA_REVISION_V1),
	endianness: z.literal('LE'),
	serializedLayoutAlignmentBytes: z.literal(NES_FSM_BINARY_ALIGNMENT_BYTES),
	payloadByteLength: z.number().int().min(NES_FSM_BINARY_HEADER_BYTES).max(MAX_PAYLOAD_BYTES),
	payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
	candidateOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	csrCursorChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	candidateMap: z.array(CandidateIdentitySchema).min(1).max(MAX_NES_FSM_BATCH_RECORDS_V1),
	sortedCandidateOrdinals: z.array(z.number().int().nonnegative().max(0xffff_ffff))
		.min(1).max(MAX_NES_FSM_BATCH_RECORDS_V1),
	payloadBase64: z.string().min(4).max(MAX_BASE64_CHARS)
		.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();

export type NesFsmBinaryPacketV1 = z.infer<typeof NesFsmBinaryPacketSchemaV1>;

export interface ValidatedNesFsmBinaryPacketV1 {
	readonly packet: NesFsmBinaryPacketV1;
	readonly payload: Uint8Array;
	readonly readback: ReturnType<typeof readbackAndVerifyBinaryDescriptorV1>;
}

function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function candidateMapChecksum(
	map: readonly z.infer<typeof CandidateIdentitySchema>[],
	sourceRevision: string
): string {
	const canonical = map
		.map((entry) => `${entry.sourceIndex}|${entry.candidateOrdinal}|${entry.sourceRef}|${sourceRevision}\n`)
		.join('');
	return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function assertCandidateMap(packet: NesFsmBinaryPacketV1): void {
	const sorted = [...packet.candidateMap].sort((a, b) => a.sourceIndex - b.sourceIndex);
	if (sorted.some((entry, index) => entry.sourceIndex !== index)) {
		throw new Error('NES_FSM_PACKET_SOURCE_INDEX_GAP_OR_DUPLICATE');
	}
	if (new Set(sorted.map((entry) => entry.candidateOrdinal)).size !== sorted.length) {
		throw new Error('NES_FSM_PACKET_DUPLICATE_CANDIDATE_ORDINAL');
	}
	if (candidateMapChecksum(sorted, packet.sourceRevision) !== packet.candidateOrdinalMapChecksum) {
		throw new Error('NES_FSM_PACKET_CANDIDATE_MAP_CHECKSUM_MISMATCH');
	}
	if (packet.sortedCandidateOrdinals.length !== sorted.length ||
		new Set(packet.sortedCandidateOrdinals).size !== sorted.length ||
		packet.sortedCandidateOrdinals.some((ordinal) => !sorted.some((entry) => entry.candidateOrdinal === ordinal))) {
		throw new Error('NES_FSM_PACKET_SORTED_ORDINALS_DO_NOT_MATCH_CANDIDATE_MAP');
	}
}

/**
 * Packages the already-validated NES binary descriptor as a bounded JSON/RPC envelope.
 * This is intentionally fixture-only: it does not make ordinals canonical or authorize dispatch.
 */
export function materializeNesFsmBinaryPacketV1(
	report: NesFsmNativeRuntimeReportV1
): ValidatedNesFsmBinaryPacketV1 {
	return validateNesFsmBinaryPacketV1(assembleNesFsmBinaryPacketV1(report));
}

/** Assembles the metadata envelope around the existing, independently validated binary descriptor. */
export function assembleNesFsmBinaryPacketV1(report: NesFsmNativeRuntimeReportV1): NesFsmBinaryPacketV1 {
	if (report.canonicalAuthority || report.promotionEligible || report.writesPerformed || report.valkeyWritesPerformed ||
		!report.sourceRevision.startsWith('fixture:') || !report.workspaceRevision.startsWith('fixture:') ||
		!report.readback.payloadDigestMatch || !report.readback.sourceRevisionPrefixMatch ||
		!report.readback.ordinalMapPrefixMatch || !report.readback.csrCursorPrefixMatch) {
		throw new Error('NES_FSM_PACKET_FIXTURE_GATE_FAILED');
	}
	if (!/^(?:[a-f0-9]{2})+$/.test(report.descriptorHex)) {
		throw new Error('NES_FSM_PACKET_INVALID_DESCRIPTOR_HEX');
	}
	const payload = Buffer.from(report.descriptorHex, 'hex');
	const candidateMap = report.sortedRecords
		.map((record) => ({
			sourceIndex: record.sourceIndex,
			candidateOrdinal: record.candidateOrdinal,
			sourceRef: record.sourceRef,
		}))
		.sort((a, b) => a.sourceIndex - b.sourceIndex);
	if (sha256Hex(payload) !== report.outputBufferChecksum) {
		throw new Error('NES_FSM_PACKET_REPORT_PAYLOAD_CHECKSUM_MISMATCH');
	}
	const packet = NesFsmBinaryPacketSchemaV1.parse({
		schema: NES_FSM_BINARY_PACKET_SCHEMA_V1,
		scope: NES_FSM_BINARY_PACKET_SCOPE_V1,
		canonicalAuthority: false,
		promotionEligible: false,
		writesPerformed: false,
		sourceRevision: report.sourceRevision,
		workspaceRevision: report.workspaceRevision,
		binarySchemaRevision: report.binarySchemaRevision,
		endianness: report.endianness,
		serializedLayoutAlignmentBytes: report.serializedLayoutAlignmentBytes,
		payloadByteLength: payload.byteLength,
		payloadSha256: sha256Hex(payload),
		candidateOrdinalMapChecksum: report.candidateOrdinalMapChecksum,
		csrCursorChecksum: report.csrResult.cursor.discoveryPrefixChecksum,
		candidateMap,
		sortedCandidateOrdinals: report.sortedRecords.map((record) => record.candidateOrdinal),
		payloadBase64: payload.toString('base64'),
	});
	return packet;
}

/** Validates the envelope, manifest and binary descriptor before exposing copied bytes. */
export function validateNesFsmBinaryPacketV1(input: unknown): ValidatedNesFsmBinaryPacketV1 {
	const packet = NesFsmBinaryPacketSchemaV1.parse(input);
	assertCandidateMap(packet);
	const payloadBuffer = Buffer.from(packet.payloadBase64, 'base64');
	if (payloadBuffer.toString('base64') !== packet.payloadBase64) {
		throw new Error('NES_FSM_PACKET_NON_CANONICAL_BASE64');
	}
	if (payloadBuffer.byteLength !== packet.payloadByteLength || payloadBuffer.byteLength > MAX_PAYLOAD_BYTES) {
		throw new Error('NES_FSM_PACKET_PAYLOAD_LENGTH_MISMATCH');
	}
	if (sha256Hex(payloadBuffer) !== packet.payloadSha256) {
		throw new Error('NES_FSM_PACKET_PAYLOAD_CHECKSUM_MISMATCH');
	}
	const descriptorView = new DataView(payloadBuffer.buffer, payloadBuffer.byteOffset, payloadBuffer.byteLength);
	if (payloadBuffer.byteLength < NES_FSM_BINARY_HEADER_BYTES) {
		throw new Error('NES_FSM_PACKET_PAYLOAD_TRUNCATED');
	}
	const descriptorCount = descriptorView.getUint16(10, true);
	if (descriptorCount !== packet.sortedCandidateOrdinals.length) {
		throw new Error('NES_FSM_PACKET_SORTED_ORDINAL_COUNT_MISMATCH');
	}
	for (let index = 0; index < descriptorCount; index += 1) {
		const ordinal = descriptorView.getUint32(NES_FSM_BINARY_HEADER_BYTES + index * NES_FSM_BINARY_RECORD_BYTES, true);
		if (ordinal !== packet.sortedCandidateOrdinals[index]) {
			throw new Error(`NES_FSM_PACKET_SORTED_ORDINAL_MISMATCH_AT_${index}`);
		}
	}
	const readback = readbackAndVerifyBinaryDescriptorV1(payloadBuffer, {
		sourceRevision: packet.sourceRevision,
		candidateOrdinalMapChecksum: packet.candidateOrdinalMapChecksum,
		csrCursorChecksum: packet.csrCursorChecksum,
	});
	const unpaddedByteLength = NES_FSM_BINARY_HEADER_BYTES + readback.candidateCount * NES_FSM_BINARY_RECORD_BYTES;
	const expectedPaddedByteLength =
		(unpaddedByteLength + NES_FSM_BINARY_ALIGNMENT_BYTES - 1) & ~(NES_FSM_BINARY_ALIGNMENT_BYTES - 1);
	if (payloadBuffer.byteLength !== expectedPaddedByteLength) {
		throw new Error('NES_FSM_PACKET_LAYOUT_LENGTH_MISMATCH');
	}
	for (let offset = unpaddedByteLength; offset < payloadBuffer.byteLength; offset += 1) {
		if (payloadBuffer[offset] !== 0) throw new Error(`NES_FSM_PACKET_NON_ZERO_PADDING_AT_${offset}`);
	}
	if (readback.candidateCount !== packet.candidateMap.length || !readback.payloadDigestMatch ||
		!readback.sourceRevisionPrefixMatch || !readback.ordinalMapPrefixMatch || !readback.csrCursorPrefixMatch) {
		throw new Error('NES_FSM_PACKET_DESCRIPTOR_READBACK_FAILED');
	}
	return { packet, payload: new Uint8Array(payloadBuffer), readback };
}
