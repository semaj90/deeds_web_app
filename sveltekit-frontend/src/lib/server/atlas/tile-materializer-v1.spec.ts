import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFixtureTileMaterializerV1 } from './tile-materializer-v1.js';

describe('TileMaterializerV1 (fixture-only)', () => {
	it('resolves registered bytes with a matching checksum and backend-appropriate residency', async () => {
		const bytes = new TextEncoder().encode('hello world');
		const store = new Map([['pkt-1', bytes]]);
		const materializer = createFixtureTileMaterializerV1(store);

		const tile = await materializer.materialize(
			{ packetKey: 'pkt-1', representationKind: 'SOURCE_BYTES' },
			'RAM',
		);

		expect(tile.byteLength).toBe(bytes.length);
		expect(tile.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
		expect(tile.residency).toBe('HOT_CPU');
		expect(tile.backend).toBe('RAM');
	});

	it('maps each backend to its documented default residency', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const store = new Map([['pkt-1', bytes]]);
		const materializer = createFixtureTileMaterializerV1(store);

		expect((await materializer.materialize({ packetKey: 'pkt-1', representationKind: 'X' }, 'SEAWEEDFS')).residency).toBe('COLD');
		expect((await materializer.materialize({ packetKey: 'pkt-1', representationKind: 'X' }, 'MMAP')).residency).toBe('WARM');
		expect((await materializer.materialize({ packetKey: 'pkt-1', representationKind: 'X' }, 'GPU')).residency).toBe('HOT_GPU');
	});

	it('rejects an unregistered packetKey rather than silently returning empty bytes', async () => {
		const materializer = createFixtureTileMaterializerV1(new Map());
		await expect(
			materializer.materialize({ packetKey: 'missing', representationKind: 'X' }, 'RAM'),
		).rejects.toThrow(/no bytes registered/);
	});
});
