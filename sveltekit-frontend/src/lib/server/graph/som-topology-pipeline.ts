/**
 * SOM Topology Pipeline
 *
 * Algorithm:
 *  1. Scroll Qdrant `codebase_chunks_768` → deduplicate by file_path (keep first chunk per file)
 *  2. trainSOM(flatVectors, n, 768, gridW, gridH, iters, ...) — GPU Kohonen SOM
 *  3. Bulk-update each Qdrant point's payload: set `som_cluster` = BMU neuron index
 *  4. Create `SIMILAR_TOPOLOGY` edges in Neo4j between `CodebaseFile` nodes whose
 *     BMU neurons are within Manhattan distance ≤ 1 on the SOM grid (grid adjacency)
 *
 * Grid sizing rule: gridW = gridH = ceil(sqrt(sqrt(n) * 5))
 */

import { trainSOM } from '$lib/server/gpu/pytorch-graph.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { ENV } from '$lib/server/env.server.js';
import { pool } from '$lib/server/db/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SOMTopologyResult {
	filesProcessed: number;
	gridSize: string;
	neuronsUsed: number;
	edgesCreated: number;
	durationMs: number;
	source: 'gpu' | 'cpu';
}

interface FileEmbedding {
	pointId: number | string;
	filePath: string;
	vector: number[];
}

// ── Qdrant helpers ─────────────────────────────────────────────────────────────

const COLLECTION = 'codebase_chunks_768';
const DIM = 768;

async function scrollEmbeddings(maxFiles: number): Promise<FileEmbedding[]> {
	const qdrantUrl = ENV.QDRANT_URL;
	const seen = new Map<string, FileEmbedding>(); // file_path → first entry
	let offset: string | number | null = null;

	do {
		const body: Record<string, unknown> = {
			limit: 250,
			with_vector: true,
			with_payload: true,
		};
		if (offset !== null) body.offset = offset;

		let res: Response;
		try {
			res = await fetch(`${qdrantUrl}/collections/${COLLECTION}/points/scroll`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(30_000),
			});
		} catch (err) {
			console.error('[som-topology] Qdrant scroll network error:', err);
			throw new Error(`[som-topology] Qdrant scroll network error: ${(err as Error).message}`);
		}

		if (!res.ok) {
			const errorText = await res.text().catch(() => 'Unknown error');
			console.error(`[som-topology] Qdrant scroll ${res.status}: ${errorText}`);
			throw new Error(`[som-topology] Qdrant scroll failed: ${res.status} ${errorText}`);
		}

		const data = (await res.json()) as {
			result?: {
				points?: Array<{
					id: number | string;
					payload?: {
						file_path?: string;
						chunk_index?: number;
						content?: string;
						language?: string;
						tags?: string[];
					};
					vector?: number[] | Record<string, number[]>;
				}>;
				next_page_offset?: string | number | null;
			};
		};

		const points = data.result?.points ?? [];
		offset = data.result?.next_page_offset ?? null;

		for (const pt of points) {
			const filePath = pt.payload?.relativePath ?? pt.payload?.file_path ?? pt.payload?.path ?? '';
			if (!filePath) continue;

			// Resolve vector — may be bare array or named-vector map
			let vec: number[] | undefined;
			if (Array.isArray(pt.vector)) {
				vec = pt.vector;
			} else if (pt.vector && typeof pt.vector === 'object') {
				vec = (pt.vector as Record<string, number[]>)['content'] ??
					Object.values(pt.vector as Record<string, number[]>)[0];
			}
			if (!vec || vec.length !== DIM) continue;

			// Deduplicate: keep first chunk per file_path
			if (!seen.has(filePath)) {
				seen.set(filePath, { pointId: pt.id, filePath, vector: vec });
			}

			if (seen.size >= maxFiles) break;
		}

		if (seen.size >= maxFiles) break;
	} while (offset !== null);

	return [...seen.values()];
}

// ── Qdrant payload bulk-update ─────────────────────────────────────────────────

async function updateQdrantSomClusters(
	files: FileEmbedding[],
	bmuAssignments: Int32Array,
	opts: { gridW: number }
): Promise<void> {
	const qdrantUrl = ENV.QDRANT_URL;
	const BATCH = 100;

	for (let i = 0; i < files.length; i += BATCH) {
		const batch = files.slice(i, i + BATCH);
		const payloadGroups = new Map<
      string,
      { ids: Array<number | string>; payload: Record<string, number> }
    >();

		for (let j = 0; j < batch.length; j++) {
      const f = batch[j];
      const bmuIdx = bmuAssignments[i + j];
      const gridW = opts?.gridW ?? 10;
      const payload = {
        som_cluster: bmuIdx,
        som_bmu_row: Math.floor(bmuIdx / gridW),
        som_bmu_col: bmuIdx % gridW,
      };
      const key = `${payload.som_cluster}:${payload.som_bmu_row}:${payload.som_bmu_col}`;
      const existing = payloadGroups.get(key);
      if (existing) {
        existing.ids.push(f.pointId);
      } else {
        payloadGroups.set(key, { ids: [f.pointId], payload });
      }
    }

		try {
			await Promise.all(
        [...payloadGroups.values()].map(async ({ ids, payload }) => {
          const res = await fetch(`${qdrantUrl}/collections/${COLLECTION}/points/payload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: ids, payload }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) {
            console.warn(`[som-topology] Qdrant payload update batch ${i} failed: ${res.status}`);
          }
        })
      );
		} catch (err) {
			console.warn(`[som-topology] Qdrant payload update batch ${i} error:`, err);
		}
	}

	const indexDefs = [
    { field_name: 'som_bmu_row', field_schema: { type: 'integer', lookup: true, range: true } },
    { field_name: 'som_bmu_col', field_schema: { type: 'integer', lookup: true, range: true } },
  ];

	for (const def of indexDefs) {
    fetch(`${qdrantUrl}/collections/${COLLECTION}/index`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(def),
    }).catch(() => {});
  }
}

// ── Neo4j edge creation ────────────────────────────────────────────────────────

/**
 * For each pair of files whose BMU neurons are within Manhattan distance ≤ 1
 * on the SOM grid, MERGE a SIMILAR_TOPOLOGY edge in Neo4j.
 *
 * Strategy:
 *  - Group files by BMU index
 *  - For each neuron, enumerate itself + up to 4 cardinal neighbours (±1 row/col)
 *  - Connect every file in source neuron to every file in target neuron (within-group included)
 */
async function createNeo4jTopologyEdges(
	files: FileEmbedding[],
	bmuAssignments: Int32Array,
	gridW: number,
	gridH: number
): Promise<number> {
	// Build neuron → file list map
	const neuronMap = new Map<number, string[]>(); // bmuIdx → [file_path, ...]
	for (let i = 0; i < files.length; i++) {
		const bmu = bmuAssignments[i];
		const fp = files[i].filePath;
		if (!neuronMap.has(bmu)) neuronMap.set(bmu, []);
		neuronMap.get(bmu)!.push(fp);
	}

	// Collect edges: [pathA, pathB] pairs (A < B lexicographically to avoid duplicates)
	const edgeSet = new Set<string>();
	const edgePairs: Array<{ a: string; b: string }> = [];

	for (const [bmuIdx, filePaths] of neuronMap) {
		const bmuRow = Math.floor(bmuIdx / gridW);
		const bmuCol = bmuIdx % gridW;

		// Neighbour neurons: self + 4 cardinal directions (Manhattan ≤ 1)
		const neighbourNeurons: number[] = [bmuIdx];
		const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
		for (const [dr, dc] of offsets) {
			const r = bmuRow + dr;
			const c = bmuCol + dc;
			if (r >= 0 && r < gridH && c >= 0 && c < gridW) {
				neighbourNeurons.push(r * gridW + c);
			}
		}

		for (const neighbourIdx of neighbourNeurons) {
			const neighbourPaths = neuronMap.get(neighbourIdx);
			if (!neighbourPaths) continue;

			const sourceGroup = filePaths;
			const targetGroup = neighbourIdx === bmuIdx ? filePaths : neighbourPaths;

			for (const a of sourceGroup) {
				for (const b of targetGroup) {
					if (a === b) continue;
					const key = a < b ? `${a}|||${b}` : `${b}|||${a}`;
					if (!edgeSet.has(key)) {
						edgeSet.add(key);
						edgePairs.push({ a: a < b ? a : b, b: a < b ? b : a });
					}
				}
			}
		}
	}

	if (edgePairs.length === 0) return 0;

	// Write to Neo4j in batches via MERGE (idempotent)
	const driver = getNeo4jDriver();
	const session = driver.session({ database: 'neo4j' });
	let edgesCreated = 0;
	const BATCH = 200;

	try {
		for (let i = 0; i < edgePairs.length; i += BATCH) {
			const batch = edgePairs.slice(i, i + BATCH);
			try {
				const result = await session.run(
					`UNWIND $pairs AS pair
					 MATCH (a:CodebaseFile) WHERE a.filePath = pair.a OR a.file_path = pair.a
					 MATCH (b:CodebaseFile) WHERE b.filePath = pair.b OR b.file_path = pair.b
					 MERGE (a)-[r:SIMILAR_TOPOLOGY]-(b)
					 ON CREATE SET r.createdAt = datetime()
					 SET r.updatedAt = datetime()
					 RETURN count(r) AS cnt`,
					{ pairs: batch }
				);
				edgesCreated += (result.records[0]?.get('cnt') as number) ?? 0;
			} catch (err) {
				console.warn(`[som-topology] Neo4j edge batch ${i} error:`, err);
			}
		}
	} finally {
		await session.close();
	}

	return edgesCreated;
}

// ── Postgres mirror: write som_cluster assignments to codebase_chunk_index ──────

/**
 * Batch-updates codebase_chunk_index.som_cluster using the qdrant_id → BMU mapping.
 * This keeps the Postgres mirror in sync with the Qdrant payload so that
 * cluster-summary.ts and fix-recommender.ts read accurate cluster IDs.
 */
async function updatePostgresSomClusters(
	files: FileEmbedding[],
	bmuAssignments: Int32Array,
	opts: { gridW: number }
): Promise<void> {
	const BATCH = 200;
	for (let i = 0; i < files.length; i += BATCH) {
		const batch = files.slice(i, i + BATCH);
		const valuesSql = batch
			.map((_, idx) => `($${idx * 4 + 1}::text, $${idx * 4 + 2}::int, $${idx * 4 + 3}::int, $${idx * 4 + 4}::int)`)
			.join(', ');
		const params = batch.flatMap((f, j) => {
			const bmuIdx = bmuAssignments[i + j];
			const gridW = opts?.gridW ?? 10;
			return [
				String(f.pointId),
				bmuIdx,
				Math.floor(bmuIdx / gridW),
				bmuIdx % gridW
			];
		});

		await pool.query(
			`UPDATE codebase_chunk_index c
			    SET som_cluster = v.som_cluster,
			        som_bmu_row = v.som_bmu_row,
			        som_bmu_col = v.som_bmu_col,
			        updated_at = NOW()
			   FROM (VALUES ${valuesSql}) AS v(qdrant_id, som_cluster, som_bmu_row, som_bmu_col)
			  WHERE c.qdrant_id = v.qdrant_id`,
			params
		).catch(err => console.warn('[som-topology] Postgres mirror batch failed:', err));
	}
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function runSOMTopologyPipeline(opts?: {
	maxFiles?: number;
	gridW?: number;
	gridH?: number;
	iters?: number;
}): Promise<SOMTopologyResult> {
  const t0 = Date.now();
  const maxFiles = Math.min(opts?.maxFiles ?? 2000, 5000);
  const iters = opts?.iters ?? 1000;

  // 1. Fetch embeddings from Qdrant, deduplicated by file_path
  const files = await scrollEmbeddings(maxFiles);
  const n = files.length;

  if (n === 0) {
    return {
      filesProcessed: 0,
      gridSize: '0x0',
      neuronsUsed: 0,
      edgesCreated: 0,
      durationMs: Date.now() - t0,
      source: 'cpu',
    };
  }

  // 2. Compute grid dimensions using standard SOM sizing rule
  const gridW = opts?.gridW ?? Math.ceil(Math.sqrt(Math.sqrt(n) * 5));
  const gridH = opts?.gridH ?? Math.ceil(Math.sqrt(Math.sqrt(n) * 5));
  const radInit = Math.max(gridW, gridH) / 2;

  // 3. Build flat Float32Array [n × 768]
  const flatVectors = new Float32Array(n * DIM);
  for (let i = 0; i < n; i++) {
    const vec = files[i].vector;
    for (let d = 0; d < DIM; d++) flatVectors[i * DIM + d] = vec[d];
  }

  // 4. Train SOM
  const { bmu, source } = trainSOM(
    flatVectors,
    n,
    DIM,
    gridW,
    gridH,
    iters,
    0.1, // lrInit
    0.01, // lrFinal
    radInit,
    1.0 // radFinal
  );

  // 5. Bulk-update Qdrant payloads with som_cluster + coordinates
  await updateQdrantSomClusters(files, bmu, { gridW }).catch((err) => {
    console.warn('[som-topology] Qdrant payload update failed (non-fatal):', err);
  });

  // 5b. Mirror som_cluster + coordinates back to Postgres codebase_chunk_index
  await updatePostgresSomClusters(files, bmu, { gridW }).catch((err) => {
    console.warn('[som-topology] Postgres som_cluster mirror failed (non-fatal):', err);
  });

  // 6. Create SIMILAR_TOPOLOGY edges in Neo4j
  const edgesCreated = await createNeo4jTopologyEdges(files, bmu, gridW, gridH).catch((err) => {
    console.warn('[som-topology] Neo4j edge creation failed (non-fatal):', err);
    return 0;
  });

  // 7. Compute stats
  const neuronsUsed = new Set(Array.from(bmu)).size;

  // 7b. Fire-and-forget: generate cluster summaries for each distinct SOM cluster
  const distinctClusters = Array.from(new Set(Array.from(bmu)));
  if (distinctClusters.length > 0) {
    import('$lib/server/indexer/cluster-summary.js')
      .then(({ generateClusterSummary }) => {
        for (const clusterId of distinctClusters) {
          generateClusterSummary(clusterId, false).catch(() => {});
        }
      })
      .catch(() => {});
  }

  return {
    filesProcessed: n,
    gridSize: `${gridW}x${gridH}`,
    neuronsUsed,
    edgesCreated,
    durationMs: Date.now() - t0,
    source,
  };
}