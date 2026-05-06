#!/usr/bin/env node
/**
 * Exports `cluster_summaries` (Postgres) joined with code_llm_index hit density
 * + Redis BoW tile terms into a single readable JSON list.
 *
 * Outputs:
 *   docs/graph/cluster-summaries.json  — full structured list (JSONB-shaped)
 *   docs/graph/cluster-summaries.md    — human-readable digest
 *
 * Used by:
 *   - GraphifyViewer cluster panel (`/api/graph/cluster-summaries`)
 *   - ACE community-context preambles (cluster narratives)
 *   - Manual review / git diffs of how summaries shift over time
 *
 * Flags:
 *   --repo <id>   filter by repo_id (default: 'default')
 *   --top <n>     only export top-N clusters by member_count
 */
import pg from 'pg';
import Redis from 'ioredis';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.resolve(__dirname, '..', '.env');
const OUT_DIR   = path.resolve(__dirname, '..', 'docs', 'graph');

// .env loader
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const REPO   = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : 'default';
const TOP    = args.includes('--top')  ? Number(args[args.indexOf('--top') + 1]) || 0 : 0;

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';

const pool  = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
await redis.ping();

const limitClause = TOP > 0 ? `LIMIT ${TOP}` : '';
const { rows } = await pool.query(`
  SELECT
    cs.gpu_cluster                              AS cluster_id,
    cs.summary,
    cs.purpose,
    cs.patterns,
    cs.warnings,
    cs.member_count,
    cs.tags,
    cs.centroid_distance_mean,
    cs.summary_model,
    (cs.summary_embedding IS NOT NULL)          AS has_embedding,
    cs.metadata,
    cs.created_at,
    cs.updated_at,
    COALESCE(li.path_count, 0)                  AS llm_path_count,
    COALESCE(li.total_hits, 0)                  AS llm_total_hits
  FROM cluster_summaries cs
  LEFT JOIN (
    SELECT glyph_cluster_id, COUNT(*) AS path_count, SUM(hit_count) AS total_hits
    FROM code_llm_index
    WHERE glyph_cluster_id IS NOT NULL
    GROUP BY glyph_cluster_id
  ) li ON li.glyph_cluster_id = cs.gpu_cluster
  WHERE cs.repo_id = $1
  ORDER BY cs.member_count DESC
  ${limitClause}
`, [REPO]);

console.log(`✓ Loaded ${rows.length} cluster summaries from Postgres`);

// Enrich with Redis BoW tile terms (per-cluster top vocabulary)
for (const row of rows) {
  try {
    const raw = await redis.get(`texture:bow:cluster:${row.cluster_id}`);
    if (raw) {
      const tile = JSON.parse(raw);
      row.bow_terms = Array.isArray(tile.terms) ? tile.terms.slice(0, 12) : [];
    } else {
      row.bow_terms = [];
    }
  } catch { row.bow_terms = []; }

  // Pull representative dirs from code_llm_index
  try {
    const { rows: paths } = await pool.query(
      `SELECT path FROM code_llm_index
        WHERE glyph_cluster_id = $1
        ORDER BY hit_count DESC, refreshed_at DESC LIMIT 5`,
      [row.cluster_id],
    );
    row.representative_paths = paths.map((p) => p.path);
  } catch { row.representative_paths = []; }
}

// JSON output
const jsonOut = {
  generatedAt:    new Date().toISOString(),
  repoId:         REPO,
  clusterCount:   rows.length,
  totalMembers:   rows.reduce((s, r) => s + (r.member_count ?? 0), 0),
  totalLlmHits:   rows.reduce((s, r) => s + Number(r.llm_total_hits ?? 0), 0),
  clusters:       rows.map((r) => ({
    clusterId:           r.cluster_id,
    summary:             r.summary,
    purpose:             r.purpose,
    patterns:            r.patterns ?? [],
    warnings:            r.warnings ?? [],
    tags:                r.tags ?? [],
    bowTerms:            r.bow_terms ?? [],
    representativePaths: r.representative_paths ?? [],
    memberCount:         r.member_count,
    llmPathCount:        Number(r.llm_path_count),
    llmTotalHits:        Number(r.llm_total_hits),
    centroidDistanceMean: r.centroid_distance_mean,
    summaryModel:        r.summary_model,
    hasEmbedding:        r.has_embedding,
    metadata:            r.metadata,
    createdAt:           r.created_at,
    updatedAt:           r.updated_at,
  })),
};

mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = path.join(OUT_DIR, 'cluster-summaries.json');
writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));
console.log(`✓ Wrote ${jsonPath}`);

// Markdown digest
const mdLines = [
  `# Cluster Summaries — ${REPO}`,
  ``,
  `Generated: ${jsonOut.generatedAt}  `,
  `Clusters: ${jsonOut.clusterCount} · members: ${jsonOut.totalMembers} · LLM hits: ${jsonOut.totalLlmHits}`,
  ``,
];
for (const c of jsonOut.clusters) {
  mdLines.push(`## Cluster #${c.clusterId} — ${c.memberCount} members${c.llmPathCount ? ` · ⚡${c.llmPathCount} LLM paths` : ''}`);
  mdLines.push('');
  mdLines.push(c.summary);
  if (c.purpose)              mdLines.push(`\n**Purpose:** ${c.purpose}`);
  if (c.patterns.length)      mdLines.push(`\n**Patterns:** ${c.patterns.join(', ')}`);
  if (c.warnings.length)      mdLines.push(`\n**Warnings:** ${c.warnings.join('; ')}`);
  if (c.tags.length)          mdLines.push(`\n**Tags:** ${c.tags.slice(0, 8).join(', ')}`);
  if (c.bowTerms.length)      mdLines.push(`\n**BoW terms:** \`${c.bowTerms.join('` `')}\``);
  if (c.representativePaths.length) {
    mdLines.push(`\n**Representative paths:**`);
    for (const p of c.representativePaths) mdLines.push(`- \`${p}\``);
  }
  mdLines.push('');
}
const mdPath = path.join(OUT_DIR, 'cluster-summaries.md');
writeFileSync(mdPath, mdLines.join('\n'));
console.log(`✓ Wrote ${mdPath}`);

console.log(`\nSummary: ${jsonOut.clusterCount} clusters · ${jsonOut.totalMembers} members · ${jsonOut.totalLlmHits} LLM hits`);

await redis.quit();
await pool.end();
