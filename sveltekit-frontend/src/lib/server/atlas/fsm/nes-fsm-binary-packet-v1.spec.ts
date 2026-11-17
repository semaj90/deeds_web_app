import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	FROZEN_NES_FSM_BATCH_V1,
	runNesFsmNativeRuntimeV1,
} from './nes-fsm-native-runtime-v1.js';
import {
	materializeNesFsmBinaryPacketV1,
	validateNesFsmBinaryPacketV1,
} from './nes-fsm-binary-packet-v1.js';

describe('NES FSM binary packet v1', () => {
	it('materializes a bounded LE packet and round-trips its sourceRef-to-ordinal map', () => {
		const validated = materializeNesFsmBinaryPacketV1(runNesFsmNativeRuntimeV1());
		expect(validated.packet.scope).toBe('FIXTURE_ONLY');
		expect(validated.packet.canonicalAuthority).toBe(false);
		expect(validated.packet.writesPerformed).toBe(false);
		expect(validated.readback.endianness).toBe('LE');
		expect(validated.payload.byteLength).toBe(validated.packet.payloadByteLength);
		expect(validated.packet.sortedCandidateOrdinals).toHaveLength(validated.packet.candidateMap.length);
	});

	it('rejects a payload mutation even when the JSON envelope is otherwise valid', () => {
		const packet = materializeNesFsmBinaryPacketV1(runNesFsmNativeRuntimeV1()).packet;
		const changedBytes = Buffer.from(packet.payloadBase64, 'base64');
		changedBytes[70] = changedBytes[70]! ^ 0x01;
		expect(() => validateNesFsmBinaryPacketV1({ ...packet, payloadBase64: changedBytes.toString('base64') }))
			.toThrow(/PAYLOAD_CHECKSUM_MISMATCH/);
	});

	it('rejects a rewritten source reference without a matching ordinal-map checksum', () => {
		const packet = materializeNesFsmBinaryPacketV1(runNesFsmNativeRuntimeV1()).packet;
		const candidateMap = packet.candidateMap.map((entry, index) =>
			index === 0 ? { ...entry, sourceRef: `${entry.sourceRef}/other` } : entry
		);
		expect(() => validateNesFsmBinaryPacketV1({ ...packet, candidateMap }))
			.toThrow(/CANDIDATE_MAP_CHECKSUM_MISMATCH/);
	});

	it('rejects an endian-swapped binary header even when the outer payload digest is recomputed', () => {
		const packet = materializeNesFsmBinaryPacketV1(runNesFsmNativeRuntimeV1()).packet;
		const payload = Buffer.from(packet.payloadBase64, 'base64');
		payload.writeUInt32LE(0x04030201, 4);
		const payloadSha256 = createHash('sha256').update(payload).digest('hex');
		expect(() => validateNesFsmBinaryPacketV1({
			...packet,
			payloadBase64: payload.toString('base64'),
			payloadSha256,
		})).toThrow(/ENDIANNESS_MISMATCH/);
	});

	it('rejects nonzero layout padding even when the outer payload digest is recomputed', () => {
		const batch = { ...FROZEN_NES_FSM_BATCH_V1, records: FROZEN_NES_FSM_BATCH_V1.records.slice(0, 15) };
		const packet = materializeNesFsmBinaryPacketV1(runNesFsmNativeRuntimeV1({ batch })).packet;
		const payload = Buffer.from(packet.payloadBase64, 'base64');
		payload[payload.byteLength - 1] = 0x7f;
		const payloadSha256 = createHash('sha256').update(payload).digest('hex');
		expect(() => validateNesFsmBinaryPacketV1({
			...packet,
			payloadBase64: payload.toString('base64'),
			payloadSha256,
		})).toThrow(/NON_ZERO_PADDING/);
	});
});
