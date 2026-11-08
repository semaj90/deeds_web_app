import { describe, it, expect } from 'vitest';
import {
	encodeTaskDomains,
	decodeTaskDomains,
	translateTaskLutToCanonicalPalette,
	CANONICAL_NES_PALETTE_V1,
	TASK_TAXONOMY_REVISION_V2,
	CANONICAL_NES_PALETTE_REVISION_V1
} from './task-domain-lut-reconciliation-v1.js';

describe('Task Domain LUT Reconciliation V1', () => {
	it('encodes and decodes 10-domain uint16 bitmasks losslessly (0x09 AGENT + 0x01 WHO === 257)', () => {
		const mask = encodeTaskDomains([0x09, 0x01]);
		expect(mask).toBe(257);
		expect(decodeTaskDomains(mask)).toEqual([1, 9]);

		// Full 10-domain membership = 1023 (0x03FF)
		const allCodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const fullMask = encodeTaskDomains(allCodes);
		expect(fullMask).toBe(1023);
		expect(decodeTaskDomains(fullMask)).toEqual(allCodes);
	});

	it('rejects out-of-range task codes and bitmasks exceeding 10 bits', () => {
		expect(() => encodeTaskDomains([0])).toThrow(RangeError);
		expect(() => encodeTaskDomains([11])).toThrow(RangeError);
		expect(() => decodeTaskDomains(-1)).toThrow(RangeError);
		expect(() => decodeTaskDomains(1024)).toThrow(RangeError);
	});

	it('reconciles 0x0A UI_SVELTE5_BOARD to canonical nes-domain-palette-v1 ui (lutByte=2, nesHex=0x2A)', () => {
		const uiBridge = translateTaskLutToCanonicalPalette(0x0a);
		expect(uiBridge.taskTaxonomyRevision).toBe(TASK_TAXONOMY_REVISION_V2);
		expect(uiBridge.taskDomainKey).toBe('UI_SVELTE5_BOARD');
		expect(uiBridge.canonicalPalette.lutRevision).toBe(CANONICAL_NES_PALETTE_REVISION_V1);
		expect(uiBridge.canonicalPalette.domainKey).toBe('ui');
		expect(uiBridge.canonicalPalette.jsonLutByte).toBe(2);
		expect(uiBridge.canonicalPalette.sqlSeedLutByte).toBe(2);
		expect(uiBridge.canonicalPalette.nesHex).toBe('0x2A');
	});

	it('preserves SQL seed general=0 vs JSON general=10 distinction without conflating nesHex=0x0F', () => {
		expect(CANONICAL_NES_PALETTE_V1.general.jsonLutByte).toBe(10);
		expect(CANONICAL_NES_PALETTE_V1.general.sqlSeedLutByte).toBe(0);
		expect(CANONICAL_NES_PALETTE_V1.general.nesHex).toBe('0x0F');
	});
});
