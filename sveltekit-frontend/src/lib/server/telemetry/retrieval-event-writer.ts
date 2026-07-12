/**
 * Phase 2F Task 1.2: Retrieval Event Writer
 *
 * Non-blocking async writer for retrieval telemetry.
 * Designed to be called fire-and-forget at end of retrieval pipeline.
 *
 * Pattern:
 *   eventWriter.writeEvent(event).catch(err => {
 *     console.warn('Failed to write retrieval event:', err);
 *   });
 *
 * This ensures event failures don't block retrieval results.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { validateRetrievalEvent, type RetrievalEvent } from './retrieval-event-schema.js';

/**
 * Non-blocking event writer for retrieval telemetry
 * Handles Postgres writes with graceful degradation
 */
export class RetrievalEventWriter {
	/**
	 * Write a single retrieval event to Postgres
	 * Fire-and-forget pattern: caller should NOT await this
	 *
	 * @param event - Complete retrieval event to persist
	 * @returns Promise that resolves when write completes (or fails gracefully)
	 */
	async writeEvent(event: RetrievalEvent): Promise<void> {
		try {
			// Validate event structure before writing
			const [isValid, errors] = validateRetrievalEvent(event);
			if (!isValid) {
				console.warn('Retrieval event validation failed:', errors);
				// Don't throw; log and continue
				return;
			}

			// Write to Postgres
			await this.writeToDatabaseAsync(event);

			// (Optional future work) Emit to Langfuse or ClickHouse
			// This is deferred to Phase 3A (observability plumbing)
		} catch (err) {
			// Graceful degradation: log warning but don't throw
			console.warn('Failed to write retrieval event:', err instanceof Error ? err.message : String(err));
		}
	}

	/**
	 * Batch write multiple events (for high-volume scenarios)
	 * Still non-blocking; batch is inserted asynchronously
	 *
	 * @param events - Array of retrieval events to write
	 * @returns Promise that resolves when batch write completes
	 */
	async batchWrite(events: RetrievalEvent[]): Promise<void> {
		if (events.length === 0) return;

		try {
			// Validate all events
			const validated = events.filter(event => {
				const [isValid] = validateRetrievalEvent(event);
				return isValid;
			});

			if (validated.length === 0) {
				console.warn(`Batch write: all ${events.length} events failed validation`);
				return;
			}

			// Insert batch
			await this.writeBatchToDatabase(validated);
		} catch (err) {
			console.warn('Failed to write retrieval event batch:', err instanceof Error ? err.message : String(err));
		}
	}

	/**
	 * Write single event to Postgres
	 * Uses raw SQL to avoid dependency on a mapped Drizzle table
	 * (retrieval_events table will be created in Task 1.3)
	 */
	private async writeToDatabaseAsync(event: RetrievalEvent): Promise<void> {
		// For now, log that we would write
		// Once the Postgres schema is in place (Task 1.3), this will execute actual INSERT
		console.debug('RetrievalEventWriter.writeToDatabaseAsync called', {
			query_id: event.query_id,
			total_latency_ms: event.total_latency_ms,
			cache_hit: event.cache_hit
		});

		// Placeholder: actual implementation will be:
		// await db.execute(sql`
		//   INSERT INTO retrieval_events (
		//     query_id, timestamp, session_id, envelope,
		//     query_text, vector_lane_latency_ms, bm25_latency_ms, ast_latency_ms,
		//     total_latency_ms, selected_packet_key, cache_hit, gpu_memory_used_mb
		//   ) VALUES (
		//     ${event.query_id}, ${event.timestamp}, ${event.session_id}, ${JSON.stringify(event)},
		//     ${event.query_text}, ${event.vector_lane_latency_ms}, ${event.bm25_latency_ms}, ${event.ast_latency_ms},
		//     ${event.total_latency_ms}, ${event.selected_packet_key}, ${event.cache_hit}, ${event.gpu_memory_used_mb}
		//   )
		// `);
	}

	/**
	 * Write batch of events to Postgres
	 * Uses multi-row insert for efficiency
	 */
	private async writeBatchToDatabase(events: RetrievalEvent[]): Promise<void> {
		console.debug(`RetrievalEventWriter.writeBatchToDatabase called with ${events.length} events`);

		// Placeholder: once schema exists, use multi-row INSERT
		// const values = events.map(event => ({
		//   query_id: event.query_id,
		//   timestamp: event.timestamp,
		//   session_id: event.session_id,
		//   envelope: JSON.stringify(event),
		//   query_text: event.query_text,
		//   vector_lane_latency_ms: event.vector_lane_latency_ms,
		//   bm25_latency_ms: event.bm25_latency_ms,
		//   ast_latency_ms: event.ast_latency_ms,
		//   total_latency_ms: event.total_latency_ms,
		//   selected_packet_key: event.selected_packet_key,
		//   cache_hit: event.cache_hit,
		//   gpu_memory_used_mb: event.gpu_memory_used_mb
		// }));
		// await db.insert(retrieval_events).values(values);
	}
}

/**
 * Global singleton instance
 * Use this in retrieval orchestrator to write events
 */
export const retrieval_event_writer = new RetrievalEventWriter();
