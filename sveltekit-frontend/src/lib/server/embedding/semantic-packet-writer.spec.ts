import { describe, expect, it, vi } from 'vitest';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { persistCanonicalSemanticPacketEmbedding } from './semantic-packet-writer.js';
import { CANONICAL_SEMANTIC_ENCODER_REVISION } from './semantic-lineage.js';

describe('persistCanonicalSemanticPacketEmbedding', () => {
	it('writes canonical semantic lineage into atlas_packets', async () => {
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, (_, index) => index / 1000);

		const result = await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:semantic:1',
				sourceRef: 'src/lib/server/example.ts',
				vector,
				metadata: { source: 'unit-test' },
			},
			database,
		);

		expect(result.packetId).toBe('packet:semantic:1');
		expect(result.packetKey).toBe('packet:semantic:1');
		expect(result.lineage.representationId).toBe('semantic_768');
		expect(insert).toHaveBeenCalledWith(atlasPackets);

		const row = values.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(row.packetId).toBe('packet:semantic:1');
		expect(row.packetKey).toBe('packet:semantic:1');
		expect(row.featureId).toBe('semantic_768');
		expect(row.featureLabel).toBe('semantic_768');
		expect(row.representationRevision).toBe(0);
		expect(row.sourceRepresentationId).toBe('semantic_768');
		expect(row.sourceDimension).toBe(768);
		expect(row.encoderRevision).toBe(CANONICAL_SEMANTIC_ENCODER_REVISION);
		expect(typeof row.embeddingDigest).toBe('string');
		expect((row.metadata as Record<string, unknown>).semantic_lineage).toBeTruthy();
		expect((row.metadata as Record<string, unknown>).semantic_lineage).toMatchObject({
			representationId: 'semantic_768',
			dimension: 768,
			encoderRevision: CANONICAL_SEMANTIC_ENCODER_REVISION,
		});
	});

	it('uses the packet key as the durable identity when packetId is omitted', async () => {
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, () => 0.5);

		const result = await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:semantic:2',
				sourceRef: 'src/lib/server/example-2.ts',
				vector,
			},
			database,
		);

		expect(result.packetId).toBe('packet:semantic:2');
		expect(values.mock.calls[0]?.[0].packetUlid).toBe('packet:semantic:2');
		expect(values.mock.calls[0]?.[0].directoryPath).toBe('src/lib/server');
	});
});
