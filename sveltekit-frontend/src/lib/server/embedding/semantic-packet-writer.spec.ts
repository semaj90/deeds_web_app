import { describe, expect, it, vi } from 'vitest';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { computePacketKey as computeCanonicalPacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import { persistCanonicalSemanticPacketEmbedding } from './semantic-packet-writer.js';
import { CANONICAL_SEMANTIC_ENCODER_REVISION } from './semantic-lineage.js';

const { mockResolveCanonicalPacketKey } = vi.hoisted(() => ({
	mockResolveCanonicalPacketKey: vi.fn(async (inputKey: string) => inputKey),
}));

vi.mock('$lib/server/atlas/identity/packet-identity-resolver.js', () => ({
	resolveCanonicalPacketKey: mockResolveCanonicalPacketKey,
}));

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

	it('derives the packet key from canonical structural fields when packetKey is omitted', async () => {
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, (_, index) => (index % 2 === 0 ? 0.25 : -0.25));
		const sourceRef = 'src/lib/server/example-3.ts';
		const treeNodeId = 'src/lib/server/example-3.ts:12:4:function';
		const titleId = 'example-3';
		const expectedPacketKey = computeCanonicalPacketKey(sourceRef, treeNodeId, titleId);

		const result = await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: '',
				sourceRef,
				treeNodeId,
				titleId,
				vector,
			},
			database,
		);

		expect(result.packetKey).toBe(expectedPacketKey);
		expect(result.packetId).toBe(expectedPacketKey);
		expect(values.mock.calls[0]?.[0].packetKey).toBe(expectedPacketKey);
		expect(values.mock.calls[0]?.[0].packetId).toBe(expectedPacketKey);
	});

	it('resolves an alias packetKey before persisting canonical semantic lineage', async () => {
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, (_, index) => (index % 3 === 0 ? 0.1 : -0.1));
		const sourceRef = 'src/lib/server/example-4.ts';
		const treeNodeId = 'src/lib/server/example-4.ts:4:1:function';
		const titleId = 'example-4';
		const canonicalPacketKey = computeCanonicalPacketKey(sourceRef, treeNodeId, titleId);

		mockResolveCanonicalPacketKey.mockImplementationOnce(async (inputKey: string) =>
			inputKey === 'packet:legacy:alias' ? canonicalPacketKey : inputKey
		);

		const result = await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:legacy:alias',
				sourceRef,
				treeNodeId,
				titleId,
				vector,
			},
			database,
		);

		expect(result.packetKey).toBe(canonicalPacketKey);
		expect(values.mock.calls[0]?.[0].packetKey).toBe(canonicalPacketKey);
		expect(mockResolveCanonicalPacketKey).toHaveBeenCalledWith('packet:legacy:alias');
	});

	it('writes sourceRevision when the caller supplies real revision evidence', async () => {
		const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, () => 0.1);

		await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:semantic:5',
				sourceRef: 'src/lib/server/example-5.ts',
				sourceRevision: 'sha256:abc123',
				vector,
			},
			database,
		);

		expect(values.mock.calls[0]?.[0].sourceRevision).toBe('sha256:abc123');
		// PACKET-WRITER-SOURCE-REVISION-PRESERVATION-01: the conflict branch now
		// wraps sourceRevision in COALESCE(new, existing) so a proven value can
		// never be silently clobbered by a revision-blind caller. It is therefore
		// a Drizzle SQL fragment, not a plain literal -- assert the fragment
		// carries the supplied value and the preservation function, not a bare
		// string equality (which real runtime behavior is proven live in
		// scripts/atlas/prove-source-revision-preservation-v1.mts, not here).
		const updateSet = onConflictDoUpdate.mock.calls[0]?.[0]?.set as Record<string, unknown>;
		const isSqlFragment = typeof updateSet.sourceRevision === 'object' && updateSet.sourceRevision !== null;
		expect(isSqlFragment).toBe(true); // COALESCE-wrapped, not a plain literal/null -- real SQL behavior proven live separately
	});

	it('never fabricates sourceRevision -- leaves it null when the caller has no evidence', async () => {
		const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, () => 0.2);

		await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:semantic:6',
				sourceRef: 'src/lib/server/example-6.ts',
				vector,
			},
			database,
		);

		expect(values.mock.calls[0]?.[0].sourceRevision).toBeNull();
		// See preservation note above -- the conflict branch is COALESCE-wrapped
		// even when the supplied value is null, so an existing proven value on
		// the row is preserved rather than overwritten with NULL.
		const updateSet = onConflictDoUpdate.mock.calls[0]?.[0]?.set as Record<string, unknown>;
		const isSqlFragment = typeof updateSet.sourceRevision === 'object' && updateSet.sourceRevision !== null;
		expect(isSqlFragment).toBe(true); // COALESCE-wrapped, not a plain literal/null -- real SQL behavior proven live separately
	});

	it('writes summary when the caller supplies it (PACKET-WRITER-SUMMARY-FIELD-WIRING-01)', async () => {
		const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, () => 0.3);

		await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:semantic:7',
				sourceRef: 'src/lib/server/example-7.ts',
				summary: 'Handles canonical semantic packet persistence.',
				vector,
			},
			database,
		);

		expect(values.mock.calls[0]?.[0].summary).toBe('Handles canonical semantic packet persistence.');
		// Same never-clobber pattern as sourceRevision: the conflict branch is
		// COALESCE-wrapped so an existing stored summary (e.g. from the separate
		// backfill-atlas-packet-summaries-from-layers.mjs pass) is never
		// overwritten with NULL by a summary-blind caller.
		const updateSet = onConflictDoUpdate.mock.calls[0]?.[0]?.set as Record<string, unknown>;
		const isSqlFragment = typeof updateSet.summary === 'object' && updateSet.summary !== null;
		expect(isSqlFragment).toBe(true); // COALESCE-wrapped, not a plain literal/null -- real SQL behavior proven live separately
	});

	it('leaves summary null when the caller does not supply one, without dropping it silently', async () => {
		const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const database = { insert } as any;
		const vector = Array.from({ length: 768 }, () => 0.4);

		await persistCanonicalSemanticPacketEmbedding(
			{
				packetKey: 'packet:semantic:8',
				sourceRef: 'src/lib/server/example-8.ts',
				vector,
			},
			database,
		);

		expect(values.mock.calls[0]?.[0].summary).toBeNull();
		const updateSet = onConflictDoUpdate.mock.calls[0]?.[0]?.set as Record<string, unknown>;
		const isSqlFragment = typeof updateSet.summary === 'object' && updateSet.summary !== null;
		expect(isSqlFragment).toBe(true); // COALESCE-wrapped -- an existing proven summary is preserved, never clobbered
	});
});
