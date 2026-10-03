import { describe, expect, it } from 'vitest';
import { sanitizeTelemetry } from './feature-context-cache.js';

describe('ACE/BitFrost cache boundary', () => {
	it('removes hidden reasoning, model KV, tensors, and device pointers recursively', () => {
		const sanitized = sanitizeTelemetry({
			packet: { sourceRef: 'src/app.ts', hiddenThoughts: 'secret', nested: { kv_cache: [1, 2], tensor: [3], cudaPointer: '0x1' } },
			chainOfThought: 'secret',
			visible: 'keep',
		});
		expect(sanitized).toEqual({ packet: { sourceRef: 'src/app.ts', nested: {} }, visible: 'keep' });
	});

	it('does not mutate the caller-owned payload', () => {
		const source = { hiddenThoughts: 'secret', visible: true };
		const sanitized = sanitizeTelemetry(source);
		expect(source).toEqual({ hiddenThoughts: 'secret', visible: true });
		expect(sanitized).toEqual({ visible: true });
	});
});
