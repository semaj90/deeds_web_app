#!/usr/bin/env node
/**
 * Build workstation task recommendations from indexed summary semantics.
 *
 * This bridges:
 *   atlas_packets + atlas_feature_envelopes
 *     -> OpenSpec/GSD-style recommendation cards
 *     -> existing agentic kanban writer
 *
 * It does not create a new truth store. Postgres remains canonical; this script
 * writes reports and can merge derived cards into the existing recommendation
 * manifest when --apply-kanban is used.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');
const APPLY_KANBAN = process.argv.includes('--apply-kanban');
const VERBOSE = process.argv.includes('--verbose');
const INCLUDE_MISSING = process.argv.includes('--include-missing');
const LIMIT = Number(cliValue('limit') ?? 250);

const OUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'summary-semantics-workstation-tasks.ndjson');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'summary-semantics-workstation-tasks.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'summary-semantics-workstation-tasks.md');
const WORKFLOW_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');
const TASK_PREFIX = 'summary-semantics-';

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 3 });

function argValue(name) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  return direct ? direct.slice(name.length + 3) : null;
}

function cliValue(name) {
  const arg = argValue(name);
  if (arg !== null && arg !== undefined) return arg;
  const envKey = `npm_config_${name.replace(/-/g, '_')}`;
  const fromEnv = process.env[envKey];
  return fromEnv !== undefined && String(fromEnv).length > 0 ? fromEnv : null;
}

function log(...args) {
  console.log('[summary-semantics-workstation]', ...args);
}

function vlog(...args) {
  if (VERBOSE) console.log('[summary-semantics-workstation]', ...args);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeJson(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [];
}

function firstWords(value, count = 12) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, count).join(' ');
}

function hashId(value, len = 12) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, len);
}

function isMissing(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function taskKind(row) {
  const score = numberOrNull(row.summary_rank_score) ?? 0;
  const nouns = asArray(safeJson(row.lexical_nouns, []));
  const verbs = asArray(safeJson(row.lexical_verbs, []));

  if (isMissing(row.summary_text)) return 'summarize_missing';
  if (isMissing(row.title_id)) return 'derive_title_id';
  if (nouns.length < 3 || verbs.length < 1) return 'lexical_extraction_gap';
  if (score < 60) return 'improve_semantic_label';
  if (isMissing(row.qdrant_point_id)) return 'qdrant_payload_gap';
  if (isMissing(row.som_cluster)) return 'topology_gap';
  if (isMissing(row.pagerank)) return 'graph_authority_gap';
  return 'ready_for_fanout';
}

function priorityScore(row, kind) {
  const score = numberOrNull(row.summary_rank_score) ?? 0;
  const rankPenalty = Math.max(0, 100 - score);
  const bonuses = {
    summarize_missing: 35,
    derive_title_id: 28,
    lexical_extraction_gap: 24,
    improve_semantic_label: 22,
    qdrant_payload_gap: 18,
    topology_gap: 14,
    graph_authority_gap: 12,
    ready_for_fanout: 4,
  };
  const pagerank = numberOrNull(row.pagerank) ?? 0;
  return Math.max(1, Math.min(100, Math.round(rankPenalty * 0.65 + (bonuses[kind] ?? 10) + Math.min(10, pagerank * 10))));
}

function commandsFor(kind) {
  const common = [
    'npm run atlas:summary:index:rank -- --limit=500 --top-k=50',
    'npm run atlas:workstation:summary-semantics',
  ];
  switch (kind) {
    case 'summarize_missing':
      return ['npm run phase7:throughput', ...common];
    case 'derive_title_id':
    case 'lexical_extraction_gap':
    case 'improve_semantic_label':
      return ['npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500', ...common];
    case 'qdrant_payload_gap':
      return ['npm run atlas:qdrant:tag-mirror:apply', ...common];
    case 'topology_gap':
      return ['npm run atlas:p5:som:queue:20x20', ...common];
    case 'graph_authority_gap':
      return ['npm run atlas:phase16:gds:apply', ...common];
    default:
      return ['npm run atlas:recommendations:kanban', ...common];
  }
}

function verificationFor(kind) {
  const commands = [
    'npm run atlas:workstation:summary-semantics',
    'npm run atlas:recommendations:replay',
  ];
  if (kind === 'qdrant_payload_gap') commands.unshift('npm run atlas:qdrant-payload:verify');
  if (kind === 'graph_authority_gap') commands.unshift('npm run atlas:graph:density:check');
  return commands;
}

function buildCard(row) {
  const kind = taskKind(row);
  const nouns = asArray(safeJson(row.lexical_nouns, []));
  const verbs = asArray(safeJson(row.lexical_verbs, []));
  const adverbs = asArray(safeJson(row.lexical_adverbs_ly, []));
  const concepts = [
    ...asArray(row.keywords),
    ...asArray(row.entities),
    ...nouns,
  ].filter(Boolean);
  const priority = priorityScore(row, kind);
  const sourceRef = row.source_ref ?? 'unknown';
  const featureId = row.feature_id ?? 'unknown';
  const titleId = row.title_id ?? row.feature_id ?? 'untitled';
  const taskHash = hashId(`${kind}:${row.packet_key}:${titleId}`);

  return {
    task_id: `${TASK_PREFIX}${taskHash}`,
    trace_id: `summary-semantics-${crypto.randomUUID()}`,
    story_id: `feature:${hashId(featureId, 10)}`,
    intent: 'codebase_semantics_indexing',
    query: `${kind}: ${titleId}`,
    symptom: describeSymptom(kind, row, nouns, verbs),
    root_cause: 'Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.',
    top_files: [sourceRef].filter((x) => x !== 'unknown'),
    graph_neighbors: [],
    prior_fixes: [],
    recommended_commands: commandsFor(kind),
    verification_commands: verificationFor(kind),
    confidence: Number(
      Math.max(0.35, Math.min(0.95, ((numberOrNull(row.summary_rank_score) ?? 50) / 100))).toFixed(2),
    ),
    recommendation_score: priority,
    priority_0_100: priority,
    status: kind === 'ready_for_fanout' ? 'verified' : 'ready',
    canonical: {
      packet_id: row.packet_id,
      packet_ulid: row.packet_ulid,
      packet_key: row.packet_key,
      source_ref: sourceRef,
      feature_id: featureId,
      title_id: titleId,
      qdrant_point_id: row.qdrant_point_id,
    },
    semantics: {
      summary_rank_score: numberOrNull(row.summary_rank_score),
      summary_rank_status: row.summary_rank_status,
      summary_short: firstWords(row.summary_text, 24),
      nouns: nouns.slice(0, 12),
      verbs: verbs.slice(0, 12),
      adverbs_ly: adverbs.slice(0, 8),
      concepts: [...new Set(concepts)].slice(0, 16),
      som_cluster: row.som_cluster,
      pagerank: numberOrNull(row.pagerank),
    },
  };
}

function describeSymptom(kind, row, nouns, verbs) {
  switch (kind) {
    case 'summarize_missing':
      return 'Packet has identity but no usable human summary for ACE label extraction.';
    case 'derive_title_id':
      return 'Packet summary exists but title_id grouping is missing.';
    case 'lexical_extraction_gap':
      return `Lexical extraction is thin: nouns=${nouns.length}, verbs=${verbs.length}.`;
    case 'improve_semantic_label':
      return `Summary rank is below routing threshold: score=${row.summary_rank_score ?? 'unknown'}.`;
    case 'qdrant_payload_gap':
      return 'Packet semantics are not linked to a Qdrant payload point.';
    case 'topology_gap':
      return 'Packet lacks SOM/topology cluster assignment for topology-aware routing.';
    case 'graph_authority_gap':
      return 'Packet lacks PageRank/graph authority signal for ranking.';
    default:
      return 'Packet is ready for fan-out into recommendation, graph, cache, and retrieval lanes.';
  }
}

async function readRows() {
  const { rows } = await pool.query(
    `
    SELECT
      ap.packet_id::text,
      ap.packet_ulid,
      ap.packet_key,
      ap.source_ref,
      ap.feature_id,
      COALESCE(afe.title_id, ap.title_id, ap.feature_id) AS title_id,
      ap.qdrant_point_id,
      COALESCE(afe.summary_text, ap.summary) AS summary_text,
      afe.lexical_nouns,
      afe.lexical_verbs,
      afe.lexical_adverbs_ly,
      afe.summary_rank_score,
      afe.summary_rank_status,
      COALESCE(afe.keywords, ap.keywords, ARRAY[]::text[]) AS keywords,
      COALESCE(afe.entities, ARRAY[]::text[]) AS entities,
      COALESCE(afe.som_cluster::text, ap.som_cluster::text) AS som_cluster,
      COALESCE(afe.pagerank, ap.pagerank) AS pagerank
    FROM atlas_packets ap
    LEFT JOIN atlas_feature_envelopes afe ON afe.packet_key = ap.packet_key
    WHERE ap.packet_key IS NOT NULL
      AND ap.source_ref IS NOT NULL
      ${INCLUDE_MISSING ? '' : "AND COALESCE(NULLIF(btrim(afe.summary_text), ''), NULLIF(btrim(ap.summary), '')) IS NOT NULL"}
    ORDER BY
      COALESCE(afe.summary_rank_score, 0) ASC,
      ap.updated_at DESC NULLS LAST
    LIMIT $1
    `,
    [LIMIT],
  );
  return rows;
}

function summarize(cards) {
  const byKind = new Map();
  for (const card of cards) {
    const kind = card.query.split(':')[0];
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  return {
    total_cards: cards.length,
    ready: cards.filter((card) => card.status === 'ready').length,
    verified: cards.filter((card) => card.status === 'verified').length,
    by_kind: Object.fromEntries([...byKind.entries()].sort((a, b) => b[1] - a[1])),
    top_priority: cards[0]?.priority_0_100 ?? 0,
  };
}

function writeOutputs(cards, report) {
  ensureDir(OUT_NDJSON);
  ensureDir(OUT_JSON);
  fs.writeFileSync(OUT_NDJSON, cards.map((card) => JSON.stringify(card)).join('\n') + (cards.length ? '\n' : ''), 'utf8');
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  const top = cards.slice(0, 15);
  const md = [
    '# Summary Semantics Workstation Tasks',
    '',
    `Generated: ${report.generated_at}`,
    `Apply kanban merge: ${APPLY_KANBAN ? 'yes' : 'no'}`,
    `Include missing summaries: ${INCLUDE_MISSING ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Total cards: ${report.summary.total_cards}`,
    `- Ready: ${report.summary.ready}`,
    `- Verified: ${report.summary.verified}`,
    `- Top priority: ${report.summary.top_priority}`,
    '',
    '## By Kind',
    '',
    ...Object.entries(report.summary.by_kind).map(([kind, count]) => `- ${kind}: ${count}`),
    '',
    '## Top Cards',
    '',
    ...top.map((card) => [
      `### ${card.task_id}`,
      `- Score: ${card.priority_0_100}`,
      `- Status: ${card.status}`,
      `- Source: \`${card.canonical.source_ref}\``,
      `- Feature: \`${card.canonical.feature_id}\``,
      `- Title: \`${card.canonical.title_id}\``,
      `- Symptom: ${card.symptom}`,
      `- Command: \`${card.recommended_commands[0] ?? 'n/a'}\``,
      '',
    ].join('\n')),
  ].join('\n');
  fs.writeFileSync(OUT_MD, md, 'utf8');
}

function mergeKanban(cards) {
  let existing = [];
  if (fs.existsSync(WORKFLOW_JSON)) {
    try {
      existing = JSON.parse(fs.readFileSync(WORKFLOW_JSON, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }
  const retained = existing.filter((card) => !String(card.task_id ?? '').startsWith(TASK_PREFIX));
  const merged = [...cards, ...retained];
  ensureDir(WORKFLOW_JSON);
  fs.writeFileSync(WORKFLOW_JSON, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return { retained: retained.length, added: cards.length, total: merged.length };
}

async function main() {
  try {
    log(`Reading indexed summaries and feature envelopes (limit=${LIMIT})`);
    const rows = await readRows();
    const cards = rows.map(buildCard).sort((a, b) => b.priority_0_100 - a.priority_0_100);
    const report = {
      generated_at: new Date().toISOString(),
      source_tables: ['atlas_packets', 'atlas_feature_envelopes'],
      filters: {
        limit: LIMIT,
        include_missing_summaries: INCLUDE_MISSING,
      },
      outputs: {
        ndjson: path.relative(REPO_ROOT, OUT_NDJSON),
        json: path.relative(REPO_ROOT, OUT_JSON),
        markdown: path.relative(REPO_ROOT, OUT_MD),
        kanban_manifest: APPLY_KANBAN ? path.relative(REPO_ROOT, WORKFLOW_JSON) : null,
      },
      summary: summarize(cards),
      cards: cards.slice(0, 50),
    };

    writeOutputs(cards, report);
    vlog('Top card', cards[0]);

    let kanban = null;
    if (APPLY_KANBAN) {
      kanban = mergeKanban(cards);
      report.kanban_merge = kanban;
      fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
    }

    log(`Wrote ${path.relative(REPO_ROOT, OUT_NDJSON)}`);
    log(`Wrote ${path.relative(REPO_ROOT, OUT_JSON)}`);
    log(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}`);
    if (kanban) log(`Merged kanban cards: added=${kanban.added} retained=${kanban.retained} total=${kanban.total}`);
    log(`Top kind counts: ${JSON.stringify(report.summary.by_kind)}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[summary-semantics-workstation] fatal:', err);
  process.exit(1);
});
