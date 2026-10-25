import { describe, expect, it } from 'vitest';
import { extractRuntimeSlotsV1 } from './runtime-slot-extraction-v1.js';

describe('RUNTIME-SLOT-EXTRACTION-01', () => {
	it('extracts typed input slots without treating caller values as verified evidence', () => {
		const result = extractRuntimeSlotsV1({
			workspaceId: 'workspace:legal-ai-1',
			workspaceRevision: 'sha256:' + 'a'.repeat(64),
			sourceRef: 'src/lib/server/atlas/operations/runtime-slot-extraction-v1.ts',
			sourceRevision: 'sha256:' + 'b'.repeat(64),
			actorId: 'agent-executor',
			actorType: 'SERVICE',
			packetKey: 'packet:symbol-repair-v0',
			candidateOrdinal: 42,
			toolName: 'atlas.retrieve',
			stateName: 'RETRIEVE',
			payloadText: 'Observed [CCR: b3df3352432ed4f38c765afe] in prompt header',
		});

		expect(result.slotCount).toBe(11);
		expect(result.groundingStatus).toBe('UNVERIFIED_INPUT');
		expect(result.extractedSlots.every((slot) => slot.verified === false)).toBe(true);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);

		const ccrSlot = result.extractedSlots.find((s) => s.slotName === 'ccrHash');
		expect(ccrSlot?.slotValue).toBe('b3df3352432ed4f38c765afe');
		expect(ccrSlot?.origin).toBe('PAYLOAD_TEXT_PATTERN');

		const ordinalSlot = result.extractedSlots.find((s) => s.slotName === 'candidateOrdinal');
		expect(ordinalSlot?.slotValue).toBe('42');
	});

	it('fails closed on missing workspace identity', () => {
		expect(() =>
			extractRuntimeSlotsV1({
				workspaceId: '',
				workspaceRevision: 'rev-1',
			}),
		).toThrow();
	});
});
