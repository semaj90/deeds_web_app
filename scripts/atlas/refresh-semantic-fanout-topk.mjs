#!/usr/bin/env node
/**
 * Refresh the semantic fan-out / top-k cluster lane.
 *
 * Order:
 *   1. Bound community summary hints with the top-k noun clusterer
 *   2. Refresh the feature recommendation index and TODOs for the same slice
 *   3. Synthesize a top-k semantic fan-out report for the board and retrieval lane
 *
 * This is intentionally resumable and bounded:
 *   - dry-run by default unless --apply is explicit
 *   - limit/offset are forwarded to the underlying refresh/materializer lanes
 *   - top-k and min-community-size are forwarded to the summary cluster lane
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

function argValue(name, fallback = null) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const envKey = `npm_config_${name.replace(/-/g, '_')}`;
  const fromEnv = process.env[envKey];
  return fromEnv !== undefined && String(fromEnv).length > 0 ? fromEnv : fallback;
}

const LIMIT = Number(argValue('limit', '500'));
const OFFSET = Number(argValue('offset', '0'));
const TOP_K = Number(argValue('top-k', '12'));
const MIN_COMMUNITY_SIZE = Number(argValue('min-community-size', '3'));
const TODO_LIMIT = Number(argValue('todo-limit', '100'));

const CLUSTER_TOPK = path.join(ROOT, 'scripts', 'atlas', 'cluster-summaries-topk.mjs');
const REFRESH = path.join(ROOT, 'scripts', 'atlas', 'refresh-summary-topology-recommendations.mjs');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'semantic-fanout-topk.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'semantic-fanout-topk.md');
const REPORT_NDJSON = path.join(ROOT, '.tmp', 'semantic-fanout-topk.ndjson');
const BOARD_MD = path.join(ROOT, 'docs', 'reports', 'spec-driven-kanban-task-board.md');

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 3 });

function log(...args) {
  console.log('[semantic-fanout-topk]', ...args);
}

function runNode(script, args = []) {
  return execFileSync('node', [script, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function emit(out) {
  process.stdout.write(String(out ?? ''));
  if (out && !String(out).endsWith('\n')) process.stdout.write('\n');
}

function sanitizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function percent(value, total) {
  const n = Number(value ?? 0);
  const t = Number(total ?? 0);
  return t > 0 ? Number(((n / t) * 100).toFixed(2)) : 0;
}

function renderBoardSection(report) {
  const topClusters = Array.isArray(report?.top_clusters) ? report.top_clusters : [];
  const rows = [
    '',
    '## Semantic Fanout Top-K',
    '',
    `Generated: ${report?.generated_at ?? new Date().toISOString()}`,
    `Mode: ${report?.mode ?? 'dry-run'}`,
    `Limit: ${report?.limit ?? 'n/a'}  Offset: ${report?.offset ?? 'n/a'}  Top-K: ${report?.top_k ?? 'n/a'}`,
    `Community min size: ${report?.min_community_size ?? 'n/a'}`,
    '',
    '| priority | feature | domain | packets | summary | qdrant | tree | todo score | top concepts |',
    '|---:|---|---|---:|---:|---:|---:|---:|---|',
    ...topClusters.slice(0, 20).map((row) => `| ${row.priority ?? ''} | ${row.feature_label ?? row.feature_id ?? ''} | ${row.domain_class ?? ''} | ${row.packet_count ?? ''} | ${row.summary_coverage ?? ''}% | ${row.qdrant_keyed_coverage ?? ''}% | ${row.tree_linked_coverage ?? ''}% | ${row.todo_score ?? ''} | ${(row.used_concepts ?? []).slice(0, 6).join(', ')} |`),
    '',
  ];
  return rows.join('\n');
}

async function queryTopClusters(limit) {
  const { rows } = await pool.query(
    `
      SELECT
        feature_id,
        feature_label,
        domain_class,
        title_id,
        packet_count,
        summary_count,
        missing_summary_count,
        qdrant_keyed_count,
        tree_linked_count,
        lexically_rich_count,
        todo_score,
        used_concepts,
        lexical_nouns,
        lexical_verbs,
        lexical_adverbs_ly,
        packet_key,
        source_ref,
        tree_node_id
      FROM atlas_feature_recommendation_index
      ORDER BY todo_score DESC, packet_count DESC, feature_id ASC
      LIMIT $1
    `,
    [limit],
  );

  return rows.map((row, index) => {
    const packetCount = Number(row.packet_count ?? 0);
    const summaryCount = Number(row.summary_count ?? 0);
    const qdrantKeyedCount = Number(row.qdrant_keyed_count ?? 0);
    const treeLinkedCount = Number(row.tree_linked_count ?? 0);
    return {
      rank: index + 1,
      priority: Number(row.todo_score ?? 0),
      feature_id: row.feature_id,
      feature_label: row.feature_label ?? row.feature_id,
      domain_class: row.domain_class ?? 'unknown',
      title_id: row.title_id ?? null,
      packet_count: packetCount,
      summary_count: summaryCount,
      summary_coverage: percent(summaryCount, packetCount),
      qdrant_keyed_coverage: percent(qdrantKeyedCount, packetCount),
      tree_linked_coverage: percent(treeLinkedCount, packetCount),
      qdrant_keyed_count: qdrantKeyedCount,
      tree_linked_count: treeLinkedCount,
      todo_score: Number(row.todo_score ?? 0),
      used_concepts: sanitizeList(row.used_concepts),
      lexical_nouns: sanitizeList(row.lexical_nouns),
      lexical_verbs: sanitizeList(row.lexical_verbs),
      lexical_adverbs_ly: sanitizeList(row.lexical_adverbs_ly),
      packet_key: row.packet_key ?? null,
      source_ref: row.source_ref ?? null,
      tree_node_id: row.tree_node_id ?? null,
    };
  });
}

async function writeReports(report) {
  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.mkdir(path.dirname(REPORT_NDJSON), { recursive: true });

  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_NDJSON,
    `${report.top_clusters.map((row) => JSON.stringify(row)).join('\n')}${report.top_clusters.length ? '\n' : ''}`,
    'utf8',
  );

  await fs.writeFile(
    REPORT_MD,
    [
      '# Semantic Fanout Top-K',
      '',
      `Generated: ${report.generated_at}`,
      `Mode: ${report.mode}`,
      `Limit: ${report.limit}  Offset: ${report.offset}  Top-K: ${report.top_k}`,
      `Community min size: ${report.min_community_size}`,
      '',
      '## Top Clusters',
      '',
      '| rank | priority | feature | domain | packets | summary | qdrant | tree | top concepts |',
      '|---:|---:|---|---|---:|---:|---:|---:|---|',
      ...report.top_clusters.slice(0, 20).map((row) => `| ${row.rank} | ${row.priority} | ${row.feature_label ?? row.feature_id} | ${row.domain_class ?? ''} | ${row.packet_count} | ${row.summary_coverage}% | ${row.qdrant_keyed_coverage}% | ${row.tree_linked_coverage}% | ${(row.used_concepts ?? []).slice(0, 6).join(', ')} |`),
      '',
      '## Derived Signals',
      '',
      `- total features: ${report.totals.total_features}`,
      `- clusters with summaries: ${report.totals.with_summaries}`,
      `- clusters with qdrant ids: ${report.totals.with_qdrant}`,
      `- clusters with tree links: ${report.totals.with_tree}`,
      '',
    ].join('\n'),
    'utf8',
  );
}

async function updateBoard(report) {
  const existing = await fs.readFile(BOARD_MD, 'utf8').catch(() => '# Spec-Driven Kanban Task Board\n');
  const stripped = existing.replace(/\n## Semantic Fanout Top-K[\s\S]*$/m, '').trimEnd();
  await fs.writeFile(BOARD_MD, `${stripped}\n${renderBoardSection(report)}`, 'utf8');
}

async function main() {
  log(`mode=${APPLY ? 'apply' : 'dry-run'} limit=${LIMIT} offset=${OFFSET} top-k=${TOP_K} min-community-size=${MIN_COMMUNITY_SIZE}`);

  log('1/3 clustering summaries to semantic top-k hints...');
  emit(runNode(CLUSTER_TOPK, [
    DRY_RUN ? '--dry-run' : '--apply',
    `--top-k=${TOP_K}`,
    `--min-community-size=${MIN_COMMUNITY_SIZE}`,
  ]));

  log('2/3 refreshing summary topology recommendations...');
  emit(runNode(REFRESH, [
    DRY_RUN ? '--dry-run' : '--apply',
    `--limit=${LIMIT}`,
    `--offset=${OFFSET}`,
    `--max-pages=1`,
    `--top-k=${TOP_K}`,
    `--todo-limit=${TODO_LIMIT}`,
  ]));

  const topClusters = await queryTopClusters(LIMIT);
  const report = {
    generated_at: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    limit: LIMIT,
    offset: OFFSET,
    top_k: TOP_K,
    min_community_size: MIN_COMMUNITY_SIZE,
    totals: {
      total_features: topClusters.length,
      with_summaries: topClusters.filter((row) => row.summary_count > 0).length,
      with_qdrant: topClusters.filter((row) => row.qdrant_keyed_count > 0).length,
      with_tree: topClusters.filter((row) => row.tree_linked_count > 0).length,
    },
    top_clusters: topClusters.slice(0, TOP_K),
  };

  await writeReports(report);
  await updateBoard(report);

  log('3/3 reports and board updated');
  log(`Top cluster: ${report.top_clusters[0]?.feature_id ?? 'n/a'}`);
  log(`Reports written: ${path.relative(ROOT, REPORT_JSON)}, ${path.relative(ROOT, REPORT_MD)}, ${path.relative(ROOT, REPORT_NDJSON)}`);
}

main().catch((error) => {
  console.error('[semantic-fanout-topk] fatal:', error?.stdout || error?.stderr || error?.message || error);
  process.exit(1);
}).finally(async () => {
  try { await pool.end(); } catch {}
});
