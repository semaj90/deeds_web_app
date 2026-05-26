#!/usr/bin/env node
/**
 * Export the current top attention rows from the codebase map into a stable artifact.
 *
 * Primary source:
 *   - docs/graph/codebase-map.md Directory Scorecard (already ranked)
 * Secondary fallback:
 *   - Redis key couchdb:pagerank_scores
 *   - docs/graph/codebase-graph.json fanIn ordering
 *
 * Output:
  *   - docs/graph/codebase-pagerank-top100.json
  *   - docs/graph/codebase-pagerank-top100.md
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'docs/graph/codebase-map.md');
const GRAPH_PATH = path.join(ROOT, 'docs/graph/codebase-graph.json');
const OUT_JSON = path.join(ROOT, 'docs/graph/codebase-pagerank-top100.json');
const OUT_MD = path.join(ROOT, 'docs/graph/codebase-pagerank-top100.md');
const LIMIT = 100;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function loadGraphFallback() {
  try {
    const raw = await readFile(GRAPH_PATH, 'utf8');
    const graph = JSON.parse(raw);
    const files = Array.isArray(graph.files) ? graph.files : [];
    return files
      .filter((file) => toNumber(file.fanIn, 0) > 0)
      .sort((a, b) => toNumber(b.fanIn, 0) - toNumber(a.fanIn, 0))
      .slice(0, LIMIT)
      .map((file, index) => ({
        rank: index + 1,
        rel: file.rel,
        score: toNumber(file.fanIn, 0),
        source: 'fanin',
      }));
  } catch {
    return [];
  }
}

async function loadDirectoryScorecard() {
  try {
    const raw = await readFile(MAP_PATH, 'utf8');
    const rows = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('| ⚠️ |') && !line.startsWith('| ✅ |')) continue;
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      if (parts.length < 9) continue;
      const [status, directory, score, files, lines, apis, authZod, todos, flags] = parts;
      const parsedScore = Number(score);
      if (!Number.isFinite(parsedScore)) continue;
      rows.push({
        rank: rows.length + 1,
        directory,
        score: parsedScore,
        files: Number(files) || 0,
        lines: Number(lines) || 0,
        apis: Number(apis) || 0,
        authZod,
        todos: Number(todos) || 0,
        flags,
        status,
        source: 'codebase-map',
      });
      if (rows.length >= LIMIT) break;
    }
    return rows;
  } catch {
    return [];
  }
}

async function loadRedisScores() {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      connectTimeout: 3000,
    });
    await redis.connect();
    const raw = await redis.get('couchdb:pagerank_scores');
    await redis.quit().catch(() => {});
    if (!raw) return null;

    const scores = JSON.parse(raw);
    if (!scores || typeof scores !== 'object') return null;

    return Object.entries(scores)
      .map(([rel, score]) => ({ rel, score: toNumber(score, 0), source: 'redis' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT)
      .map((row, index) => ({ rank: index + 1, ...row }));
  } catch {
    return null;
  }
}

async function main() {
  const mapTop = await loadDirectoryScorecard();
  const redisTop = mapTop.length ? null : await loadRedisScores();
  const rows = mapTop.length ? mapTop : (redisTop?.length ? redisTop : await loadGraphFallback());
  const generatedAt = new Date().toISOString();

  await mkdir(path.dirname(OUT_JSON), { recursive: true });
  await writeFile(
    OUT_JSON,
    `${JSON.stringify({ generatedAt, limit: LIMIT, source: mapTop.length ? 'codebase-map' : (redisTop?.length ? 'redis' : 'fanin'), rows }, null, 2)}\n`,
    'utf8',
  );

  const md = [
    '# Codebase PageRank Top 100',
    '',
    `- generatedAt: ${generatedAt}`,
    `- limit: ${LIMIT}`,
    `- source: ${mapTop.length ? 'codebase-map' : (redisTop?.length ? 'redis' : 'fanin')}`,
    '',
    '## Top Entries',
    '',
    ...rows.map((row) => {
      const label = row.directory ?? row.rel ?? '(unknown)';
      return `- #${row.rank} ${label} (${row.score}) [${row.source}]`;
    }),
    '',
  ].join('\n');

  await writeFile(OUT_MD, md, 'utf8');

  console.log(`✅ wrote ${OUT_JSON}`);
  console.log(`✅ wrote ${OUT_MD}`);
  console.log(`   rows=${rows.length} source=${mapTop.length ? 'codebase-map' : (redisTop?.length ? 'redis' : 'fanin')}`);
}

main().catch((error) => {
  console.error('❌ export-codebase-pagerank-top failed:', error);
  process.exit(1);
});
