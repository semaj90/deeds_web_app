import { pgRows } from '$lib/server/db/client';
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
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { cacheGpuAnalysis, type CachedGpuAnalysis } from '$lib/server/cache/cartridge-tensor-bridge.js';

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
      console.log(
        `[GPU Analyzer] Case ${caseId}: only ${points.length} evidence point(s), skipping GPU analysis`
      );
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
      console.log(
        `[GPU Analyzer] Case ${caseId}: insufficient valid embeddings (${embeddings.length})`
      );
      return null;
    }

    const cudaStatus = isCudaAvailable() ? 'GPU' : 'CPU';
    console.log(
      `[GPU Analyzer] Case ${caseId}: analyzing ${embeddings.length} evidence embeddings (${cudaStatus})`
    );

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
        await qdrant.upsert({
          collection: qdrant.collections.cases,
          wait: false,
          points: [
            {
              id: caseId,
              vector: { content: caseEmbResult.embedding },
              payload: {
                case_id: caseId,
                type: 'case_aggregate',
                evidence_count: embeddings.length,
                source: caseEmbResult.source,
                updated_at: new Date().toISOString(),
              },
            },
          ],
        } as any);
      } catch (err) {
        console.warn('[GPU Analyzer] Case embedding upsert failed (non-fatal):', err);
      }
    }

    const latencyMs = Math.round(performance.now() - start);
    console.log(
      `[GPU Analyzer] Case ${caseId}: ${similarEvidence.length} similar, cluster=${clusterAssignment}/${k}, ${latencyMs}ms (${simResult.source})`
    );

    // Audit log — GPU analysis completed
    import('$lib/server/features/evidence/audit/evidence-audit.js')
      .then(({ logEvidenceAction }) => {
        logEvidenceAction(evidenceId, 'gpu_analyzed', {
          changes: {
            source: simResult.source,
            similarCount: similarEvidence.length,
            clusterAssignment,
            clusterCount: k,
            latencyMs,
          },
        });
      })
      .catch(() => {
        /* audit is non-critical */
      });

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

// ─── Batch Accumulator ────────────────────────────────────────────────
// Groups evidence uploads by caseId over a debounce window so that
// N uploads for the same case trigger ONE Qdrant scroll + GPU analysis
// instead of N redundant passes.

const batchAccumulator = new Map<string, Set<string>>(); // caseId → Set<evidenceId>
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DEBOUNCE_MS = 150;

function drainBatch(): void {
  batchTimer = null;
  const snapshot = new Map(batchAccumulator);
  batchAccumulator.clear();

  for (const [caseId, evidenceIds] of snapshot) {
    analyzeEvidenceBatchGpu(caseId, [...evidenceIds]).catch((err) => {
      console.warn(`[GPU Batch] Case ${caseId} batch analysis failed:`, err);
    });
  }
}

/**
 * Batched GPU analysis — one Qdrant scroll + GPU pass for all queued evidence in a case.
 * Replaces per-evidence analyzeEvidenceGpu for bulk uploads.
 */
async function analyzeEvidenceBatchGpu(caseId: string, evidenceIds: string[]): Promise<void> {
  const start = performance.now();

  try {
    // 1. Fetch all evidence embeddings for this case (once, shared across batch)
    const casePoints = await qdrant.client.scroll(qdrant.collections.evidence, {
      filter: { must: [{ key: 'case_id', match: { value: caseId } }] },
      with_vector: true,
      limit: 200,
    });

    const points = casePoints?.points ?? [];
    if (points.length < 2) return;

    const embeddings: number[][] = [];
    const pointIds: string[] = [];
    for (const pt of points) {
      const vec = (pt.vector as { content?: number[] })?.content ?? (pt.vector as number[]);
      if (Array.isArray(vec) && vec.length === 768) {
        embeddings.push(vec);
        pointIds.push(String(pt.id));
      }
    }
    if (embeddings.length < 2) return;

    const cudaStatus = isCudaAvailable() ? 'GPU' : 'CPU';
    console.log(
      `[GPU Batch] Case ${caseId}: ${evidenceIds.length} items batched, ${embeddings.length} embeddings (${cudaStatus})`
    );

    // 2. ONE GPU pass: similarity + clustering + case embedding
    const simResult = await graphSimilarity(embeddings);
    const k = Math.min(Math.max(2, Math.floor(embeddings.length / 3)), 10);
    const clusterResult = await clusterEmbeddings(embeddings, k);
    const weights = new Array(embeddings.length).fill(1.0 / embeddings.length);
    const caseEmbResult = await computeCaseEmbedding(weights, embeddings);

    // 3. Distribute results to each queued evidence item
    for (const evidenceId of evidenceIds) {
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

      const clusterAssignment = currentIdx >= 0 ? clusterResult.assignments[currentIdx] : -1;
      const gpuAnalysis = {
        similarEvidence: similarEvidence.slice(0, 10),
        clusterAssignment,
        clusterCount: k,
        totalEvidenceInCase: embeddings.length,
        source: simResult.source,
        analyzedAt: new Date().toISOString(),
        batchSize: evidenceIds.length,
      };

      try {
        await db.execute(sql`
					UPDATE evidence SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            gpuAnalysis,
          })}::jsonb
					WHERE id = ${evidenceId}
				`);
      } catch {}
    }

    // 4. Update case aggregate embedding (once per batch)
    if (caseEmbResult.embedding.length === 768) {
      try {
        await qdrant.upsert({
          collection: qdrant.collections.cases,
          wait: false,
          points: [
            {
              id: caseId,
              vector: { content: caseEmbResult.embedding },
              payload: {
                case_id: caseId,
                type: 'case_aggregate',
                evidence_count: embeddings.length,
                source: caseEmbResult.source,
                updated_at: new Date().toISOString(),
              },
            },
          ],
        } as any);
      } catch {}
    }

    // 5. Cache GPU results for reuse by later queries/uploads (P2e)
    cacheGpuAnalysis(caseId, {
      clusterAssignments: clusterResult.assignments,
      centroids: clusterResult.centroids,
      clusterK: k,
      caseEmbedding: caseEmbResult.embedding,
      pointIds,
      source: simResult.source,
      cachedAt: new Date().toISOString(),
      embeddingCount: embeddings.length,
    } satisfies CachedGpuAnalysis).catch(() => {});

    const latencyMs = Math.round(performance.now() - start);
    console.log(
      `[GPU Batch] Case ${caseId}: ${evidenceIds.length} items processed in ${latencyMs}ms (${simResult.source})`
    );
  } catch (err) {
    console.error(`[GPU Batch] Failed for case ${caseId}:`, err);
  }
}

/**
 * Trigger GPU analysis for an evidence item (fire-and-forget, batched).
 * Call this after evidence upload Stage 8 completes.
 * Items for the same case within 150ms are batched into a single GPU pass.
 */
export function triggerEvidenceGpuAnalysis(evidenceId: string, caseId: string): void {
	if (!caseId) return;

	if (!batchAccumulator.has(caseId)) {
		batchAccumulator.set(caseId, new Set());
	}
	batchAccumulator.get(caseId)!.add(evidenceId);

	// Reset debounce timer — waits for upload burst to finish
	if (batchTimer) clearTimeout(batchTimer);
	batchTimer = setTimeout(drainBatch, BATCH_DEBOUNCE_MS);
}

// ─── POI Photo GPU Analysis ──────────────────────────────────────────────

export interface PoiGpuAnalysisResult {
	photoId: string;
	poiId: string;
	source: 'gpu' | 'cpu';
	similarPhotos: Array<{ id: string; score: number; poiId?: string }>;
	clusterAssignment: number;
	clusterCount: number;
	crossPoiMatches: Array<{ poiId: string; photoId: string; score: number }>;
	latencyMs: number;
}

/**
 * Run GPU-accelerated analysis on a POI photo within the poi_profiles collection.
 *
 * A. graphSimilarity() → find visually similar photos across ALL POIs
 * B. clusterEmbeddings() → group POI photos by visual context
 * C. Cross-POI matching → identify same-person candidates across different POIs
 */
export async function analyzePoiPhotoGpu(
	photoId: string,
	poiId: string
): Promise<PoiGpuAnalysisResult | null> {
	const start = performance.now();

	try {
		// 1. Fetch all POI photo embeddings from Qdrant poi_profiles
		const poiPoints = await qdrant.client.scroll('poi_profiles', {
			with_vector: true,
			limit: 500,
		});

		const points = poiPoints?.points ?? [];
		if (points.length < 2) {
			console.log(`[GPU Analyzer/POI] Only ${points.length} POI photo(s) in poi_profiles, skipping`);
			return null;
		}

		// Extract embeddings and metadata
		const embeddings: number[][] = [];
		const pointMeta: Array<{ id: string; poiId: string; photoId: string }> = [];

		for (const pt of points) {
			// Handle both named and unnamed vector formats
			let vec: number[] | undefined;
			if (Array.isArray(pt.vector)) {
				vec = pt.vector as number[];
			} else if (pt.vector && typeof pt.vector === 'object') {
				const namedVec = pt.vector as Record<string, unknown>;
				const embVec = namedVec.embedding ?? namedVec.default ?? namedVec.content;
				if (Array.isArray(embVec)) vec = embVec as number[];
			}

			if (vec && vec.length === 768) {
				embeddings.push(vec);
				const payload = pt.payload ?? {};
				pointMeta.push({
					id: String(pt.id),
					poiId: (payload.poi_id as string) ?? '',
					photoId: (payload.photo_id as string) ?? '',
				});
			}
		}

		if (embeddings.length < 2) {
			console.log(`[GPU Analyzer/POI] Insufficient valid embeddings (${embeddings.length})`);
			return null;
		}

		const cudaStatus = isCudaAvailable() ? 'GPU' : 'CPU';
		console.log(`[GPU Analyzer/POI] Analyzing ${embeddings.length} POI photos (${cudaStatus})`);

		// A. Graph similarity — find similar photos across all POIs
		const simResult = await graphSimilarity(embeddings);
		const currentIdx = pointMeta.findIndex(m => m.photoId === photoId || m.id === photoId);
		const similarPhotos: Array<{ id: string; score: number; poiId?: string }> = [];
		const crossPoiMatches: Array<{ poiId: string; photoId: string; score: number }> = [];

		if (currentIdx >= 0 && simResult.matrix) {
			const row = simResult.matrix[currentIdx];
			for (let j = 0; j < row.length; j++) {
				if (j !== currentIdx && row[j] > 0.5) {
					const meta = pointMeta[j];
					similarPhotos.push({ id: meta.photoId, score: row[j], poiId: meta.poiId });

					// Cross-POI: different POI with high similarity
					if (meta.poiId && meta.poiId !== poiId && row[j] > 0.65) {
						crossPoiMatches.push({
							poiId: meta.poiId,
							photoId: meta.photoId,
							score: row[j],
						});
					}
				}
			}
			similarPhotos.sort((a, b) => b.score - a.score);
			crossPoiMatches.sort((a, b) => b.score - a.score);
		}

		// B. Cluster embeddings — group by visual context
		const k = Math.min(Math.max(2, Math.floor(embeddings.length / 4)), 8);
		const clusterResult = await clusterEmbeddings(embeddings, k);
		const clusterAssignment = currentIdx >= 0 ? clusterResult.assignments[currentIdx] : -1;

		// Store GPU analysis results in poi_photos metadata
		try {
			await db.execute(sql`
				UPDATE poi_photos SET forensic_data = COALESCE(forensic_data, '{}'::jsonb) || ${JSON.stringify({
					gpuAnalysis: {
						similarPhotos: similarPhotos.slice(0, 10),
						crossPoiMatches: crossPoiMatches.slice(0, 5),
						clusterAssignment,
						clusterCount: k,
						totalPhotosAnalyzed: embeddings.length,
						source: simResult.source,
						analyzedAt: new Date().toISOString(),
					},
				})}::jsonb
				WHERE id = ${photoId}
			`);
		} catch (err) {
			console.warn('[GPU Analyzer/POI] Metadata update failed (non-fatal):', err);
		}

		const latencyMs = Math.round(performance.now() - start);
		console.log(
			`[GPU Analyzer/POI] POI ${poiId}: ${similarPhotos.length} similar, ${crossPoiMatches.length} cross-POI, cluster=${clusterAssignment}/${k}, ${latencyMs}ms (${simResult.source})`
		);

		return {
			photoId,
			poiId,
			source: simResult.source,
			similarPhotos: similarPhotos.slice(0, 10),
			clusterAssignment,
			clusterCount: k,
			crossPoiMatches: crossPoiMatches.slice(0, 5),
			latencyMs,
		};
	} catch (err) {
		console.error(`[GPU Analyzer/POI] Failed for photo ${photoId}:`, err);
		return null;
	}
}

// ─── GPU Cache Warm-up ────────────────────────────────────────────────
// On app boot, pre-populate the CHR97 GPU cache for recently active cases
// so that the first dashboard load or chat query avoids a cold GPU pass.

/**
 * Warm up GPU result cache for the N most recently updated cases that have evidence.
 * Non-fatal — intended to be called from hooks.server.ts at boot time.
 */
export async function warmupGpuCache(maxCases = 5): Promise<{ warmed: number; skipped: number; errors: number }> {
	const { getCachedGpuAnalysis } = await import('$lib/server/cache/cartridge-tensor-bridge.js');
	let warmed = 0, skipped = 0, errors = 0;

	try {
		// Find recently active cases that have at least 2 evidence items
		const result = await db.execute(sql`
			SELECT case_id, COUNT(*) AS cnt
			FROM evidence
			WHERE case_id IS NOT NULL
			GROUP BY case_id
			HAVING COUNT(*) >= 2
			ORDER BY MAX(COALESCE(updated_at, uploaded_at)) DESC
			LIMIT ${maxCases}
		`);

		const rows = pgRows(result) ?? [];
		if (rows.length === 0) return { warmed: 0, skipped: 0, errors: 0 };

		for (const row of rows) {
			const caseId = row.case_id as string;
			try {
				// Skip if already cached
				const existing = await getCachedGpuAnalysis(caseId);
				if (existing) {
					skipped++;
					continue;
				}
				// Run a full batch analysis (same as upload-triggered path)
				await analyzeEvidenceBatchGpu(caseId, []);
				warmed++;
			} catch {
				errors++;
			}
		}
	} catch (err) {
		console.warn('[GPU Warmup] Failed to query active cases:', err);
	}

	return { warmed, skipped, errors };
}

/**
 * Trigger GPU analysis for a POI photo (fire-and-forget).
 * Call this after POI photo VLM pipeline completes.
 */
export function triggerPoiGpuAnalysis(photoId: string, poiId: string): void {
	if (!photoId || !poiId) return;

	analyzePoiPhotoGpu(photoId, poiId).catch(err => {
		console.warn(`[GPU Analyzer/POI] Background analysis failed for ${photoId}:`, err);
	});
}
