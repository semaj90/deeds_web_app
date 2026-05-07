/**
 * Directory Summarizer — Graph Layer Integration
 *
 * Ingests deep-directory-audit output into the codebase knowledge graph:
 *   1. Match each directory to GPU cluster(s) via cluster_summaries.tags + metadata.topFiles
 *   2. Store a ClusterNote in karpathy-wiki (CouchDB + Redis) per directory
 *   3. Fire runDeepResearchIndex for low-score/unsummarized directories
 *   4. Create Neo4j HAS_DIRECTORY_SUMMARY edges from cluster nodes to directory paths
 *   5. Upsert community_reports rows so getCommunityContext() picks them up
 */

import { pool, db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { getRedis } from '$lib/server/redis.js';

const NEO4J_URL  = ENV.NEO4J_URI;
const NEO4J_USER = ENV.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = ENV.NEO4J_PASSWORD ?? 'legal_ai_pass';

// Directories scoring below this threshold get web-search enrichment
const LOW_SCORE_THRESHOLD = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DirRagSummary {
  summary?: string | null;
  summaries?: string[];
  tags?: string[];
  domains?: string[];
  chunkCount?: number;
  [key: string]: unknown;
}

export interface DirHyperedgeSummary {
  edgeCount?: number;
  topGrade?: string;
  avgReward?: string | number;
  clusters?: Array<string | number>;
  [key: string]: unknown;
}

export interface DirAuditEntry {
  rel: string;          // relative directory path, e.g. "src/lib/server/cache"
  score: number;        // 0–100 quality score from audit
  metrics: {
    fileCount?: number;
    tsErrors?: number;
    avgLines?: number;
    coverage?: number;
    [key: string]: unknown;
  };
  ragSummary: string | DirRagSummary | null;    // RAG-retrieved context blurb
  agentSummary: string | null;  // LLM-generated summary (null if inference skipped)
  hyperedge?: string | DirHyperedgeSummary | null;    // hyperedge metadata if connected
  // 4D topology coords from Qdrant codebase_chunks_768 payload (optional)
  somBmuRow?: number;
  somBmuCol?: number;
  somCluster?: number;
}

export interface IngestResult {
  directoriesProcessed: number;
  wikiNotesWritten: number;
  neo4jEdgesCreated: number;
  communityRowsUpserted: number;
  webSearchTriggered: number;
  errors: string[];
}

function normalizeSummaryText(summary: string | DirRagSummary | null | undefined): string | null {
  if (typeof summary === 'string') {
    const trimmed = summary.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!summary || typeof summary !== 'object') {
    return null;
  }

  const explicitSummary = typeof summary.summary === 'string' ? summary.summary.trim() : '';
  if (explicitSummary.length > 0) {
    return explicitSummary;
  }

  const summaries = Array.isArray(summary.summaries)
    ? summary.summaries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return summaries.length > 0 ? summaries.slice(0, 3).join(' ') : null;
}

function extractRagTags(summary: string | DirRagSummary | null | undefined): string[] {
  if (!summary || typeof summary !== 'object') {
    return [];
  }

  const tags = Array.isArray(summary.tags)
    ? summary.tags.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const domains = Array.isArray(summary.domains)
    ? summary.domains.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

  return [...new Set([...tags, ...domains])];
}

// ── Karpathy-wiki helpers (CouchDB + Redis) ───────────────────────────────────

const COUCHDB_DB  = 'karpathy_wiki';
const COUCHDB_URL = () => ENV.COUCHDB_URL;
const REDIS_TTL   = 86_400; // 24h

function parseCouchUrl(rawUrl: string): { baseUrl: string; authHeader: Record<string, string> } {
  try {
    const url = new URL(rawUrl);
    const authHeader: Record<string, string> = {};

    if (url.username) {
      authHeader.Authorization =
        'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
      url.username = '';
      url.password = '';
    }

    return { baseUrl: url.toString().replace(/\/$/, ''), authHeader };
  } catch {
    return { baseUrl: rawUrl.replace(/\/$/, ''), authHeader: {} };
  }
}

async function upsertWikiNote(id: string, doc: Record<string, unknown>): Promise<void> {
  const { baseUrl, authHeader } = parseCouchUrl(COUCHDB_URL());
  const base = `${baseUrl}/${COUCHDB_DB}/${encodeURIComponent(id)}`;
  // Fetch existing _rev so we can update
  let rev: string | undefined;
  try {
    const check = await fetch(base, { headers: { Accept: 'application/json', ...authHeader } });
    if (check.ok) {
      const existing = await check.json() as { _rev?: string };
      rev = existing._rev;
    }
  } catch { /* new doc */ }

  const body = rev ? { ...doc, _rev: rev } : doc;
  await fetch(base, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  });

  // Write to Redis read-cache
  try {
    const redis = getRedis();
    await redis.setex(`wiki:note:dir:${id}`, REDIS_TTL, JSON.stringify(doc));
  } catch { /* non-fatal */ }
}

// ── Cluster ID resolution ─────────────────────────────────────────────────────

interface ClusterSummaryRow {
  repo_id?: string;
  gpu_cluster: number;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

interface ClusterSummaryMatchRow {
  gpu_cluster: number;
  paths: string[];
}

function extractClusterPaths(row: ClusterSummaryRow): string[] {
  const tagPaths = Array.isArray(row.tags)
    ? row.tags.filter((value): value is string => typeof value === 'string' && value.includes('/'))
    : [];

  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const topFilesRaw =
    metadata && Array.isArray(metadata.topFiles)
      ? metadata.topFiles
      : metadata && Array.isArray(metadata.representativeFiles)
        ? metadata.representativeFiles
        : [];
  const topFiles = topFilesRaw.filter(
    (value): value is string => typeof value === 'string' && value.includes('/')
  );

  return [
    ...new Set([...tagPaths, ...topFiles].map((value) => value.replace(/\\/g, '/').toLowerCase())),
  ];
}

async function loadClusterSummaryRows(): Promise<ClusterSummaryMatchRow[]> {
  try {
    const rows = await pool.query<ClusterSummaryRow>(
      `SELECT repo_id, gpu_cluster, tags, metadata
       FROM cluster_summaries
       WHERE repo_id = 'default'
       LIMIT 500`
    );

    return rows.rows.map((row) => ({
      gpu_cluster: row.gpu_cluster,
      paths: extractClusterPaths(row),
    }));
  } catch {
    return [];
  }
}

function resolveClusterIds(dirPath: string, rows: ClusterSummaryMatchRow[]): number[] {
  const normalised = dirPath.replace(/\\/g, '/').toLowerCase();
  const matched = new Set<number>();

  for (const row of rows) {
    for (const f of row.paths) {
      if (f === normalised || f.startsWith(`${normalised}/`) || f.includes(`/${normalised}/`)) {
        matched.add(row.gpu_cluster);
        break;
      }
    }
  }

  return [...matched];
}

// ── Neo4j edge writer ─────────────────────────────────────────────────────────

async function writeNeo4jEdges(
  entries: Array<{
    dir: string;
    clusterIds: number[];
    somCluster?: number | null;
    somBmuRow?: number | null;
    somBmuCol?: number | null;
  }>
): Promise<number> {
  let neo4j: typeof import('neo4j-driver');
  try { neo4j = await import('neo4j-driver'); }
  catch { return 0; }

  const driver = neo4j.default.driver(NEO4J_URL, neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });
  let created = 0;

  try {
    for (const { dir, clusterIds, somCluster, somBmuRow, somBmuCol } of entries) {
      if (clusterIds.length === 0) continue;
      for (const clusterId of clusterIds) {
        // Persist SOM topology coords as edge properties so Neo4j queries can
        // filter HAS_DIRECTORY_SUMMARY edges by SOM grid neighborhood
        // (e.g. for ACE topological context expansion).
        await session.run(
          `MERGE (c:GPUCluster {id: $clusterId})
           MERGE (d:DirectorySummary {path: $dir})
           MERGE (c)-[r:HAS_DIRECTORY_SUMMARY]->(d)
           ON CREATE SET r.createdAt = $now
           ON MATCH  SET r.updatedAt = $now
           SET r.somCluster = $somCluster,
               r.somBmuRow  = $somBmuRow,
               r.somBmuCol  = $somBmuCol,
               d.somCluster = $somCluster,
               d.somBmuRow  = $somBmuRow,
               d.somBmuCol  = $somBmuCol`,
          {
            clusterId,
            dir,
            now: new Date().toISOString(),
            somCluster: somCluster ?? null,
            somBmuRow:  somBmuRow  ?? null,
            somBmuCol:  somBmuCol  ?? null,
          }
        );
        created++;
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }
  return created;
}

// ── Community reports upsert ──────────────────────────────────────────────────

let ensureCommunityReportsTablePromise: Promise<void> | null = null;

function ensureCommunityReportsTable(): Promise<void> {
  if (!ensureCommunityReportsTablePromise) {
    ensureCommunityReportsTablePromise = pool
      .query(
        `
      CREATE TABLE IF NOT EXISTS community_reports (
        community_id   INT         PRIMARY KEY,
        cluster_ids    INT[]       NOT NULL DEFAULT '{}',
        member_count   INT         NOT NULL DEFAULT 0,
        summary        TEXT        NOT NULL DEFAULT '',
        purpose        TEXT        NOT NULL DEFAULT '',
        tags           TEXT[]      NOT NULL DEFAULT '{}',
        cohesion_score REAL        NOT NULL DEFAULT 0,
        embedding      vector(768),
        built_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
      )
      .then(() => undefined)
      .catch((error) => {
        ensureCommunityReportsTablePromise = null;
        throw error;
      });
  }

  return ensureCommunityReportsTablePromise;
}

async function upsertCommunityReport(
  dirPath: string,
  clusterIds: number[],
  summary: string,
  tags: string[],
  embedding: number[] | null
): Promise<void> {
  if (clusterIds.length === 0) return;

  await ensureCommunityReportsTable();

  const communityId = clusterIds[0]; // use smallest cluster as community anchor

  await pool.query(
    `INSERT INTO community_reports
       (community_id, cluster_ids, member_count, summary, purpose, tags,
        cohesion_score, embedding, built_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, NOW())
     ON CONFLICT (community_id) DO UPDATE
       SET cluster_ids  = EXCLUDED.cluster_ids,
           member_count = EXCLUDED.member_count,
         summary     = EXCLUDED.summary,
           purpose     = EXCLUDED.purpose,
           tags        = EXCLUDED.tags,
           cohesion_score = EXCLUDED.cohesion_score,
           embedding   = EXCLUDED.embedding,
           built_at    = NOW()`,
    [
      communityId,
      clusterIds,
      clusterIds.length,
      summary,
      `Directory: ${dirPath}`,
      tags,
      0.5, // neutral cohesion — not built from edge density
      embedding ? JSON.stringify(embedding) : null,
    ]
  );

  // Invalidate Redis read-cache for this community
  try {
    const redis = getRedis();
    await redis.del(`hg:community:${communityId}`);
  } catch {
    /* non-fatal */
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function ingestDirectorySummaries(
  dirOutputs: DirAuditEntry[]
): Promise<IngestResult> {
  const result: IngestResult = {
    directoriesProcessed: 0,
    wikiNotesWritten: 0,
    neo4jEdgesCreated: 0,
    communityRowsUpserted: 0,
    webSearchTriggered: 0,
    errors: [],
  };

  if (dirOutputs.length === 0) {
    return result;
  }

  const neo4jBatch: Array<{
    dir: string;
    clusterIds: number[];
    somCluster?: number | null;
    somBmuRow?: number;
    somBmuCol?: number;
  }> = [];
  const webSearchDirs: DirAuditEntry[] = [];
  const clusterSummaryRows = await loadClusterSummaryRows();

  for (const entry of dirOutputs) {
    result.directoriesProcessed++;

    try {
      const clusterIds = resolveClusterIds(entry.rel, clusterSummaryRows);
      const ragSummary = normalizeSummaryText(entry.ragSummary);
      const ragTags = extractRagTags(entry.ragSummary);

      // Build a ClusterNote-compatible wiki doc
      const summary = entry.agentSummary ?? ragSummary ?? `Directory: ${entry.rel}`;
      const tags = [
        entry.rel.split('/').filter(Boolean).pop() ?? 'unknown',
        ...(entry.score < LOW_SCORE_THRESHOLD ? ['low-score'] : []),
        ...(entry.metrics.tsErrors ? ['has-errors'] : []),
        ...ragTags.slice(0, 4),
      ].filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);

      // Embed summary first — needed for both community_reports and SOM BMU lookup
      let embedding: number[] | null = null;
      try {
        embedding = await generateSingleEmbedding(summary);
      } catch { /* non-fatal */ }

      // 4D topology: compute SOM BMU coords from embedding (GPU, non-fatal)
      // Prefer Qdrant-sourced coords from DirAuditEntry if already available
      let somBmuRow: number | null = entry.somBmuRow ?? null;
      let somBmuCol: number | null = entry.somBmuCol ?? null;
      if ((somBmuRow == null || somBmuCol == null) && embedding) {
        try {
          const { queryBmuCached } = await import('$lib/server/gpu/libtorch-bridge.js');
          const bmu = await (queryBmuCached as (e: number[], gw: number, gh: number) => Promise<{ bmuRow: number; bmuCol: number } | null>)(embedding, 10, 10);
          if (bmu) { somBmuRow = bmu.bmuRow; somBmuCol = bmu.bmuCol; }
        } catch { /* addon not loaded or CUDA unavailable */ }
      }

      const wikiDoc = {
        type: 'cluster' as const,
        clusterId: clusterIds[0] ?? entry.somCluster ?? -1,
        clusterType: 'gpu' as const,
        purpose: `Directory audit: ${entry.rel}`,
        summary,
        dominantTags: tags,
        representativeFiles: [],
        topologicalNeighbors: clusterIds.slice(1),
        relatedErrors: entry.metrics.tsErrors ? [`${entry.metrics.tsErrors} TS errors`] : [],
        patterns: [],
        warnings: entry.score < LOW_SCORE_THRESHOLD ? [`Score ${entry.score} below threshold`] : [],
        pageRankTop5: [],
        directoryPath: entry.rel,
        auditScore: entry.score,
        auditMetrics: entry.metrics,
        ragSummary: entry.ragSummary,
        hyperedge: entry.hyperedge ?? null,
        // 4D topology: SOM Best Matching Unit in 10×10 grid (null when GPU unavailable)
        somBmuRow,
        somBmuCol,
        somGridW: 10,
        somGridH: 10,
        somCluster: entry.somCluster ?? null,
        // Cached 768-dim embedding for GPU cosine retrieval (omitted from Redis slim cache via JSON.stringify)
        summaryEmbedding: embedding,
        generatedAt: new Date().toISOString(),
        version: 2,
      };

      const docId = `dir:${entry.rel.replace(/[^a-z0-9]/gi, '_')}`;
      await upsertWikiNote(docId, wikiDoc);
      result.wikiNotesWritten++;

      // D19: Record in code-llm-index via recordKagAnswer for ACE preflight memory cascade.
      // This populates the outputMeta JSONB column so ACE can serve prior-answer summaries
      // for this directory in sub-5ms.
      void import('$lib/server/cache/code-llm-index.js')
        .then(({ recordKagAnswer }) =>
          recordKagAnswer(entry.rel, summary, {
            glyphClusterId: clusterIds[0] ?? -1,
            model:          'agent-audit',
          })
        )
        .catch(() => null);

      if (clusterIds.length > 0) {
        await upsertCommunityReport(entry.rel, clusterIds, summary, tags, embedding);
        result.communityRowsUpserted++;
        // Forward SOM coords so Neo4j HAS_DIRECTORY_SUMMARY edges can be queried
        // by topological position (SOM grid neighborhood). Closes the
        // "SOM topology missing in graph" gap reported by the pipeline audit.
        neo4jBatch.push({
          dir: entry.rel,
          clusterIds,
          somCluster: entry.somCluster ?? null,
          somBmuRow,
          somBmuCol,
        });
      }

      // Queue web-search enrichment for low-score or agent-unprocessed dirs
      if (entry.score < LOW_SCORE_THRESHOLD || entry.agentSummary === null) {
        webSearchDirs.push(entry);
      }
    } catch (err) {
      result.errors.push(`${entry.rel}: ${(err as Error).message}`);
    }
  }

  // Write Neo4j edges in one session
  if (neo4jBatch.length > 0) {
    try {
      result.neo4jEdgesCreated = await writeNeo4jEdges(neo4jBatch);
    } catch (err) {
      result.errors.push(`neo4j: ${(err as Error).message}`);
    }
  }

  // Fire web-search enrichment for low-quality directories (fire-and-forget)
  if (webSearchDirs.length > 0) {
    result.webSearchTriggered = webSearchDirs.length;
    import('$lib/server/indexer/web-search-indexer.js')
      .then(({ runDeepResearchIndex }) =>
        runDeepResearchIndex({
          maxClusters: webSearchDirs.length,
          resultsPerQuery: 3,
          maxPages: webSearchDirs.length * 3,
          onProgress: (msg) => console.log('[dir-summarizer web-search]', msg),
        })
      )
      .catch((err) => console.warn('[dir-summarizer] web-search failed:', err));
  }

  return result;
}
