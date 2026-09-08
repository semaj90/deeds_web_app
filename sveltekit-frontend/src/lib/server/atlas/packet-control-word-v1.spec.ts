import { describe, expect, it } from 'vitest';
import {
	decodePacketControlWordV1,
	encodePacketControlWordV1,
	isPacketControlWordBitSet,
	renderPacketControlWordDebugGrid,
} from './packet-control-word-v1.js';

const BASE_INPUT = {
	packetRevision: 'packet-rev-1',
	featureRevision: 'feature-rev-1',
	controlWordSchemaRevision: 'schema-rev-1',
	presentBits: ['UTF8_VALID', 'AST_PRESENT', 'SEMANTIC768_PRESENT'] as const,
	lod: 2 as const,
	residency: 'WARM' as const,
	domainByte: 5,
	routingByte: 9,
};

describe('PacketControlWordV1 (proof gate item 7.1)', () => {
	it('is deterministic for the same inputs', () => {
		const a = encodePacketControlWordV1(BASE_INPUT);
		const b = encodePacketControlWordV1(BASE_INPUT);
		expect(a).toEqual(b);
		expect(a.checksum).toBe(b.checksum);
	});

	it('a schema revision bump changes the checksum, other inputs held fixed', () => {
		const a = encodePacketControlWordV1(BASE_INPUT);
		const b = encodePacketControlWordV1({ ...BASE_INPUT, controlWordSchemaRevision: 'schema-rev-2' });
		expect(a.checksum).not.toBe(b.checksum);
	});

	it('decoder recovers exactly the encoded presence bits, LOD, and residency', () => {
		const word = encodePacketControlWordV1(BASE_INPUT);
		const decoded = decodePacketControlWordV1(word);
		expect(decoded.presentBits.sort()).toEqual([...BASE_INPUT.presentBits].sort());
		expect(decoded.lod).toBe(2);
		expect(decoded.residency).toBe('WARM');
		expect(decoded.domainByte).toBe(5);
		expect(decoded.routingByte).toBe(9);
	});

	it('decoder never exposes an artifact-content field (only bits/nibbles/bytes)', () => {
		const word = encodePacketControlWordV1(BASE_INPUT);
		const decoded = decodePacketControlWordV1(word);
		const keys = Object.keys(decoded);
		expect(keys).toEqual(['presentBits', 'lod', 'residency', 'domainByte', 'routingByte']);
	});

	it('individual bit test helper agrees with the decoded presence list', () => {
		const word = encodePacketControlWordV1(BASE_INPUT);
		expect(isPacketControlWordBitSet(word, 'AST_PRESENT')).toBe(true);
		expect(isPacketControlWordBitSet(word, 'GRAPH_PRESENT')).toBe(false);
	});

	it('the VALIDATED bit (position 63) round-trips correctly at the top of the 64-bit word', () => {
		const word = encodePacketControlWordV1({ ...BASE_INPUT, presentBits: ['VALIDATED'] });
		expect(isPacketControlWordBitSet(word, 'VALIDATED')).toBe(true);
		expect(word.featureBits).toBe(1n << 63n);
	});

	it('rejects an unencodable LOD or residency value at the schema boundary', () => {
		expect(() => encodePacketControlWordV1({ ...BASE_INPUT, lod: 'BOGUS' as never })).toThrow();
	});

	it('renders an 8x8 debug grid with bit 0 at row 0 col 0 and bit 63 at row 7 col 7 (task 2.3)', () => {
		// UTF8_VALID = bit 0 (row 0, col 0); VALIDATED = bit 63 (row 7, col 7)
		const word = encodePacketControlWordV1({
			...BASE_INPUT,
			presentBits: ['UTF8_VALID', 'VALIDATED'],
		});
		const grid = renderPacketControlWordDebugGrid(word);
		const rows = grid.split('\n');
		expect(rows).toHaveLength(8);
		expect(rows.every((r) => r.length === 8)).toBe(true);
		expect(rows[0]![0]).toBe('#'); // bit 0
		expect(rows[7]![7]).toBe('#'); // bit 63
		// every other cell is '.'
		const totalSet = rows.join('').split('').filter((c) => c === '#').length;
		expect(totalSet).toBe(2);
	});
});
