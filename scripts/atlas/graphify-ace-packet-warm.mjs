#!/usr/bin/env node
/**
 * Graphify ACE packet warm-up.
 *
 * Reads the current codebase graph, selects a bounded deduplicated hot-file
 * set, and writes one stable ACE packet per graph revision to Valkey.
 *
 * This is intentionally plain Node so startup stays cheap.
 */

import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import { loadRepoEnv } from './connection-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const FRONTEND_ROOT = resolve(ROOT, 'sveltekit-frontend');

Object.assign(process.env, loadRepoEnv(process.env));

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(...args) {
  if (VERBOSE) console.log(...args);
}

function isGeneratedPath(rel) {
  return (
    rel.startsWith('.claude/worktrees/') ||
    rel.startsWith('.tmp/') ||
    rel.startsWith('node_modules/') ||
    rel.startsWith('dist/') ||
    rel.startsWith('build/') ||
    rel.startsWith('coverage/')
  );
}

function scoreFile(file) {
  const fanIn = Number(file.fanIn ?? file.directFanIn ?? 0);
  const lineCount = Number(file.lineCount ?? 0);
  const authBonus = file.hasAuth ? 40 : 0;
  const zodBonus = file.hasZod ? 25 : 0;
  const routeBonus = file.isRoute ? 30 : 0;
  const testPenalty = file.isTest ? -20 : 0;
  return fanIn * 10 + lineCount / 25 + authBonus + zodBonus + routeBonus + testPenalty;
}

function uniqueStrings(values, limit) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, limit);
}

async function readGraphJson() {
  const candidates = [
    resolve(FRONTEND_ROOT, 'docs/graph/codebase-graph.json'),
    resolve(ROOT, 'docs/graph/codebase-graph.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const text = await fs.readFile(candidate, 'utf8');
    return { path: candidate, graph: JSON.parse(text) };
  }

  return null;
}

function selectHotFiles(graphFiles) {
  const picked = [];
  const seen = new Set();

  for (const raw of graphFiles) {
    const rel = String(raw?.rel ?? raw?.path ?? '').trim();
    if (!rel || isGeneratedPath(rel) || seen.has(rel)) continue;

    const normalized = {
      ...raw,
      rel,
      _score: scoreFile(raw),
    };

    seen.add(rel);

    if (picked.length < 8) {
      picked.push(normalized);
      picked.sort((a, b) => b._score - a._score || a.rel.localeCompare(b.rel));
      continue;
    }

    const weakestIndex = picked.length - 1;
    if (normalized._score > picked[weakestIndex]._score) {
      picked[weakestIndex] = normalized;
      picked.sort((a, b) => b._score - a._score || a.rel.localeCompare(b.rel));
    }
  }

  return picked.map(({ _score, ...file }) => file);
}

function buildHotSymbols(selectedFiles) {
  const symbols = [];

  for (const file of selectedFiles) {
    const rel = String(file.rel ?? '').trim();
    if (rel) {
      symbols.push(rel.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? rel);
    }
    if (Array.isArray(file.exports)) {
      for (const item of file.exports) symbols.push(String(item));
    }
    if (Array.isArray(file.tags)) {
      for (const item of file.tags) symbols.push(String(item));
    }
    if (Array.isArray(file.routeHandlers)) {
      for (const item of file.routeHandlers) symbols.push(String(item));
    }
  }

  return uniqueStrings(symbols, 12);
}

function buildPromptBlock({ taskId, hotFiles, hotSymbols, graph }) {
  return [
    `ACE packet warm-up: ${taskId}`,
    `Graph revision: ${String(graph.createdAt ?? '')}`,
    `Hot files (${hotFiles.length}):`,
    ...hotFiles.map((file) => `  - ${file}`),
    `Hot symbols (${hotSymbols.length}):`,
    ...hotSymbols.map((symbol) => `  - ${symbol}`),
    'Blocked areas: (none)',
  ].join('\n');
}

async function main() {
  const graphInfo = await readGraphJson();
  if (!graphInfo) {
    throw new Error('codebase-graph.json not found — run npm run graphify:daily first');
  }

  const graph = graphInfo.graph;
  const selectedFiles = selectHotFiles(Array.isArray(graph.files) ? graph.files : []);
  if (selectedFiles.length === 0) {
    throw new Error(`No eligible files found in ${graphInfo.path}`);
  }

  const hotFiles = uniqueStrings(selectedFiles.map((file) => String(file.rel ?? '')), 8);
  const hotSymbols = buildHotSymbols(selectedFiles);
  const graphFingerprint = createHash('sha256')
    .update([
      String(graph.mode ?? 'fast-ast'),
      String(graph.createdAt ?? ''),
      String(graph.fileCount ?? hotFiles.length),
      hotFiles.join('|'),
      hotSymbols.join('|'),
    ].join('\n'))
    .digest('hex');

  const taskId = `graphify-daily-${graphFingerprint.slice(0, 16)}`;
  const packetKey = `ace:packet:${taskId}`;

  const packet = {
    schemaVersion: 'ace.graphify.packet.v1',
    packetKey,
    packetKind: 'graphify-daily',
    graph: {
      path: graphInfo.path,
      mode: String(graph.mode ?? 'fast-ast'),
      createdAt: String(graph.createdAt ?? ''),
      fileCount: Number(graph.fileCount ?? selectedFiles.length),
      hotFileCount: hotFiles.length,
      hotSymbolCount: hotSymbols.length,
      fingerprint: graphFingerprint,
    },
    hotFiles,
    hotSymbols,
    promptBlock: buildPromptBlock({ taskId, hotFiles, hotSymbols, graph }),
    generatedAt: new Date().toISOString(),
  };

  const packetStr = JSON.stringify(packet);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    graphPath: graphInfo.path,
    packetKey,
    hotFileCount: hotFiles.length,
    hotSymbolCount: hotSymbols.length,
    packetBytes: Buffer.byteLength(packetStr, 'utf8'),
    packetSha256: createHash('sha256').update(packetStr).digest('hex'),
    status: DRY_RUN ? 'dry-run' : 'pending',
  };

  if (!DRY_RUN) {
    const redis = new Redis(process.env.VALKEY_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      family: 4,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.set(packetKey, packetStr, 'EX', 3600);
    report.status = 'written';
    try {
      await redis.quit();
    } catch {
      // ignore
    }
  }

  const outDir = resolve(ROOT, '.tmp', 'graphify');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    join(outDir, 'graphify-ace-packet-warm-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
}

main().catch((error) => {
  console.error(`[graphify:ace:warm] ${(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
