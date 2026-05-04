/**
 * Directory Summarizer — Graph Layer Integration
 *
 * Ingests deep-directory-audit output into the codebase knowledge graph:
 *   1. Match each directory to GPU cluster(s) via cluster_summaries.representative_files
 *   2. Store a ClusterNote in karpathy-wiki (CouchDB + Redis) per directory
 *   3. Fire runDeepResearchIndex for low-score/unsummarized directories
 *   4. Create Neo4j HAS_DIRECTORY_SUMMARY edges from cluster nodes to directory paths
 *   5. Upsert community_reports rows so getCommunityContext() picks them up
 */

import { pool, db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { getRedis } from '$lib/server/redis.js';

const NEO4J_URL  = ENV.NEO4J_URI ?? 'bolt://127.0.0.1:7687';
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
  gpu_cluster: number;
  representative_files: string[] | null;
}

async function resolveClusterIds(dirPath: string): Promise<number[]> {
  try {
    const rows = await pool.query<ClusterSummaryRow>(
      `SELECT gpu_cluster, representative_files
       FROM cluster_summaries
       WHERE representative_files IS NOT NULL
       LIMIT 200`
    );

    const normalised = dirPath.replace(/\\/g, '/').toLowerCase();
    const matched = new Set<number>();

    for (const row of rows.rows) {
      const files = row.representative_files ?? [];
      for (const f of files) {
        if (f.replace(/\\/g, '/').toLowerCase().includes(normalised)) {
          matched.add(row.gpu_cluster);
          break;
        }
      }
    }

    return [...matched];
  } catch {
    return [];
  }
}

// ── Neo4j edge writer ─────────────────────────────────────────────────────────

async function writeNeo4jEdges(entries: Array<{ dir: string; clusterIds: number[] }>): Promise<number> {
  let neo4j: typeof import('neo4j-driver');
  try { neo4j = await import('neo4j-driver'); }
  catch { return 0; }

  const driver = neo4j.default.driver(NEO4J_URL, neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });
  let created = 0;

  try {
    for (const { dir, clusterIds } of entries) {
      if (clusterIds.length === 0) continue;
      for (const clusterId of clusterIds) {
        await session.run(
          `MERGE (c:GPUCluster {id: $clusterId})
           MERGE (d:DirectorySummary {path: $dir})
           MERGE (c)-[r:HAS_DIRECTORY_SUMMARY]->(d)
           ON CREATE SET r.createdAt = $now
           ON MATCH  SET r.updatedAt = $now`,
          { clusterId, dir, now: new Date().toISOString() }
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

async function upsertCommunityReport(
  dirPath: string,
  clusterIds: number[],
  summary: string,
  tags: string[],
  embedding: number[] | null
): Promise<void> {
  if (clusterIds.length === 0) return;

  const communityId = clusterIds[0]; // use smallest cluster as community anchor
  const embeddingLiteral = embedding ? `'[${embedding.join(',')}]'::vector` : 'NULL';

  await pool.query(
    `INSERT INTO community_reports
       (community_id, cluster_ids, member_count, summary, purpose, tags,
        cohesion_score, embedding, built_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${embeddingLiteral}, NOW())
     ON CONFLICT (community_id) DO UPDATE
       SET summary     = EXCLUDED.summary,
           purpose     = EXCLUDED.purpose,
           tags        = EXCLUDED.tags,
           built_at    = NOW()`,
    [
      communityId,
      JSON.stringify(clusterIds),
      clusterIds.length,
      summary,
      `Directory: ${dirPath}`,
      JSON.stringify(tags),
      0.5, // neutral cohesion — not built from edge density
    ]
  );

  // Invalidate Redis read-cache for this community
  try {
    const redis = getRedis();
    await redis.del(`hg:community:${communityId}`);
  } catch { /* non-fatal */ }
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

  const neo4jBatch: Array<{ dir: string; clusterIds: number[] }> = [];
  const webSearchDirs: DirAuditEntry[] = [];

  for (const entry of dirOutputs) {
    result.directoriesProcessed++;

    try {
      const clusterIds = await resolveClusterIds(entry.rel);
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

      const wikiDoc = {
        type: 'cluster' as const,
        clusterId: clusterIds[0] ?? -1,
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
        generatedAt: new Date().toISOString(),
        version: 1,
      };

      const docId = `dir:${entry.rel.replace(/[^a-z0-9]/gi, '_')}`;
      await upsertWikiNote(docId, wikiDoc);
      result.wikiNotesWritten++;

      // Embed summary for community_reports
      let embedding: number[] | null = null;
      try {
        embedding = await generateSingleEmbedding(summary);
      } catch { /* non-fatal */ }

      if (clusterIds.length > 0) {
        await upsertCommunityReport(entry.rel, clusterIds, summary, tags, embedding);
        result.communityRowsUpserted++;
        neo4jBatch.push({ dir: entry.rel, clusterIds });
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
