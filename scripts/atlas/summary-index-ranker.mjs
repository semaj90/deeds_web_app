#!/usr/bin/env node
/**
 * summary-index-ranker.mjs
 *
 * Summary ranking pass for Parent Atlas.
 *
 * Purpose:
 *   Rank existing Gemma4 summaries before fan-out analysis.
 *   This is a scorer/indexer, not a generative decoder.
 *
 * Inputs:
 *   - atlas_summary_layers
 *   - atlas_packets truth join
 *
 * Outputs:
 *   - .tmp/summary-index-ranker.ndjson
 *   - docs/reports/summary-index-ranker.json
 *   - docs/reports/summary-index-ranker.md
 *   - optional Bitfrost/Valkey sorted-set index when --apply is set
 *
 * Canonical rules:
 *   - Postgres remains truth
 *   - packet_id / packet_key / source_ref / feature_id / title_id are preserved
 *   - Redis/Valkey is cache only
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisUrl } from './connection-config.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const REDIS_URL = resolveRedisUrl(env);
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT = Number(cliValue('limit') ?? 5000);
const TOP_K = Number(cliValue('top-k') ?? 250);

const OUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'summary-index-ranker.ndjson');
const OUT_JSON = path.join(REPO_ROOT, 'docs/reports', 'summary-index-ranker.json');
const OUT_MD = path.join(REPO_ROOT, 'docs/reports', 'summary-index-ranker.md');
const REDIS_INDEX_KEY = 'bitfrost:summary:index:ranked:v1';
const REDIS_PACKET_PREFIX = 'bitfrost:summary:packet:v1:';

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
  console.log('[summary-index-ranker]', ...args);
}

function vlog(...args) {
  if (VERBOSE) console.log('[summary-index-ranker]', ...args);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function pct(part, total) {
  const denom = Number(total) || 0;
  if (!denom) return 0;
  return Number(part || 0) / denom;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'were', 'will', 'with', 'use', 'used', 'using', 'via', 'their', 'your',
  'summary', 'chunk', 'packet', 'file', 'code', 'codebase', 'feature',
]);

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sentenceCount(text) {
  const matches = cleanText(text).match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

function wordCount(text) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  return words.length;
}

function detectThoughtLeakage(summary) {
  const text = cleanText(summary);
  if (!text) return false;
  return [
    /\bi\s+(think|believe|want|need|should|suppose)\b/i,
    /\b(let\s+me|according\s+to\s+me|as\s+far\s+as\s+i|in\s+my\s+opinion)\b/i,
    /\b(todo|fixme|placeholder|xxx|hack|stub)\b/i,
    /<\|channel\>/i,
  ].some((pattern) => pattern.test(text));
}

function detectPlaceholder(summary) {
  const text = cleanText(summary);
  if (!text) return true;
  if (text.length < 20) return true;
  if (/^(.)\1{5,}$/.test(text)) return true;
  const lower = text.toLowerCase();
  if (['function', 'class', 'type', 'interface', 'module', 'file', 'code'].every((word) => !lower.includes(word))) {
    if (wordCount(text) < 5) return true;
  }
  return false;
}

function slugifyTitleId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

function deriveTitleId(row) {
  const direct =
    row.title_id ??
    row.metadata?.title_id ??
    row.metadata?.titleId ??
    row.payload?.title_id ??
    row.payload?.titleId ??
    row.feature_label ??
    row.feature_id ??
    null;

  if (direct) {
    const cleanDirect = slugifyTitleId(direct);
    if (cleanDirect) return cleanDirect;
  }

  const summary = cleanText(row.summary ?? row.summary_text ?? '');
  if (summary) {
    const tokens = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s._/-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token && !STOP_WORDS.has(token))
      .slice(0, 4);
    if (tokens.length) return slugifyTitleId(tokens.join(' '));
  }

  return slugifyTitleId(row.feature_id ?? row.packet_key ?? row.source_ref ?? 'packet') || 'packet';
}

function readinessStatus(score) {
  if (score >= 80) return 'READY';
  if (score >= 60) return 'NEAR_READY';
  if (score >= 35) return 'PARTIAL';
  return 'BLOCKED';
}

function scoreSummary(row) {
  const summary = cleanText(row.summary ?? row.summary_text ?? '');
  const words = wordCount(summary);
  const sentences = sentenceCount(summary);
  const keywords = Array.isArray(row.keywords) ? row.keywords.filter(Boolean) : [];
  const entities = Array.isArray(row.entities) ? row.entities.filter(Boolean) : [];
  const hasPacketId = Boolean(cleanText(row.packet_id));
  const hasPacketKey = Boolean(cleanText(row.packet_key));
  const hasSourceRef = Boolean(cleanText(row.source_ref));
  const hasFeatureId = Boolean(cleanText(row.feature_id));
  const hasTitleId = Boolean(cleanText(row.title_id));
  const hasModel = Boolean(cleanText(row.model_name));
  const hasGeneratedAt = Boolean(cleanText(row.generated_at));
  const hasPagerank = Number.isFinite(Number(row.pagerank));
  const hasSom = row.som_cluster !== null && row.som_cluster !== undefined;
  const hasCommunity = row.community_id !== null && row.community_id !== undefined;
  const provenance = row.metadata?.provenance ?? row.metadata?.summary_context ?? row.metadata ?? null;
  const leakage = detectThoughtLeakage(summary);
  const placeholder = detectPlaceholder(summary);

  const lengthTarget = clamp(1 - Math.abs(words - 32) / 32);
  const sentenceTarget = clamp(1 - Math.abs(sentences - 2) / 3);
  const lineageCoverage =
    (Number(hasPacketId) + Number(hasPacketKey) + Number(hasSourceRef) + Number(hasFeatureId) + Number(hasTitleId)) / 5;
  const semanticRichness = clamp(
    0.5 * pct(keywords.length, 8) +
    0.5 * pct(entities.length, 8)
  );
  const graphCoverage =
    (Number(hasPagerank) + Number(hasSom) + Number(hasCommunity)) / 3;
  const provenanceCoverage =
    (Number(hasModel) + Number(hasGeneratedAt) + Number(Boolean(provenance))) / 3;
  const densityBonus = clamp(words / 120, 0, 1);

  let score =
    100 * (
      0.22 * lengthTarget +
      0.16 * sentenceTarget +
      0.22 * lineageCoverage +
      0.18 * semanticRichness +
      0.12 * graphCoverage +
      0.05 * provenanceCoverage +
      0.05 * densityBonus
    );

  if (leakage) score -= 28;
  if (placeholder) score -= 20;
  if (!summary) score = 0;

  score = clamp(Math.round(score));

  const reasons = [];
  if (summary) reasons.push(`${words} words`);
  if (sentences > 0) reasons.push(`${sentences} sentence${sentences === 1 ? '' : 's'}`);
  if (hasPacketId) reasons.push('packet_id present');
  if (hasPacketKey) reasons.push('packet_key present');
  if (hasSourceRef) reasons.push('source_ref present');
  if (hasFeatureId) reasons.push('feature_id present');
  if (hasTitleId) reasons.push('title_id present');
  if (keywords.length) reasons.push(`${keywords.length} keywords`);
  if (entities.length) reasons.push(`${entities.length} entities`);
  if (hasPagerank) reasons.push('pagerank present');
  if (hasSom) reasons.push('som_cluster present');
  if (hasCommunity) reasons.push('community present');
  if (leakage) reasons.push('thought leakage penalty');
  if (placeholder) reasons.push('placeholder penalty');

  return {
    score,
    status: readinessStatus(score),
    title_id: deriveTitleId(row),
    title_id_source: row.title_id ? 'canonical' : 'derived',
    leakage,
    placeholder,
    words,
    sentences,
    keywords_count: keywords.length,
    entities_count: entities.length,
    reasons,
  };
}

function rankRows(rows) {
  return rows
    .map((row) => {
      const scored = scoreSummary(row);
      const titleId = scored.title_id;
      return {
        packet_id: row.packet_id ?? null,
        packet_ulid: row.packet_ulid ?? null,
        packet_key: row.packet_key ?? row.summary_packet_key ?? null,
        summary_packet_key: row.summary_packet_key ?? row.packet_key ?? null,
        source_ref: cleanText(row.source_ref),
        canonical_source_ref: cleanText(row.canonical_source_ref ?? row.source_ref),
        feature_id: cleanText(row.feature_id ?? row.packet_feature_id),
        feature_label: cleanText(row.feature_label ?? row.packet_feature_id ?? row.feature_id),
        title_id: titleId,
        title_id_source: scored.title_id_source,
        domain_class: cleanText(row.domain_class),
        summary: cleanText(row.summary ?? row.summary_text),
        keywords: Array.isArray(row.keywords) ? row.keywords.filter(Boolean) : [],
        entities: Array.isArray(row.entities) ? row.entities.filter(Boolean) : [],
        pagerank: row.pagerank === null || row.pagerank === undefined ? null : Number(row.pagerank),
        som_cluster: row.som_cluster === null || row.som_cluster === undefined ? null : row.som_cluster,
        community_id: row.community_id === null || row.community_id === undefined ? null : row.community_id,
        model_name: cleanText(row.model_name),
        generated_at: row.generated_at ?? null,
        updated_at: row.updated_at ?? null,
        score: scored.score,
        status: scored.status,
        reasons: scored.reasons,
        fingerprint: hash(`${row.packet_key ?? ''}:${titleId}:${cleanText(row.summary ?? row.summary_text)}`),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aRank = Number.isFinite(a.pagerank) ? a.pagerank : -1;
      const bRank = Number.isFinite(b.pagerank) ? b.pagerank : -1;
      if (bRank !== aRank) return bRank - aRank;
      return String(a.packet_key ?? '').localeCompare(String(b.packet_key ?? ''));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadSummaries(pool, limit) {
  const { rows } = await pool.query(
    `
      SELECT
        ap.packet_id,
        ap.packet_ulid,
        ap.packet_key,
        ap.title_id,
        ap.source_ref,
        ap.canonical_source_ref,
        ap.feature_id,
        ap.feature_label,
        ap.domain_class,
        ap.community_id,
        ap.som_cluster,
        ap.pagerank,
        asl.packet_key AS summary_packet_key,
        COALESCE(NULLIF(asl.summary_text, ''), NULLIF(asl.summary, '')) AS summary,
        asl.summary_text,
        COALESCE(asl.keywords, ARRAY[]::text[]) AS keywords,
        COALESCE(asl.entities, ARRAY[]::text[]) AS entities,
        asl.model_name,
        asl.generated_at,
        asl.updated_at,
        asl.metadata
      FROM atlas_summary_layers asl
      LEFT JOIN atlas_packets ap
        ON ap.packet_key = asl.packet_key
      WHERE COALESCE(NULLIF(asl.summary_text, ''), NULLIF(asl.summary, '')) IS NOT NULL
      ORDER BY COALESCE(ap.pagerank, 0) DESC, asl.updated_at DESC NULLS LAST, ap.packet_key
      LIMIT $1
    `,
    [limit],
  );
  return rows;
}

async function writeRedisIndex(redis, ranked) {
  const pipeline = redis.pipeline();
  pipeline.del(REDIS_INDEX_KEY);
  for (const row of ranked) {
    pipeline.zadd(REDIS_INDEX_KEY, row.score, row.packet_key || row.summary_packet_key || row.fingerprint);
    pipeline.setex(
      `${REDIS_PACKET_PREFIX}${row.packet_key || row.summary_packet_key || row.fingerprint}`,
      604800,
      JSON.stringify(row),
    );
  }
  await pipeline.exec();
}

function buildReport(ranked, redisResult) {
  const total = ranked.length;
  const stats = ranked.reduce((acc, row) => {
    acc.ready += row.status === 'READY' ? 1 : 0;
    acc.near_ready += row.status === 'NEAR_READY' ? 1 : 0;
    acc.partial += row.status === 'PARTIAL' ? 1 : 0;
    acc.blocked += row.status === 'BLOCKED' ? 1 : 0;
    acc.score_sum += row.score;
    acc.with_title_id += Boolean(row.title_id) ? 1 : 0;
    acc.with_feature_id += Boolean(row.feature_id) ? 1 : 0;
    acc.with_packet_key += Boolean(row.packet_key) ? 1 : 0;
    acc.with_source_ref += Boolean(row.source_ref) ? 1 : 0;
    return acc;
  }, {
    ready: 0,
    near_ready: 0,
    partial: 0,
    blocked: 0,
    score_sum: 0,
    with_title_id: 0,
    with_feature_id: 0,
    with_packet_key: 0,
    with_source_ref: 0,
  });

  return {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    source_of_truth: 'postgres.atlas_summary_layers + atlas_packets',
    redis_index: redisResult,
    stats: {
      total,
      ready: stats.ready,
      near_ready: stats.near_ready,
      partial: stats.partial,
      blocked: stats.blocked,
      avg_score: total ? Number((stats.score_sum / total).toFixed(2)) : 0,
      with_title_id: stats.with_title_id,
      with_feature_id: stats.with_feature_id,
      with_packet_key: stats.with_packet_key,
      with_source_ref: stats.with_source_ref,
    },
    top: ranked.slice(0, Math.min(TOP_K, ranked.length)),
    bottom: ranked.slice(Math.max(0, ranked.length - 20)),
  };
}

function renderMarkdown(report) {
  return [
    '# Summary Index Ranker',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Source of truth: ${report.source_of_truth}`,
    '',
    '## Stats',
    '',
    `- Total ranked: ${report.stats.total}`,
    `- READY: ${report.stats.ready}`,
    `- NEAR_READY: ${report.stats.near_ready}`,
    `- PARTIAL: ${report.stats.partial}`,
    `- BLOCKED: ${report.stats.blocked}`,
    `- Average score: ${report.stats.avg_score}`,
    '',
    '## Redis index',
    '',
    `- Key: \`${report.redis_index?.key ?? REDIS_INDEX_KEY}\``,
    `- Applied: ${report.redis_index?.applied ? 'yes' : 'no'}`,
    '',
    '## Top packets',
    '',
    '| rank | score | status | title_id | feature_id | source_ref | reasons |',
    '|---:|---:|---|---|---|---|---|',
    ...report.top.slice(0, 20).map((row) =>
      `| ${row.rank} | ${row.score} | ${row.status} | ${row.title_id || ''} | ${row.feature_id || ''} | ${row.source_ref || ''} | ${row.reasons.slice(0, 3).join('; ') || ''} |`
    ),
    '',
  ].join('\n');
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let redis = null;

  try {
    log(`Rank summary index ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    log(`Limit=${LIMIT} top_k=${TOP_K}`);

    const summaries = await loadSummaries(pool, LIMIT);
    if (!summaries.length) {
      log('No summary rows found; nothing to rank.');
      const empty = {
        generated_at: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        source_of_truth: 'postgres.atlas_summary_layers + atlas_packets',
        redis_index: { applied: false, key: REDIS_INDEX_KEY, count: 0 },
        stats: { total: 0, ready: 0, near_ready: 0, partial: 0, blocked: 0, avg_score: 0 },
        top: [],
        bottom: [],
      };
      fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
      fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });
      fs.writeFileSync(OUT_JSON, `${JSON.stringify(empty, null, 2)}\n`, 'utf8');
      fs.writeFileSync(OUT_MD, renderMarkdown(empty), 'utf8');
      fs.writeFileSync(OUT_NDJSON, '', 'utf8');
      return;
    }

    const ranked = rankRows(summaries);
    const redisIndex = {
      applied: false,
      key: REDIS_INDEX_KEY,
      count: ranked.length,
    };

    if (APPLY) {
      redis = new Redis(resolveRedisUrl(env), {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      });
      await redis.connect();
      await redis.ping();
      await writeRedisIndex(redis, ranked);
      redisIndex.applied = true;
    }

    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });

    const report = buildReport(ranked, redisIndex);
    fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(OUT_MD, renderMarkdown(report), 'utf8');
    fs.writeFileSync(
      OUT_NDJSON,
      ranked
        .map((row) => JSON.stringify({
          rank: row.rank,
          score: row.score,
          status: row.status,
          packet_id: row.packet_id,
          packet_ulid: row.packet_ulid,
          packet_key: row.packet_key,
          summary_packet_key: row.summary_packet_key,
          source_ref: row.source_ref,
          canonical_source_ref: row.canonical_source_ref,
          title_id: row.title_id,
          title_id_source: row.title_id_source,
          feature_id: row.feature_id,
          feature_label: row.feature_label,
          domain_class: row.domain_class,
          pagerank: row.pagerank,
          som_cluster: row.som_cluster,
          community_id: row.community_id,
          keywords: row.keywords,
          entities: row.entities,
          reasons: row.reasons,
        }))
        .join('\n') + '\n',
      'utf8',
    );

    log(`Ranked ${ranked.length} summary rows`);
    log(`Top score: ${ranked[0]?.score ?? 0} | status=${ranked[0]?.status ?? 'n/a'} | title_id=${ranked[0]?.title_id ?? 'n/a'}`);
    log(`Wrote ${path.relative(REPO_ROOT, OUT_JSON)}`);
    log(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}`);
    log(`Wrote ${path.relative(REPO_ROOT, OUT_NDJSON)}`);
  } catch (error) {
    console.error('[summary-index-ranker] fatal:', error);
    process.exitCode = 1;
  } finally {
    if (redis) await redis.quit().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main();
