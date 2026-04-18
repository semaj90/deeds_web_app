/**
 * GPU Codebase Cluster Detection
 *
 * Algorithm:
 *  1. Scroll Qdrant codebase_chunks_768 → mean-pool per file → centroid matrix
 *  2. clusterEmbeddings(centroids, k) — GPU k-means via libtorch CUDA
 *  3. Update Neo4j CodebaseFile nodes: SET f.gpuCluster = assignment
 *  4. Write per-cluster summary docs to CouchDB `graph_clusters`
 *
 * Cluster count k defaults to sqrt(n_files) capped at 20.
 */
import { ENV } from '$lib/server/env.server.js';
import { clusterEmbeddings } from '$lib/server/gpu/libtorch-bridge.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { couchdb } from '$lib/services/couchdb-client.js';

const QDRANT_URL = ENV.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const COUCH_DB = 'graph_clusters';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClusterMember {
	fileId: string;
	filePath: string;
	astCluster: string;
}

export interface ClusterSummaryDoc {
	_id: string;
	type: 'gpu-cluster';
	clusterId: number;
	k: number;
	memberCount: number;
	members: ClusterMember[];
	dominantAstCluster: string;
	generatedAt: string;
	gpuSource: 'gpu' | 'cpu';
}

export interface ClusterDetectionResult {
  filesProcessed: number;
  k: number;
  clusterSizes: number[];
  neo4jNodesUpdated: number;
  couchDbDocsWritten: number;
  narrativesSynthesized: number;
  errors: string[];
  gpuSource: 'gpu' | 'cpu';
  durationMs: number;
}

export interface ClusterNarrative {
  clusterId: number;
  summary: string;
  purpose: string;
  patterns: string[];
  keyFiles: string[];
  warnings: string[];
  generatedAt: string;
}

// ── Qdrant scroll ─────────────────────────────────────────────────────────────

interface FileEntry {
  fileId: string;
  filePath: string;
  astCluster: string;
  vectors: number[][];
}

async function scrollFiles(limit: number): Promise<FileEntry[]> {
  const fileMap = new Map<string, FileEntry>();
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
    if (!res.ok)
      throw new Error(`Qdrant scroll ${res.status}: ${await res.text().catch(() => '')}`);

    const data = (await res.json()) as {
      result?: {
        points?: Array<{
          id: number | string;
          payload?: {
            relativePath?: string;
            filePath?: string;
            file_path?: string;
            path?: string;
            cluster?: string;
          };
          vector?: Record<string, number[]>;
        }>;
        next_page_offset?: string | number | null;
      };
    };

    const points = data.result?.points ?? [];
    offset = data.result?.next_page_offset ?? null;

    for (const pt of points) {
      const pay = pt.payload ?? {};
      const rawPath = pay.relativePath ?? pay.filePath ?? pay.file_path ?? pay.path ?? '';
      if (!rawPath) continue;
      const filePath = rawPath.startsWith('src/') ? rawPath : `src/${rawPath}`;
      // Match the scanner's nodeId format: strip 'src/' prefix + strip .ts/.js/.mts extensions
      const scannerPath = filePath.startsWith('src/') ? filePath.slice(4) : filePath;
      const fileId = scannerPath.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_.-]/g, '_');
      const vec = pt.vector?.content;
      if (!Array.isArray(vec) || vec.length === 0) continue;
      if (!fileMap.has(fileId)) {
        fileMap.set(fileId, {
          fileId,
          filePath,
          astCluster: pay.cluster ?? 'unknown',
          vectors: [],
        });
      }
      fileMap.get(fileId)!.vectors.push(vec);
    }

    if (fileMap.size >= limit || offset === null) break;
  } while (offset !== null && fileMap.size < limit);

  return [...fileMap.values()];
}

function meanPool(vectors: number[][]): number[] {
  const dim = vectors[0]?.length ?? 0;
  if (dim === 0) return [];
  const acc = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let d = 0; d < dim; d++) acc[d] += v[d];
  const n = vectors.length;
  const norm = Math.sqrt(acc.reduce((s, x) => s + (x * x) / (n * n), 0)) || 1e-12;
  return acc.map((x) => x / n / norm);
}

// ── Neo4j update ──────────────────────────────────────────────────────────────

async function updateNeo4jClusters(
  assignments: number[],
  fileIds: string[]
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];
  const driver = getNeo4jDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    // Batch UNWIND — 100 nodes at a time
    const batchSize = 100;
    for (let i = 0; i < fileIds.length; i += batchSize) {
      const batch = fileIds.slice(i, i + batchSize).map((id, j) => ({
        id,
        gpuCluster: assignments[i + j],
      }));
      try {
        const result = await session.run(
          `UNWIND $nodes AS row
					 MATCH (f:CodebaseFile {id: row.id})
					 SET f.gpuCluster = row.gpuCluster
					 RETURN count(f) AS cnt`,
          { nodes: batch }
        );
        updated += (result.records[0]?.get('cnt') as number) ?? 0;
      } catch (err) {
        errors.push(`Neo4j batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await session.close();
  }

  return { updated, errors };
}

// ── CouchDB write ─────────────────────────────────────────────────────────────

function dominantAstCluster(members: ClusterMember[]): string {
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.astCluster, (counts.get(m.astCluster) ?? 0) + 1);
  let best = 'unknown';
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

async function writeClusters(
  k: number,
  assignments: number[],
  files: FileEntry[],
  gpuSource: 'gpu' | 'cpu'
): Promise<number> {
  await couchdb.createDb(COUCH_DB).catch(() => {});

  // Group files by cluster
  const clusterMap = new Map<number, ClusterMember[]>();
  for (let i = 0; i < assignments.length; i++) {
    const c = assignments[i];
    if (!clusterMap.has(c)) clusterMap.set(c, []);
    clusterMap.get(c)!.push({
      fileId: files[i].fileId,
      filePath: files[i].filePath,
      astCluster: files[i].astCluster,
    });
  }

  let written = 0;
  for (const [clusterId, members] of clusterMap) {
    const docId = `gpu-cluster:k${k}:${clusterId}`;
    const doc: ClusterSummaryDoc = {
      _id: docId,
      type: 'gpu-cluster',
      clusterId,
      k,
      memberCount: members.length,
      members,
      dominantAstCluster: dominantAstCluster(members),
      generatedAt: new Date().toISOString(),
      gpuSource,
    };
    try {
      const existing = await couchdb.get(COUCH_DB, docId).catch(() => null);
      if (existing?._rev) (doc as unknown as Record<string, unknown>)._rev = existing._rev;
      await couchdb.put(COUCH_DB, docId, doc as unknown as Record<string, unknown>);
      written++;
    } catch {
      // non-fatal
    }
  }
  return written;
}

// ── Main entrypoint ───────────────────────────────────────────────────────────

export interface ClusterDetectionOptions {
  /** Override cluster count k (default: auto = ceil(sqrt(n)) capped at 20) */
  k?: number;
  /** Max files to pull from Qdrant (default 1000) */
  maxFiles?: number;
}

export async function detectCodebaseClusters(
  opts: ClusterDetectionOptions = {}
): Promise<ClusterDetectionResult> {
  const start = Date.now();
  const maxFiles = opts.maxFiles ?? 1000;

  const result: ClusterDetectionResult = {
    filesProcessed: 0,
    k: 0,
    clusterSizes: [],
    neo4jNodesUpdated: 0,
    couchDbDocsWritten: 0,
    narrativesSynthesized: 0,
    errors: [],
    gpuSource: 'cpu',
    durationMs: 0,
  };

  try {
    // 1 — Scroll Qdrant
    const files = await scrollFiles(maxFiles);
    if (files.length === 0) {
      result.errors.push('No files found in codebase_chunks_768');
      result.durationMs = Date.now() - start;
      return result;
    }

    // 2 — Mean-pool centroids
    const centroids = files.map((f) => meanPool(f.vectors)).filter((v) => v.length > 0);
    const validFiles = files.filter((f) => meanPool(f.vectors).length > 0);

    if (centroids.length === 0) {
      result.errors.push('All file centroids are empty');
      result.durationMs = Date.now() - start;
      return result;
    }

    // 3 — Determine k
    const n = centroids.length;
    const k = opts.k ?? Math.min(20, Math.ceil(Math.sqrt(n)));
    result.k = k;

    // 4 — GPU k-means
    const clusterResult = await clusterEmbeddings(centroids, k);
    result.gpuSource = clusterResult.source;
    result.filesProcessed = n;

    const assignments = clusterResult.assignments;

    // Compute cluster sizes
    const sizes = new Array<number>(k).fill(0);
    for (const c of assignments) if (c >= 0 && c < k) sizes[c]++;
    result.clusterSizes = sizes;

    // 5 — Update Neo4j
    const { updated, errors: neoErrors } = await updateNeo4jClusters(
      assignments,
      validFiles.map((f) => f.fileId)
    );
    result.neo4jNodesUpdated = updated;
    result.errors.push(...neoErrors);

    // 6 — Write CouchDB summaries
    result.couchDbDocsWritten = await writeClusters(
      k,
      assignments,
      validFiles,
      clusterResult.source
    );
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  result.durationMs = Date.now() - start;
  return result;
}

/** Retrieve all cluster narratives from Redis cache. */
export async function getAllClusterNarratives(_k?: number): Promise<ClusterNarrative[]> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'cluster-summary:*', 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    if (keys.length === 0) return [];
    const values = await redis.mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map((v) => JSON.parse(v) as ClusterNarrative);
  } catch {
    return [];
  }
}
