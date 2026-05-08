#!/usr/bin/env npx tsx
/**
 * run-hypergraph.ts — Standalone 4D hypergraph builder.
 *
 * Gradient-checkpoint pattern: processes embeddings in BATCH_SIZE chunks,
 * caching SOM/k-means assignments to Redis after each batch so an OOM
 * restart picks up where it left off.
 *
 * Sources (in priority order):
 *   1. Qdrant codebase_chunks_768 — one vector per unique file
 *   2. Postgres research_summaries — supplementary semantic nodes
 *
 * Output:
 *   - Redis hg:edge:idx ZSET (edgeHash → gradeScore)
 *   - Redis hg:edge:{hash} JSON blobs (4h TTL)
 *   - Redis hg:4d:{id} JSON blobs (1h TTL, 4D coords per node)
 *   - Redis hg:built_at timestamp
 *   - Postgres hypergraph_edges upsert (non-fatal)
 *
 * Usage:
 *   npx tsx scripts/run-hypergraph.ts [--force] [--max-nodes=N] [--k=N]
 */

import pg from 'pg';
import Redis from 'ioredis';
import neo4j, { type Driver } from 'neo4j-driver';

// ── Config ────────────────────────────────────────────────────────────────────

const QDRANT_URL   = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const PG_URL       = process.env.DATABASE_URL       ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL          ?? 'redis://127.0.0.1:6379';
const REDIS_PASS   = process.env.REDIS_PASSWORD     ?? 'redis';
const OLLAMA_URL   = process.env.OLLAMA_BASE_URL    ?? 'http://127.0.0.1:11434';
const NEO4J_URI    = process.env.NEO4J_URI          ?? 'bolt://localhost:7687';
const NEO4J_USER   = process.env.NEO4J_USER         ?? 'neo4j';
const NEO4J_PASS   = process.env.NEO4J_PASSWORD     ?? 'neo4j123';

const FORCE        = process.argv.includes('--force');
const MAX_NODES    = parseInt(process.argv.find(a => a.startsWith('--max-nodes='))?.split('=')[1] ?? '2000');
const K_CLUSTERS   = parseInt(process.argv.find(a => a.startsWith('--k='))?.split('=')[1] ?? '20');
const BATCH_SIZE        = 200; // gradient checkpoint batch — process this many at a time
const SUMMARIZE_BATCH   = 3;   // concurrent Ollama summarization calls
const DIM               = 768;
const HG_EDGE_TTL       = 4 * 3600;
const HG_COORD_TTL      = 1 * 3600;
// Grade thresholds computed dynamically from score percentiles in buildHyperedges()
// These are placeholders overridden at runtime.
let GRADE_A = 0.75;
let GRADE_B = 0.55;
let GRADE_C = 0.35;

// ── Redis (ioredis — matches the project's redis.ts singleton) ────────────────

const redis = new Redis(REDIS_URL, { password: REDIS_PASS, lazyConnect: true });
redis.on('error', () => {});

// ── Postgres ─────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: PG_URL });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Node {
  id:       string;
  filePath: string;
  vec:      number[];
  pagerank: number;
  somX?:    number;
  somY?:    number;
  pipeline: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < Math.min(s.length, 512); i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) | 0) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < DIM; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function l2norm(v: number[]): number[] {
  let sq = 0;
  for (const x of v) sq += x * x;
  const inv = sq > 0 ? 1 / Math.sqrt(sq) : 1;
  return v.map(x => x * inv);
}

// ── Qdrant scroll ─────────────────────────────────────────────────────────────

async function scrollQdrant(maxNodes: number): Promise<Node[]> {
  console.log(`[hg] Scrolling Qdrant codebase_chunks_768 (max ${maxNodes} files)...`);
  const seen = new Map<string, Node>();
  let offset: string | number | null = null;

  do {
    const body: Record<string, unknown> = { limit: 250, with_vector: true, with_payload: true };
    if (offset !== null) body.offset = offset;

    let res: Response;
    try {
      res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      console.warn('[hg] Qdrant scroll error:', (err as Error).message);
      break;
    }

    if (!res.ok) {
      console.warn(`[hg] Qdrant scroll ${res.status}`);
      break;
    }

    const data = (await res.json()) as {
      result?: {
        points?: Array<{
          id: number | string;
          payload?: Record<string, unknown>;
          vector?: number[] | Record<string, number[]>;
        }>;
        next_page_offset?: string | number | null;
      };
    };

    const points = data.result?.points ?? [];
    offset = data.result?.next_page_offset ?? null;

    for (const pt of points) {
      const p = pt.payload ?? {};
      const filePath = ((p['relativePath'] ?? p['file_path'] ?? p['path']) as string | undefined) ?? '';
      if (!filePath || seen.has(filePath)) continue;

      let vec: number[] | undefined;
      if (Array.isArray(pt.vector)) {
        vec = pt.vector as number[];
      } else if (pt.vector && typeof pt.vector === 'object') {
        const vmap = pt.vector as Record<string, number[]>;
        vec = vmap['content'] ?? Object.values(vmap)[0];
      }
      if (!vec || vec.length !== DIM) continue;

      seen.set(filePath, {
        id:       String(pt.id),
        filePath,
        vec:      l2norm(vec),
        pagerank: 0, // sentinel: 0 = unscored; real scores hydrated from Redis below
        somX:     typeof p['som_bmu_col'] === 'number' ? (p['som_bmu_col'] as number) : undefined,
        somY:     typeof p['som_bmu_row'] === 'number' ? (p['som_bmu_row'] as number) : undefined,
        pipeline: 'codebase',
      });

      if (seen.size >= maxNodes) break;
    }

    if (seen.size >= maxNodes) break;
    process.stdout.write(`\r[hg] Scrolled ${seen.size} files...`);
  } while (offset !== null);

  console.log(`\r[hg] Scrolled ${seen.size} files from Qdrant.`);
  return [...seen.values()];
}

// ── PageRank hydration from Redis ─────────────────────────────────────────────

async function hydratePagerankScores(nodes: Node[]): Promise<void> {
  try {
    // Stored as JSON string by run-pagerank.ts: { [filePath]: score }
    const raw = await redis.get('couchdb:pagerank_scores');
    if (!raw) return;
    const scores = JSON.parse(raw) as Record<string, number>;
    let hits = 0;
    for (const node of nodes) {
      // Keys are relative paths like "lib/server/db/schema-postgres.ts"
      // Node filePaths from Qdrant may be "src/lib/..." or "lib/..." — try both
      const score = scores[node.filePath]
        ?? scores[node.filePath.replace(/^src\//, '')]
        ?? scores['src/' + node.filePath];
      if (score !== undefined) {
        node.pagerank = score;
        hits++;
      }
    }
    console.log(`[hg] PageRank: hydrated ${hits}/${nodes.length} nodes from Redis.`);
  } catch {
    // Redis unavailable — keep 0.5 defaults
  }
}

// ── CPU k-means (gradient-checkpoint, BATCH_SIZE centroids at a time) ─────────

interface KMeansResult {
  labels:    number[];   // N → cluster id
  centroids: number[][]; // K × DIM
}

async function cpuKmeans(nodes: Node[], k: number): Promise<KMeansResult> {
  const n = nodes.length;
  const vecs = nodes.map(n => n.vec);

  // Check Redis checkpoint
  const ckptKey = `hg:checkpoint:kmeans:k${k}:n${n}`;
  if (!FORCE) {
    try {
      const ckpt = await redis.get(ckptKey);
      if (ckpt) {
        console.log('[hg] k-means: using Redis checkpoint');
        return JSON.parse(ckpt) as KMeansResult;
      }
    } catch { /* noop */ }
  }

  console.log(`[hg] k-means: ${n} nodes → ${k} clusters (CPU, batch=${BATCH_SIZE})...`);

  // Try GPU first via pytorch-graph N-API
  try {
    // scripts/ → sveltekit-frontend/ → deeds-web-app/ → simd-bridge/
    const addonPath = new URL(
      '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node',
      import.meta.url
    ).pathname.replace(/^\/([A-Z]:)/i, '$1').replace(/\//g, '\\');
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const addon = req(addonPath) as {
      kmeansWithCentroids: (flat: Float32Array, n: number, dim: number, k: number, iters: number) => {
        assignments: Int32Array;
        centroids: Float32Array;
      };
    };
    const flat = new Float32Array(n * DIM);
    for (let i = 0; i < n; i++) flat.set(vecs[i], i * DIM);
    const { assignments, centroids: rawCentroids } = addon.kmeansWithCentroids(flat, n, DIM, k, 100);
    const centroids: number[][] = [];
    for (let c = 0; c < k; c++) {
      centroids.push(Array.from(rawCentroids.slice(c * DIM, (c + 1) * DIM)));
    }
    const result: KMeansResult = { labels: Array.from(assignments), centroids };
    await redis.setex(ckptKey, 3600, JSON.stringify(result)).catch(() => {});
    console.log('[hg] k-means: GPU done ✓');
    return result;
  } catch (err) {
    console.log('[hg] k-means: GPU unavailable, falling back to CPU:', (err as Error).message.slice(0, 80));
  }

  // CPU Lloyd's k-means — gradient-checkpoint every BATCH_SIZE iters via Redis
  let labels = new Array<number>(n).fill(0);
  const centroids: number[][] = vecs.slice(0, k).map(v => [...v]);

  for (let iter = 0; iter < 50; iter++) {
    // Assignment step — in batches to stay memory-efficient
    for (let b = 0; b < n; b += BATCH_SIZE) {
      const end = Math.min(b + BATCH_SIZE, n);
      for (let i = b; i < end; i++) {
        let best = 0, bestSim = -Infinity;
        for (let c = 0; c < k; c++) {
          const sim = cosine(vecs[i], centroids[c]);
          if (sim > bestSim) { bestSim = sim; best = c; }
        }
        labels[i] = best;
      }
    }

    // Update centroids
    const sums: number[][] = Array.from({ length: k }, () => new Array<number>(DIM).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      for (let d = 0; d < DIM; d++) sums[c][d] += vecs[i][d];
      counts[c]++;
    }
    let moved = false;
    for (let c = 0; c < k; c++) {
      const cnt = counts[c] || 1;
      const newCentroid = l2norm(sums[c].map(v => v / cnt));
      if (cosine(newCentroid, centroids[c]) < 0.9999) moved = true;
      centroids[c] = newCentroid;
    }

    process.stdout.write(`\r[hg] k-means iter ${iter + 1}/50...`);

    // Checkpoint every 10 iterations
    if ((iter + 1) % 10 === 0) {
      await redis.setex(ckptKey, 3600, JSON.stringify({ labels, centroids })).catch(() => {});
    }

    if (!moved) { console.log(`\r[hg] k-means converged at iter ${iter + 1}.`); break; }
  }
  console.log('');

  const result: KMeansResult = { labels, centroids };
  await redis.setex(ckptKey, 3600, JSON.stringify(result)).catch(() => {});
  return result;
}

// ── SOM coordinates (x, y) — use existing Qdrant som_bmu_* if available ──────

function assignSomCoords(nodes: Node[], labels: number[], k: number): void {
  // If majority of codebase nodes already have SOM coords from som-topology-pipeline,
  // use those. Otherwise assign based on k-means cluster layout.
  const withSom = nodes.filter(n => n.somX !== undefined).length;
  if (withSom > nodes.length * 0.5) {
    console.log(`[hg] SOM: using pre-computed coords (${withSom}/${nodes.length} have som_bmu_*)`);
    // Fill missing with cluster-based grid
    const gridW = Math.ceil(Math.sqrt(k));
    for (const node of nodes) {
      if (node.somX === undefined) {
        const c = labels[nodes.indexOf(node)];
        node.somX = c % gridW;
        node.somY = Math.floor(c / gridW);
      }
    }
    return;
  }

  // Fallback: use k-means cluster index as (x, y) on a sqrt(k) × sqrt(k) grid
  const gridW = Math.ceil(Math.sqrt(k));
  for (let i = 0; i < nodes.length; i++) {
    const c = labels[i];
    nodes[i].somX = c % gridW;
    nodes[i].somY = Math.floor(c / gridW);
  }
  console.log('[hg] SOM: assigned from k-means cluster grid.');
}

// ── Hyperedge summaries via Ollama (batched) ──────────────────────────────────

async function summarizeEdge(memberPaths: string[], _centroid: number[], clusterId: number): Promise<string> {
  // Check cache first
  const hash = fnv1a(memberPaths.sort().join(','));
  try {
    const cached = await redis.get(`hg:sum:${hash}`);
    if (cached) return cached;
  } catch { /* noop */ }

  const paths = memberPaths.slice(0, 8).join('\n');
  const prompt = `Summarize the architectural role of these ${memberPaths.length} related source files in one sentence:\n${paths}`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma4-legal-vlm:latest', prompt, stream: false, cache_prompt: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { response?: string };
      const summary = (data.response ?? '').trim().slice(0, 300);
      await redis.setex(`hg:sum:${hash}`, HG_EDGE_TTL, summary).catch(() => {});
      return summary;
    }
  } catch { /* noop */ }

  return `Cluster ${clusterId}: ${memberPaths.length} related source files`;
}

// ── Build hyperedges from k-means results ─────────────────────────────────────

async function buildHyperedges(
  nodes: Node[],
  kmeans: KMeansResult,
): Promise<void> {
  const { labels, centroids } = kmeans;
  const k = centroids.length;
  const n = nodes.length;
  const builtAt = new Date().toISOString();

  // Group nodes by cluster
  const clusters: Map<number, number[]> = new Map();
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(i);
  }

  // Calibrate grade thresholds from scored nodes only (exclude 0.5 sentinel defaults)
  {
    const scored = nodes.map(n => n.pagerank).filter(s => s > 0).sort((a, b) => a - b);
    if (scored.length >= 10) {
      GRADE_A = scored[Math.floor(scored.length * 0.95)]; // top 5%  — hub files only
      GRADE_B = scored[Math.floor(scored.length * 0.80)]; // top 20% — frequently imported
      GRADE_C = scored[Math.floor(scored.length * 0.50)]; // top 50% — above median
      console.log(`[hg] Grade thresholds (${scored.length} scored nodes): A≥${GRADE_A.toFixed(4)} B≥${GRADE_B.toFixed(4)} C≥${GRADE_C.toFixed(4)}`);
    } else {
      console.log('[hg] Grade thresholds: using defaults (too few scored nodes)');
    }
  }

  // Clear old index
  await redis.del('hg:edge:idx').catch(() => {});

  let gradeA = 0, gradeB = 0, gradeC = 0, gradeD = 0;

  // ── Stage A: compute grades + prepare edge metadata (CPU, no I/O) ────────────
  console.log(`[hg] Building ${k} hyperedges...`);

  type EdgeWork = {
    c: number;
    memberIdxs: number[];
    memberNodes: Node[];
    memberIds: string[];
    memberPaths: string[];
    centroid: number[];
    gradeScore: number;
    gradeLabel: string;
    hash: string;
  };

  const work: EdgeWork[] = [];
  for (let c = 0; c < k; c++) {
    const memberIdxs = clusters.get(c) ?? [];
    if (memberIdxs.length === 0) continue;
    const memberNodes = memberIdxs.map(i => nodes[i]);
    const memberIds   = memberNodes.map(n => n.id);
    const memberPaths = memberNodes.map(n => n.filePath);
    const centroid    = centroids[c];
    // Grade by max PageRank member — a cluster is only as good as its highest-ranked hub file.
    // Using max (not mean) avoids diluting hub-containing clusters with unscored leaf nodes.
    const maxPagerank = Math.max(...memberNodes.map(n => n.pagerank));
    const gradeScore  = maxPagerank;
    const gradeLabel  = gradeScore >= GRADE_A ? 'A' : gradeScore >= GRADE_B ? 'B' : gradeScore >= GRADE_C ? 'C' : 'D';
    work.push({ c, memberIdxs, memberNodes, memberIds, memberPaths, centroid, gradeScore, gradeLabel, hash: fnv1a(memberIds.sort().join(',')) });
  }

  // ── Stage B: Ollama summarization — SUMMARIZE_BATCH concurrent, not all at once
  const summaries = new Map<number, string>();
  for (let i = 0; i < work.length; i += SUMMARIZE_BATCH) {
    const batch = work.slice(i, i + SUMMARIZE_BATCH);
    const results = await Promise.allSettled(
      batch.map(w => summarizeEdge(w.memberPaths, w.centroid, w.c))
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      summaries.set(batch[j].c, r.status === 'fulfilled' ? r.value : `Cluster ${batch[j].c}: ${batch[j].memberIds.length} files`);
    }
    process.stdout.write(`\r[hg] Summarized ${Math.min(i + SUMMARIZE_BATCH, work.length)}/${work.length}...`);
  }
  console.log('');

  // ── Stage C: Redis writes — fast I/O, all in parallel per batch of 100 ────────
  for (let i = 0; i < work.length; i += 100) {
    const batch = work.slice(i, i + 100);
    await Promise.allSettled(batch.map(async w => {
      const summary = summaries.get(w.c) ?? '';
      const gradeLabel = w.gradeLabel;
      if (gradeLabel === 'A') gradeA++;
      else if (gradeLabel === 'B') gradeB++;
      else if (gradeLabel === 'C') gradeC++;
      else gradeD++;

      const edge = {
        hash:        w.hash,
        type:        'RESEARCH_CLUSTER',
        memberIds:   w.memberIds,
        centroid:    w.centroid,
        gradeScore:  Math.round(w.gradeScore * 1000) / 1000,
        gradeLabel,
        summary,
        pipeline:    'codebase',
        memberCount: w.memberIds.length,
        builtAt,
      };

      await redis.setex(`hg:edge:${w.hash}`, HG_EDGE_TTL, JSON.stringify(edge)).catch(() => {});
      await redis.zadd('hg:edge:idx', w.gradeScore, w.hash).catch(() => {});

      // 4D coords for member nodes — batch within the edge
      await Promise.allSettled(w.memberIdxs.map(async idx => {
        const node = nodes[idx];
        const z = 1 - cosine(node.vec, w.centroid);
        const coord = { x: node.somX ?? 0, y: node.somY ?? 0, z, w: node.pagerank, type: 'codebase' };
        await redis.setex(`hg:4d:${node.id}`, HG_COORD_TTL, JSON.stringify(coord)).catch(() => {});
      }));
    }));
  }

  // Set build timestamp + TTL on index
  await redis.setex('hg:built_at', HG_EDGE_TTL, builtAt).catch(() => {});
  await redis.expire('hg:edge:idx', HG_EDGE_TTL).catch(() => {});

  console.log(`\n[hg] Done: A=${gradeA} B=${gradeB} C=${gradeC} D=${gradeD}`);
}

// ── Neo4j sync — File / Cluster / SomCell nodes ───────────────────────────────

interface EdgeBlob {
  hash: string;
  memberIds: string[];
  centroid: number[];
  gradeScore: number;
  gradeLabel: string;
  summary: string;
  memberCount: number;
  builtAt: string;
}

async function syncToNeo4j(nodes: Node[], kmeans: KMeansResult): Promise<void> {
  let driver: Driver | null = null;
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    await driver.verifyConnectivity();
    const session = driver.session({ database: 'neo4j' });

    const k = kmeans.centroids.length;
    const gridW = Math.ceil(Math.sqrt(k));

    // Read edge blobs from Redis to get hashes + member lists
    const hashes = await redis.zrange('hg:edge:idx', 0, -1);
    const edgeBlobs: EdgeBlob[] = (
      await Promise.all(hashes.map(h => redis.get(`hg:edge:${h}`)))
    )
      .filter(Boolean)
      .map(s => JSON.parse(s!) as EdgeBlob);

    console.log(`[hg→neo4j] Syncing ${nodes.length} File nodes + ${edgeBlobs.length} Cluster nodes...`);

    // Upsert File + SomCell nodes in batches of 200
    const FILE_BATCH = 200;
    for (let i = 0; i < nodes.length; i += FILE_BATCH) {
      const batch = nodes.slice(i, i + FILE_BATCH).map((n, bi) => {
        const idx = i + bi;
        const c = kmeans.labels[idx];
        return {
          id:      n.id,
          path:    n.filePath,
          x:       n.somX ?? (c % gridW),
          y:       n.somY ?? Math.floor(c / gridW),
          z:       0,
          w:       n.pagerank,
          cluster: c,
        };
      });
      await session.run(
        `UNWIND $batch AS r
         MERGE (f:File { id: r.id })
           SET f.filePath = r.path, f.som_x = r.x, f.som_y = r.y,
               f.semantic_z = r.z, f.reward_w = r.w, f.gpuCluster = r.cluster,
               f.nodeType = 'codebase'
         WITH f, r
         MERGE (sc:SomCell { col: r.x, row: r.y })
         MERGE (f)-[:IN_SOM_CELL]->(sc)`,
        { batch }
      );
    }

    // Upsert Cluster nodes + IN_CLUSTER edges
    for (const edge of edgeBlobs) {
      await session.run(
        `MERGE (cl:Cluster { hash: $hash })
           SET cl.gradeScore = $grade, cl.gradeLabel = $label,
               cl.summary = $summary, cl.memberCount = $count, cl.builtAt = $builtAt
         WITH cl
         UNWIND $memberIds AS mid
           MATCH (f:File { id: mid })
           MERGE (f)-[:IN_CLUSTER]->(cl)`,
        {
          hash:      edge.hash,
          grade:     edge.gradeScore,
          label:     edge.gradeLabel,
          summary:   edge.summary,
          count:     edge.memberCount,
          builtAt:   edge.builtAt,
          memberIds: edge.memberIds,
        }
      );
    }

    // Cross-cluster adjacency via shared SomCells
    await session.run(
      `MATCH (fa:File)-[:IN_CLUSTER]->(a:Cluster),
             (fb:File)-[:IN_CLUSTER]->(b:Cluster),
             (fa)-[:IN_SOM_CELL]->(sc:SomCell)<-[:IN_SOM_CELL]-(fb)
       WHERE a.hash <> b.hash
       WITH a, b, count(sc) AS sharedCells WHERE sharedCells > 0
       MERGE (a)-[r:ADJACENT_CLUSTER]->(b)
         SET r.sharedCells = sharedCells`
    );

    await session.close();
    console.log(`[hg→neo4j] Done — File/Cluster/SomCell nodes written.`);
  } catch (err) {
    console.warn('[hg→neo4j] Non-fatal:', (err as Error).message.slice(0, 120));
  } finally {
    await driver?.close();
  }
}

// ── Qdrant cluster payload update ─────────────────────────────────────────────

async function updateQdrantPayloads(nodes: Node[], kmeans: KMeansResult): Promise<void> {
  const BATCH = 250;
  const gridW = Math.ceil(Math.sqrt(kmeans.centroids.length));
  let updated = 0;
  try {
    for (let i = 0; i < nodes.length; i += BATCH) {
      const slice = nodes.slice(i, i + BATCH);
      // Group by cluster so each batch call sets one payload for multiple points
      const byCluster = new Map<number, { ids: (string | number)[]; somX: number; somY: number }>();
      slice.forEach((node, bi) => {
        const c = kmeans.labels[i + bi];
        const sx = node.somX ?? (c % gridW);
        const sy = node.somY ?? Math.floor(c / gridW);
        if (!byCluster.has(c)) byCluster.set(c, { ids: [], somX: sx, somY: sy });
        const numId = parseInt(node.id, 10);
        byCluster.get(c)!.ids.push(isNaN(numId) ? node.id : numId);
      });

      await Promise.allSettled([...byCluster.entries()].map(async ([c, { ids, somX, somY }]) => {
        const somCluster = somY * 44 + somX;
        const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/payload`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            payload: { gpu_cluster: c, som_cluster: somCluster, som_bmu_col: somX, som_bmu_row: somY },
            points:  ids,
          }),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (res?.ok) updated += ids.length;
      }));
    }
    console.log(`[hg→qdrant] Updated ${updated}/${nodes.length} cluster payloads.`);
  } catch (err) {
    console.warn('[hg→qdrant] Non-fatal:', (err as Error).message.slice(0, 80));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[hg] Connecting to Redis...');
  await redis.ping(); // ioredis auto-connects; ping verifies
  console.log('[hg] Redis connected.');

  // Check if already built and not forcing
  if (!FORCE) {
    const builtAt = await redis.get('hg:built_at').catch(() => null);
    const edgeCount = await redis.zcard('hg:edge:idx').catch(() => 0);
    if (builtAt && edgeCount > 0) {
      console.log(`[hg] Already built at ${builtAt} (${edgeCount} edges). Use --force to rebuild.`);
      redis.disconnect();
      await pool.end();
      return;
    }
  }

  const t0 = Date.now();

  // 1. Scroll Qdrant for codebase embeddings
  const nodes = await scrollQdrant(MAX_NODES);
  if (nodes.length < 10) {
    console.error(`[hg] Only ${nodes.length} nodes — need ≥10. Run codebase indexer first.`);
    process.exit(1);
  }

  // 2. Hydrate PageRank scores
  await hydratePagerankScores(nodes);

  // 3. k-means (GPU → CPU fallback, checkpointed)
  const k = Math.min(K_CLUSTERS, Math.floor(nodes.length / 5));
  const kmeans = await cpuKmeans(nodes, k);

  // 4. Assign SOM x/y coordinates
  assignSomCoords(nodes, kmeans.labels, k);

  // 5. Build + store hyperedges (Redis)
  await buildHyperedges(nodes, kmeans);

  // 6. Sync to Neo4j — File / Cluster / SomCell nodes (non-fatal)
  await syncToNeo4j(nodes, kmeans);

  // 7. Update Qdrant cluster payloads — gpu_cluster + som_cluster (non-fatal)
  await updateQdrantPayloads(nodes, kmeans);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const edgeCount = await redis.zcard('hg:edge:idx').catch(() => 0);
  console.log(`[hg] Build complete in ${elapsed}s — ${nodes.length} nodes, ${edgeCount} edges.`);

  redis.disconnect();
  await pool.end();
}

main().catch(err => {
  console.error('[hg] Fatal:', err);
  process.exit(1);
});
