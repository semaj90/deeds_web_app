/**
 * ACE Retrieval Logger
 * 
 * Persists high-fidelity retrieval traces to the `ace_retrieval_runs` 
 * and `ace_retrieval_hits` tables in Postgres.
 */

import { pool } from '$lib/server/db/client';
import { type RankedChunk } from './codebase-context';
import { createHash } from 'node:crypto';

export interface AceRunLog {
	query: string;
	intent?: string;
	mode?: string;
	model?: string;
	query_embedding_model?: string;
	expanded_terms?: string[];
	context_budget_tokens?: number;
	final_context_tokens?: number;
	metadata?: Record<string, any>;
}

export async function logAceRun(run: AceRunLog, hits: RankedChunk[]): Promise<void> {
	try {
		// 1. Create run header
		const runRes = await pool.query(
			`INSERT INTO ace_retrieval_runs 
			 (query, intent, mode, model, query_embedding_model, expanded_terms, context_budget_tokens, final_context_tokens, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id`,
			[
				run.query,
				run.intent,
				run.mode,
				run.model,
				run.query_embedding_model,
				run.expanded_terms || [],
				run.context_budget_tokens,
				run.final_context_tokens,
				run.metadata || {}
			]
		);

		const runId = runRes.rows[0].id;

		// 2. Insert hits in batch
		if (hits.length > 0) {
			const values: any[] = [];
			const placeholders: string[] = [];
			
			hits.forEach((h, i) => {
				const offset = i * 11;
				placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`);
				values.push(
					runId,
					`${h.relativePath}:${h.lineStart}`, // stable_key
					h.qdrantId,
					h.relativePath,
					'qdrant', // source
					h.score, // final_score
					i + 1, // rank
					h.authorityScore, // using graph_score slot for wiki authority
					h.pageRankScore,
					JSON.stringify({
						symbol: h.symbol,
						kind: h.kind,
						gpuCluster: h.gpuCluster,
						signals: h.signals // Assumes we add signals to RankedChunk
					}),
					new Date()
				);
			});

			await pool.query(
				`INSERT INTO ace_retrieval_hits 
				 (run_id, stable_key, chunk_id, file_path, source, final_score, rank, graph_score, recency_score, metadata, created_at)
				 VALUES ${placeholders.join(', ')}`,
				values
			);
		}

		// 3. Persist to GRPO Memory Sticks (Reinforcement signal)
		const queryHash = createHash('sha256').update(run.query).digest('hex');
		const contextHash = createHash('sha256').update(JSON.stringify(run.metadata || {})).digest('hex');
		const selectedIds = hits.slice(0, 5).map(h => h.qdrantId);
		const rejectedIds = hits.slice(10, 20).map(h => h.qdrantId);

		await pool.query(
			`INSERT INTO grpo_memory_sticks 
			 (id, query_hash, context_packet_hash, selected_ids, rejected_ids, reward_signals, scores, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
			 ON CONFLICT (id) DO UPDATE SET 
			   selected_ids = EXCLUDED.selected_ids,
			   rejected_ids = EXCLUDED.rejected_ids,
			   scores = EXCLUDED.scores`,
			[
				`grpo:${queryHash}:${contextHash.slice(0, 8)}`,
				queryHash,
				contextHash,
				JSON.stringify(selectedIds),
				JSON.stringify(rejectedIds),
				JSON.stringify({ status: 'pending' }),
				JSON.stringify({ initial_rrf: hits[0]?.score || 0 })
			]
		);
	} catch (err) {
		console.error('[ace-retrieval-logger] Failed to log run:', err);
	}
}
