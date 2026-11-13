import { describe, expect, it } from 'vitest';
import { LibraryIngestionTimingV1 } from './library-ingestion-timing-v1.js';

describe('LibraryIngestionTimingV1', () => {
	it('accumulates monotonic stage durations and emits a JSON-safe cumulative snapshot', async () => {
		let now = 100;
		const timing = new LibraryIngestionTimingV1(() => now);

		const value = await timing.measure('seaweedfs_read_and_hash', async () => {
			now += 12.34;
			return 'source-hash-verified';
		});
		await timing.measure('pgvector_upserts', async () => {
			now += 4.26;
		});
		now += 2.04;
		timing.record('pgvector_upserts', 2.04);

		expect(value).toBe('source-hash-verified');
		expect(timing.snapshot()).toEqual({
			schema: 'atlas.library-ingestion-timing.v1',
			durationsMs: {
				seaweedfs_read_and_hash: 12.3,
				pgvector_upserts: 6.3,
				total_pipeline: 18.6,
			},
		});
	});

	it('records failed stage durations and rejects invalid or negative values', async () => {
		let now = 0;
		const timing = new LibraryIngestionTimingV1(() => now);
		await expect(timing.measure('document_extraction', async () => {
			now = 3;
			throw new Error('fixture failure');
		})).rejects.toThrow('fixture failure');
		expect(timing.snapshot().durationsMs.document_extraction).toBe(3);
		expect(() => timing.record('pgvector_upserts', Number.NaN)).toThrow('LIBRARY_INGESTION_TIMING_INVALID');
		expect(() => timing.record('pgvector_upserts', -1)).toThrow('LIBRARY_INGESTION_TIMING_INVALID');
	});
});
