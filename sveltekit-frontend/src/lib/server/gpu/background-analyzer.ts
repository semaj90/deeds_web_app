/**
 * GPU Background Evidence Analyzer
 *
 * Runs GPU-accelerated analysis on evidence embeddings AFTER upload completes:
 * A. graphSimilarity() → find related evidence within same case
 * B. clusterEmbeddings() → auto-group evidence into topic clusters
 * C. computeCaseEmbedding() → update aggregate case fingerprint vector
 *
 * Triggered by evidence upload pipeline (non-blocking, post-Stage 8).
 * Uses LibTorch N-API addon (CUDA) with CPU fallback.
 */

import { graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable } from './libtorch-bridge.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';

export interface GpuAnalysisResult {
	evidenceId: string;
	caseId: string;
	source: 'gpu' | 'cpu';
	similarEvidence: Array<{ id: string; score: number }>;
	clusterAssignment: number;
	clusterCount: number;
	caseEmbeddingUpdated: boolean;
	latencyMs: number;
}

/**
 * Run GPU-accelerated analysis on a single evidence item within its case context.
 * Non-fatal — logs warnings and returns partial results on error.
 */
export async function analyzeEvidenceGpu(
	evidenceId: string,
	caseId: string
): Promise<GpuAnalysisResult | null> {
	const start = performance.now();

	try {
		// 1. Fetch all evidence embeddings for this case from Qdrant
		const casePoints = await qdrant.client.scroll(qdrant.collections.evidence, {
			filter: { must: [{ key: 'case_id', match: { value: caseId } }] },
			with_vector: true,
			limit: 200,
		});

		const points = casePoints?.points ?? [];
		if (points.length < 2) {
			console.log(`[GPU Analyzer] Case ${caseId}: only ${points.length} evidence point(s), skipping GPU analysis`);
			return null;
		}

		// Extract embeddings and IDs
		const embeddings: number[][] = [];
		const pointIds: string[] = [];
		for (const pt of points) {
			const vec = (pt.vector as { content?: number[] })?.content ?? (pt.vector as number[]);
			if (Array.isArray(vec) && vec.length === 768) {
				embeddings.push(vec);
				pointIds.push(String(pt.id));
			}
		}

		if (embeddings.length < 2) {
			console.log(`[GPU Analyzer] Case ${caseId}: insufficient valid embeddings (${embeddings.length})`);
			return null;
		}

		const cudaStatus = isCudaAvailable() ? 'GPU' : 'CPU';
		console.log(`[GPU Analyzer] Case ${caseId}: analyzing ${embeddings.length} evidence embeddings (${cudaStatus})`);

		// A. Graph similarity — find related evidence
		const simResult = await graphSimilarity(embeddings);
		const currentIdx = pointIds.indexOf(evidenceId);
		const similarEvidence: Array<{ id: string; score: number }> = [];

		if (currentIdx >= 0 && simResult.matrix) {
			const row = simResult.matrix[currentIdx];
			for (let j = 0; j < row.length; j++) {
				if (j !== currentIdx && row[j] > 0.5) {
					similarEvidence.push({ id: pointIds[j], score: row[j] });
				}
			}
			similarEvidence.sort((a, b) => b.score - a.score);
		}

		// B. Cluster embeddings — auto-group into topic clusters
		const k = Math.min(Math.max(2, Math.floor(embeddings.length / 3)), 10);
		const clusterResult = await clusterEmbeddings(embeddings, k);
		const clusterAssignment = currentIdx >= 0 ? clusterResult.assignments[currentIdx] : -1;

		// C. Compute aggregate case embedding (equal weights)
		const weights = new Array(embeddings.length).fill(1.0 / embeddings.length);
		const caseEmbResult = await computeCaseEmbedding(weights, embeddings);

		// Store results in evidence.metadata.gpuAnalysis JSONB
		const gpuAnalysis = {
			similarEvidence: similarEvidence.slice(0, 10),
			clusterAssignment,
			clusterCount: k,
			totalEvidenceInCase: embeddings.length,
			source: simResult.source,
			analyzedAt: new Date().toISOString(),
		};

		try {
			await db.execute(sql`
				UPDATE evidence SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
					gpuAnalysis,
				})}::jsonb
				WHERE id = ${evidenceId}
			`);
		} catch (err) {
			console.warn('[GPU Analyzer] Metadata update failed (non-fatal):', err);
		}

		// Store case-level aggregate embedding in Qdrant (upsert)
		if (caseEmbResult.embedding.length === 768) {
			try {
				await qdrant.client.upsert(qdrant.collections.cases, {
					wait: false,
					points: [{
						id: caseId,
						vector: { content: caseEmbResult.embedding },
						payload: {
							case_id: caseId,
							type: 'case_aggregate',
							evidence_count: embeddings.length,
							source: caseEmbResult.source,
							updated_at: new Date().toISOString(),
						},
					}],
				});
			} catch (err) {
				console.warn('[GPU Analyzer] Case embedding upsert failed (non-fatal):', err);
			}
		}

		const latencyMs = Math.round(performance.now() - start);
		console.log(`[GPU Analyzer] Case ${caseId}: ${similarEvidence.length} similar, cluster=${clusterAssignment}/${k}, ${latencyMs}ms (${simResult.source})`);

		// Audit log — GPU analysis completed
		import('$lib/server/audit/evidence-audit.js').then(({ logEvidenceAction }) => {
			logEvidenceAction(evidenceId, 'gpu_analyzed', {
				changes: { source: simResult.source, similarCount: similarEvidence.length, clusterAssignment, clusterCount: k, latencyMs },
			});
		}).catch(() => { /* audit is non-critical */ });

		return {
			evidenceId,
			caseId,
			source: simResult.source,
			similarEvidence: similarEvidence.slice(0, 10),
			clusterAssignment,
			clusterCount: k,
			caseEmbeddingUpdated: caseEmbResult.embedding.length === 768,
			latencyMs,
		};
	} catch (err) {
		console.error(`[GPU Analyzer] Failed for evidence ${evidenceId}:`, err);
		return null;
	}
}

/**
 * Trigger GPU analysis for an evidence item (fire-and-forget).
 * Call this after evidence upload Stage 8 completes.
 */
export function triggerEvidenceGpuAnalysis(evidenceId: string, caseId: string): void {
	if (!caseId) return;

	// Fire-and-forget — don't await, don't block upload response
	analyzeEvidenceGpu(evidenceId, caseId).catch(err => {
		console.warn(`[GPU Analyzer] Background analysis failed for ${evidenceId}:`, err);
	});
}
