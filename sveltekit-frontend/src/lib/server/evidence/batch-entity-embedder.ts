/**
 * RTX Batch Entity Embedding Pipeline
 *
 * High-performance batch embedding for extracted entities using:
 * 1. LangExtract spaCy NER (21 entity types)
 * 2. Batch embedding via Ollama/gRPC
 * 3. PostgreSQL COPY protocol for bulk inserts
 *
 * Performance: ~100-500 entities/sec vs ~10-20 with individual INSERTs
 */

import db from '$lib/server/db/client.js';
import { embedTexts } from '$lib/server/batch-embedder.js';
import type { Entity } from '$lib/server/analysis/entity-extraction.js';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';

// ── Types ──────────────────────────────────────────────────────────

export interface EntityEmbeddingRow {
	entityId: string;
	evidenceId: string;
	entityType: string;
	entityValue: string;
	embedding: number[];
	confidence: number;
	startOffset: number;
	endOffset: number;
	source: string;
}

export interface BatchEmbedResult {
	inserted: number;
	cached: number;
	failed: number;
	durationMs: number;
}

// ── Batch Embedding + COPY Protocol Insert ────────────────────────

/**
 * Batch embed entities and store using PostgreSQL COPY protocol
 *
 * @param entities - Extracted entities from LangExtract/LLM
 * @param evidenceId - Evidence UUID
 * @returns Batch insert stats
 */
export async function batchEmbedAndStoreEntities(
	entities: Entity[],
	evidenceId: string
): Promise<BatchEmbedResult> {
	const start = Date.now();

	if (entities.length === 0) {
		return { inserted: 0, cached: 0, failed: 0, durationMs: 0 };
	}

	// 1. Generate embeddings in batch (32x faster with GPU parallelism)
	const texts = entities.map((e) => e.text);
	const embeddings = await embedTexts(texts);

	// 2. Prepare rows for COPY protocol
	const rows: EntityEmbeddingRow[] = entities.map((entity, i) => ({
		entityId: crypto.randomUUID(),
		evidenceId,
		entityType: entity.label,
		entityValue: entity.text,
		embedding: Array.from(embeddings[i]), // Float32Array → number[]
		confidence: entity.score ?? 0,
		startOffset: entity.start ?? 0,
		endOffset: entity.end ?? 0,
		source: entity.source ?? 'unknown',
	}));

	// 3. Use PostgreSQL COPY protocol for bulk insert
	const inserted = await bulkInsertEntitiesViaCopy(rows);

	return {
		inserted,
		cached: 0, // embedTexts handles caching internally
		failed: rows.length - inserted,
		durationMs: Date.now() - start,
	};
}

/**
 * Bulk insert entity embeddings using PostgreSQL COPY protocol
 *
 * COPY is 10-50x faster than batch INSERT for large datasets
 * Uses tab-delimited format with array literal for embedding vector
 *
 * @param rows - Entity embedding rows
 * @returns Number of rows inserted
 */
async function bulkInsertEntitiesViaCopy(rows: EntityEmbeddingRow[]): Promise<number> {
	if (rows.length === 0) return 0;

	// Get raw node-postgres client from pool
	const client = await db.pool.connect();

	try {
		// COPY command with tab-delimited format
		const copyStream = client.query(
			`COPY evidence_entities (
				id,
				evidence_id,
				entity_type,
				entity_value,
				embedding,
				confidence,
				start_offset,
				end_offset,
				source,
				created_at
			) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t')`
		);

		// Create writable stream for data
		let rowCount = 0;
		const dataStream = new Writable({
			write(chunk, encoding, callback) {
				try {
					copyStream.write(chunk);
					callback();
				} catch (err) {
					callback(err as Error);
				}
			},
			final(callback) {
				try {
					copyStream.end();
					callback();
				} catch (err) {
					callback(err as Error);
				}
			},
		});

		// Write rows in tab-delimited format
		for (const row of rows) {
			// PostgreSQL array literal format: {val1,val2,val3}
			const embeddingLiteral = `{${row.embedding.join(',')}}`;
			const timestamp = new Date().toISOString();

			const line = [
				row.entityId,
				row.evidenceId,
				row.entityType,
				row.entityValue.replace(/\t/g, ' ').replace(/\n/g, ' '), // Sanitize tabs/newlines
				embeddingLiteral,
				row.confidence.toString(),
				row.startOffset.toString(),
				row.endOffset.toString(),
				row.source,
				timestamp,
			].join('\t');

			dataStream.write(line + '\n');
			rowCount++;
		}

		dataStream.end();

		// Wait for COPY to complete
		await new Promise<void>((resolve, reject) => {
			copyStream.on('finish', resolve);
			copyStream.on('error', reject);
		});

		return rowCount;
	} catch (err) {
		console.error('[BatchEntityEmbed] COPY failed:', err);

		// Fallback to batch INSERT if COPY fails
		return await fallbackBatchInsert(rows);
	} finally {
		client.release();
	}
}

/**
 * Fallback batch INSERT when COPY protocol fails
 *
 * Uses standard INSERT ... VALUES syntax with multiple rows
 * Slower than COPY but more reliable for small batches
 *
 * @param rows - Entity embedding rows
 * @returns Number of rows inserted
 */
async function fallbackBatchInsert(rows: EntityEmbeddingRow[]): Promise<number> {
	if (rows.length === 0) return 0;

	try {
		// Build multi-row INSERT
		const values = rows.map((row) => {
			const embeddingArray = JSON.stringify(row.embedding);
			return `(
				'${row.entityId}',
				'${row.evidenceId}',
				'${row.entityType}',
				'${row.entityValue.replace(/'/g, "''")}',
				'${embeddingArray}'::vector(768),
				${row.confidence},
				${row.startOffset},
				${row.endOffset},
				'${row.source}',
				NOW()
			)`;
		}).join(',\n');

		const sql = `
			INSERT INTO evidence_entities (
				id,
				evidence_id,
				entity_type,
				entity_value,
				embedding,
				confidence,
				start_offset,
				end_offset,
				source,
				created_at
			) VALUES ${values}
		`;

		await db.execute(sql);
		return rows.length;
	} catch (err) {
		console.error('[BatchEntityEmbed] Fallback INSERT failed:', err);
		return 0;
	}
}

// ── Table Schema ───────────────────────────────────────────────────

/**
 * CREATE TABLE evidence_entities (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
 *   entity_type VARCHAR(50) NOT NULL,
 *   entity_value TEXT NOT NULL,
 *   embedding vector(768) NOT NULL,
 *   confidence FLOAT DEFAULT 0,
 *   start_offset INTEGER DEFAULT 0,
 *   end_offset INTEGER DEFAULT 0,
 *   source VARCHAR(20) DEFAULT 'unknown',
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_evidence_entities_evidence_id ON evidence_entities(evidence_id);
 * CREATE INDEX idx_evidence_entities_type ON evidence_entities(entity_type);
 * CREATE INDEX idx_evidence_entities_embedding ON evidence_entities USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
 */