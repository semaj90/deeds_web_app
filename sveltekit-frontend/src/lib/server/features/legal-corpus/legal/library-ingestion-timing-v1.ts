import { performance } from 'node:perf_hooks';

export const LIBRARY_INGESTION_TIMING_SCHEMA_V1 = 'atlas.library-ingestion-timing.v1' as const;

export type LibraryIngestionTimingStageV1 =
	| 'postgres_document_lookup'
	| 'seaweedfs_read_and_hash'
	| 'document_extraction'
	| 'chunking_and_span_validation'
	| 'postgres_revision_writes'
	| 'postgres_node_upserts'
	| 'postgres_chunk_upserts'
	| 'embedding_provider'
	| 'pgvector_upserts'
	| 'qdrant_projection_upsert'
	| 'definition_upserts'
	| 'neo4j_projection'
	| 'total_pipeline';

export interface LibraryIngestionTimingSnapshotV1 {
	readonly schema: typeof LIBRARY_INGESTION_TIMING_SCHEMA_V1;
	readonly durationsMs: Readonly<Partial<Record<LibraryIngestionTimingStageV1, number>>>;
}

/** Cumulative monotonic timings for an ingestion attempt; safe to store in the existing metrics_json column. */
export class LibraryIngestionTimingV1 {
	private readonly startedAt: number;
	private readonly durations = new Map<LibraryIngestionTimingStageV1, number>();

	constructor(private readonly now: () => number = () => performance.now()) {
		this.startedAt = this.now();
	}

	async measure<T>(stage: Exclude<LibraryIngestionTimingStageV1, 'total_pipeline'>, work: () => Promise<T>): Promise<T> {
		const startedAt = this.now();
		try {
			return await work();
		} finally {
			this.record(stage, this.now() - startedAt);
		}
	}

	record(stage: LibraryIngestionTimingStageV1, durationMs: number): void {
		if (!Number.isFinite(durationMs) || durationMs < 0) throw new RangeError('LIBRARY_INGESTION_TIMING_INVALID');
		const previous = this.durations.get(stage) ?? 0;
		this.durations.set(stage, roundMs(previous + durationMs));
	}

	snapshot(): LibraryIngestionTimingSnapshotV1 {
		const durationsMs: Partial<Record<LibraryIngestionTimingStageV1, number>> = Object.fromEntries(this.durations);
		durationsMs.total_pipeline = roundMs(Math.max(0, this.now() - this.startedAt));
		return { schema: LIBRARY_INGESTION_TIMING_SCHEMA_V1, durationsMs };
	}
}

function roundMs(value: number): number {
	return Math.round(value * 10) / 10;
}
