/**
 * GPU Missing-Import Recommendations
 *
 * Algorithm:
 *  1. Scroll Qdrant codebase_chunks_768 → collect content vectors per file
 *  2. Average per-file embeddings → one 768-dim centroid per source file
 *  3. batchCosineSimilarity (GPU/CPU) per file vs all others → top-K similar files
 *  4. Query Neo4j for existing IMPORTS edges → exclude already-wired pairs
 *  5. Write graph-reco:file:<id> docs to CouchDB `graph_recommendations` db
 *
 * Returns a summary of files processed and recommendations written.
 */
import { ENV } from '$lib/server/env.server.js';
import { batchCosineSimilarity } from '$lib/server/gpu/libtorch-bridge.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { couchdb } from '$lib/services/couchdb-client.js';

const QDRANT_URL = ENV.QDRANT_URL;
const COLLECTION = 'codebase_chunks_768';
const COUCH_DB = 'graph_recommendations';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecommendedImport {
	targetFileId: string;
	targetFilePath: string;
	similarity: number;
	reason: string;
}

export interface FileRecommendationDoc {
	_id: string;
	type: 'graph-reco';
	fileId: string;
	filePath: string;
	cluster: string;
	recommendedImports: RecommendedImport[];
	generatedAt: string;
	gpuSource: 'gpu' | 'cpu';
}

export interface RecommendationResult {
	filesProcessed: number;
	pairsEvaluated: number;
	recommendationsWritten: number;
	skippedAlreadyWired: number;
	errors: string[];
	gpuSource: 'gpu' | 'cpu';
	durationMs: number;
}

// ── Qdrant scroll — collect vectors per file ──────────────────────────────────

interface QdrantPoint {
  id: number | string;
  payload?: {
    relativePath?: string;
    path?: string;
    filePath?: string;
    file_path?: string;
    cluster?: string;
  };
  vector?:
    | {
        content?: number[];
        signature?: number[];
      }
    | number[];
}

interface FileEmbeddingEntry {
  fileId: string;
  filePath: string;
  cluster: string;
  vectors: number[][];
}

async function scrollFileEmbeddings(limit = 10000): Promise<Map<string, FileEmbeddingEntry>> {
  const fileMap = new Map<string, FileEmbeddingEntry>();
  let offset: string | number | null = null;

  do {
    const body: Record<string, unknown> = {
      limit: 250,
      with_vector: ['content'],
      with_payload: true,
    };
    if (offset !== null) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qdrant scroll failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      result?: {
        points?: QdrantPoint[];
        next_page_offset?: string | number | null;
      };
    };

    const points = data.result?.points ?? [];
    offset = data.result?.next_page_offset ?? null;

    for (const pt of points) {
      // Extract file path from payload
      const payload = pt.payload ?? {};
      const rawPath =
        payload.relativePath ?? payload.filePath ?? payload.file_path ?? payload.path ?? '';
      if (!rawPath) continue;

      // Normalise to a stable file ID (strip leading src/)
      const filePath = rawPath.startsWith('src/') ? rawPath : `src/${rawPath}`;
      const fileId = filePath.replace(/[^a-zA-Z0-9/_.-]/g, '_');

      // Extract content vector
      const vectorObj = pt.vector as Record<string, number[]> | undefined;
      const vec = vectorObj?.content;
      if (!Array.isArray(vec) || vec.length === 0) continue;

      if (!fileMap.has(fileId)) {
        fileMap.set(fileId, {
          fileId,
          filePath,
          cluster: payload.cluster ?? 'unknown',
          vectors: [],
        });
      }
      fileMap.get(fileId)!.vectors.push(vec);
    }

    if (fileMap.size >= limit || offset === null) break;
  } while (offset !== null && fileMap.size < limit);

  return fileMap;
}

// ── Mean-pool vectors for each file ──────────────────────────────────────────

function meanPoolVectors(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];
	const dim = vectors[0].length;
	const mean = new Array<number>(dim).fill(0);
	for (const v of vectors) {
		for (let d = 0; d < dim; d++) mean[d] += v[d];
	}
	const n = vectors.length;
	const norm = Math.sqrt(mean.reduce((s, x) => s + x * x / n / n, 0)) || 1e-12;
	// L2-normalize the mean
	return mean.map(x => x / n / norm);
}

// ── Neo4j: fetch existing IMPORTS edge set ────────────────────────────────────

async function fetchExistingEdges(): Promise<Set<string>> {
	const edgeSet = new Set<string>();
	const driver = getNeo4jDriver();
	const session = driver.session({ database: 'neo4j' });

	try {
		const result = await session.run(
			`MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)
			 RETURN a.id AS src, b.id AS tgt`
		);
		for (const rec of result.records) {
			const src = rec.get('src') as string;
			const tgt = rec.get('tgt') as string;
			if (src && tgt) edgeSet.add(`${src}→${tgt}`);
		}
	} catch {
		// Neo4j unavailable — proceed without structural filter (all pairs are candidates)
	} finally {
		await session.close();
	}

	return edgeSet;
}

// ── Main entrypoint ───────────────────────────────────────────────────────────

export interface RecommendationOptions {
	/** Similarity threshold — pairs above this are candidates (default 0.75) */
	threshold?: number;
	/** Top-K recommendations written per file (default 5) */
	topK?: number;
	/** Max files to process (default 1000) */
	maxFiles?: number;
}

export async function generateMissingImportRecommendations(
	opts: RecommendationOptions = {}
): Promise<RecommendationResult> {
	const start = Date.now();
	const threshold = opts.threshold ?? 0.75;
	const topK = opts.topK ?? 5;
	const maxFiles = opts.maxFiles ?? 1000;

	const result: RecommendationResult = {
		filesProcessed: 0,
		pairsEvaluated: 0,
		recommendationsWritten: 0,
		skippedAlreadyWired: 0,
		errors: [],
		gpuSource: 'cpu',
		durationMs: 0,
	};

	try {
		// 1 — Ensure CouchDB database exists
		await couchdb.createDb(COUCH_DB).catch(() => {});

		// 2 — Scroll Qdrant for embeddings
		let fileMap: Map<string, FileEmbeddingEntry>;
		try {
			fileMap = await scrollFileEmbeddings(maxFiles);
		} catch (err) {
			result.errors.push(`Qdrant scroll failed: ${err instanceof Error ? err.message : String(err)}`);
			result.durationMs = Date.now() - start;
			return result;
		}

		const files = [...fileMap.values()];
		if (files.length === 0) {
			result.errors.push('No files found in codebase_chunks_768 collection');
			result.durationMs = Date.now() - start;
			return result;
		}

		// 3 — Mean-pool each file's chunks to one centroid vector
		const fileIds = files.map(f => f.fileId);
		const filePaths = files.map(f => f.filePath);
		const centroids = files.map(f => meanPoolVectors(f.vectors));
		const clusters = files.map(f => f.cluster);

		const validIdx = centroids.map((v, i) => (v.length > 0 ? i : -1)).filter(i => i >= 0);
		if (validIdx.length === 0) {
			result.errors.push('All file centroids are empty');
			result.durationMs = Date.now() - start;
			return result;
		}

		const validFileIds = validIdx.map(i => fileIds[i]);
		const validPaths = validIdx.map(i => filePaths[i]);
		const validClusters = validIdx.map(i => clusters[i]);
		const validCentroids = validIdx.map(i => centroids[i]);

		// 4 — Fetch existing Neo4j IMPORTS edges
		const existingEdges = await fetchExistingEdges();

		// 5 — For each file: score vs corpus, filter below threshold + existing edges
		const n = validCentroids.length;
		const recommendations = new Map<string, RecommendedImport[]>();

		for (let qi = 0; qi < n; qi++) {
			const queryVec = validCentroids[qi];
			const queryId = validFileIds[qi];

			const simResult = await batchCosineSimilarity(queryVec, validCentroids);
			result.gpuSource = simResult.source; // last one wins (all same GPU/CPU)

			result.pairsEvaluated += n - 1;

			// Collect top-K candidates above threshold with no existing edge
			const scored: { idx: number; score: number }[] = [];
			for (let ti = 0; ti < n; ti++) {
				if (ti === qi) continue; // skip self
				const score = simResult.scores[ti];
				if (score < threshold) continue;
				const edgeKey = `${queryId}→${validFileIds[ti]}`;
				if (existingEdges.has(edgeKey)) {
					result.skippedAlreadyWired++;
					continue;
				}
				scored.push({ idx: ti, score });
			}

			if (scored.length === 0) continue;

			// Sort descending, take top-K
			scored.sort((a, b) => b.score - a.score);
			const topRecs: RecommendedImport[] = scored.slice(0, topK).map(({ idx, score }) => ({
				targetFileId: validFileIds[idx],
				targetFilePath: validPaths[idx],
				similarity: Math.round(score * 1000) / 1000,
				reason: `semantic similarity ${(score * 100).toFixed(1)}% — no IMPORTS edge in graph`,
			}));

			recommendations.set(queryId, topRecs);
		}

		// 7 — Write to CouchDB
		for (const [fileId, recs] of recommendations) {
			const idx = validFileIds.indexOf(fileId);
			const doc: FileRecommendationDoc = {
				_id: `graph-reco:file:${fileId}`,
				type: 'graph-reco',
				fileId,
				filePath: validPaths[idx] ?? fileId,
				cluster: validClusters[idx] ?? 'unknown',
				recommendedImports: recs,
				generatedAt: new Date().toISOString(),
				gpuSource: result.gpuSource,
			};

			// Fetch existing rev to allow overwrite
			try {
				const existing = await couchdb.get(COUCH_DB, doc._id).catch(() => null);
				if (existing && existing._rev) {
					(doc as unknown as Record<string, unknown>)._rev = existing._rev;
				}
				await couchdb.put(COUCH_DB, doc._id, doc as unknown as Record<string, unknown>);
				result.recommendationsWritten++;
			} catch (err) {
				result.errors.push(`CouchDB write for ${fileId}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		result.filesProcessed = n;
	} catch (err) {
		result.errors.push(err instanceof Error ? err.message : String(err));
	}

	result.durationMs = Date.now() - start;
	return result;
}
