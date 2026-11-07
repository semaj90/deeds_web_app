import { describe, expect, it } from 'vitest';
import {
	classifyTriangleSurface,
	decodeActiveSlotBitset,
	NES_QUANTIZED_PALETTE_LUT,
	sceneFsmCache,
	transitionState,
	TRANSFORM_CAPACITY,
	MATRIX_STRIDE,
} from './scene-fsm-cache';

describe('N64 Aligned Scene FSM Cache', () => {
	it('preallocates 64-byte aligned arena for transforms', () => {
		expect(sceneFsmCache.transformArena.length).toBe(TRANSFORM_CAPACITY * MATRIX_STRIDE);
		expect(TRANSFORM_CAPACITY * MATRIX_STRIDE * 4).toBe(16384); // 16 KB total footprint
	});

	it('transitions states deterministically', () => {
		let notified = false;
		const unsub = sceneFsmCache.subscribe((state) => {
			if (state.currentState === 'INSPECT_EXHIBIT') {
				notified = true;
			}
		});

		transitionState('INSPECT_EXHIBIT', 'exhibit_001');
		expect(sceneFsmCache.currentState).toBe('INSPECT_EXHIBIT');
		expect(sceneFsmCache.activeExhibitId).toBe('exhibit_001');
		expect(notified).toBe(true);

		unsub();
		transitionState('IDLE');
		expect(sceneFsmCache.currentState).toBe('IDLE');
		expect(sceneFsmCache.activeExhibitId).toBeNull();
	});

	it('reads and writes transform blocks without reallocating arrays', () => {
		const identity16 = [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			10.5, 2.0, -5.0, 1
		];

		sceneFsmCache.setTransform(5, identity16);
		const view = sceneFsmCache.getTransformSubarray(5);
		expect(view[0]).toBe(1);
		expect(view[12]).toBe(10.5);
		expect(view[13]).toBe(2.0);
		expect(view[14]).toBe(-5.0);
	});

	it('decodes PostgreSQL 18 AIO BIT(256) bitsets into active slot arena indices', () => {
		// Bitstring where slots 0, 2, and 255 are active
		let bitstring = '101' + '0'.repeat(252) + '1';
		const activeSlots = decodeActiveSlotBitset(bitstring);
		expect(activeSlots).toEqual([0, 2, 255]);

		// Uint8Array representation: byte 0 = 0b00000101 (slots 0 and 2 active)
		const bytes = new Uint8Array(32);
		bytes[0] = 0b00000101;
		bytes[31] = 0b10000000; // slot 255 (31 * 8 + 7)
		expect(decodeActiveSlotBitset(bytes)).toEqual([0, 2, 255]);
	});

	it('provides the 8-color quantized NES / Rubber-Hose palette LUT', () => {
		expect(NES_QUANTIZED_PALETTE_LUT).toHaveLength(8);
		expect(NES_QUANTIZED_PALETTE_LUT[0].name).toBe('Obsidian');
		expect(NES_QUANTIZED_PALETTE_LUT[1].name).toBe('Oxblood');
		expect(NES_QUANTIZED_PALETTE_LUT[5].name).toBe('Gold');
		expect(NES_QUANTIZED_PALETTE_LUT[6].name).toBe('Soft Mint');
		expect(NES_QUANTIZED_PALETTE_LUT[7].name).toBe('Cyan Laser');
	});
});

