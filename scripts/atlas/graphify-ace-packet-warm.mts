#!/usr/bin/env node
/**
 * Graphify ACE packet warm-up.
 *
 * Reads the current codebase graph once, selects a bounded deduplicated hot
 * file set, builds the shared KV/ACE packet contract, and stores one stable
 * Redis packet per graph revision.
 */

import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from './connection-config.mjs';
import { buildKvContextPacket, formatKvPacketForPrompt } from '../../sveltekit-frontend/src/lib/server/features/ai/ai/kv-context-controller.ts';
import { getValkeyClient } from '../../sveltekit-frontend/src/lib/server/cache/valkey-client.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const FRONTEND_ROOT = resolve(ROOT, 'sveltekit-frontend');

Object.assign(process.env, loadRepoEnv(process.env));

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(...args: unknown[]) {
  if (VERBOSE) console.log(...args);
}

function isGeneratedPath(rel: string): boolean {
  return (
    rel.startsWith('.claude/worktrees/') ||
    rel.startsWith('.tmp/') ||
    rel.startsWith('node_modules/') ||
    rel.startsWith('dist/') ||
    rel.startsWith('build/') ||
    rel.startsWith('coverage/')
  );
}

function scoreFile(file: Record<string, unknown>): number {
  const fanIn = Number(file.fanIn ?? file.directFanIn ?? 0);
  const lineCount = Number(file.lineCount ?? 0);
  const authBonus = file.hasAuth ? 40 : 0;
  const zodBonus = file.hasZod ? 25 : 0;
  const routeBonus = file.isRoute ? 30 : 0;
  const testPenalty = file.isTest ? -20 : 0;
  return fanIn * 10 + lineCount / 25 + authBonus + zodBonus + routeBonus + testPenalty;
}

function uniqueStrings(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, limit);
}

async function readGraphJson(): Promise<{ path: string; graph: Record<string, unknown> } | null> {
  const candidates = [
    resolve(FRONTEND_ROOT, 'docs/graph/codebase-graph.json'),
    resolve(ROOT, 'docs/graph/codebase-graph.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const text = await fs.readFile(candidate, 'utf8');
    try {
      return { path: candidate, graph: JSON.parse(text) as Record<string, unknown> };
    } catch (err) {
      throw new Error(`Failed to parse ${candidate}: ${(err as Error).message}`);
    }
  }

  return null;
}

function normalizeGraphFiles(graph: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(graph.files)) return [];
  return graph.files
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      rel: String(entry.rel ?? entry.path ?? '').trim(),
    }))
    .filter((entry) => entry.rel.length > 0 && !isGeneratedPath(entry.rel))
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.rel === entry.rel) === index)
    .sort((a, b) => {
      const isTestA = Boolean(a.isTest);
      const isTestB = Boolean(b.isTest);
      if (isTestA !== isTestB) return Number(isTestA) - Number(isTestB);
      const scoreB = scoreFile(b);
      const scoreA = scoreFile(a);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.rel.localeCompare(b.rel);
    });
}

function buildHotSymbols(selectedFiles: Array<Record<string, unknown>>): string[] {
  const symbols: string[] = [];
  for (const file of selectedFiles) {
    const rel = String(file.rel ?? '').trim();
    if (rel) symbols.push(rel.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? rel);
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

async function main() {
  const graphInfo = await readGraphJson();
  if (!graphInfo) {
    throw new Error('codebase-graph.json not found — run npm run graphify:daily first');
  }

  const graph = graphInfo.graph;
  const selectedFiles = normalizeGraphFiles(graph).slice(0, 8);
  if (selectedFiles.length === 0) {
    throw new Error(`No eligible files found in ${graphInfo.path}`);
  }

  const hotFiles = uniqueStrings(selectedFiles.map((file) => String(file.rel ?? '')), 8);
  const hotSymbols = buildHotSymbols(selectedFiles);
  const blockedAreas: string[] = [];
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
  const query = `graphify daily warm packet (${String(graph.mode ?? 'fast-ast')})`;

  log('[graphify:ace:warm] graph path:', graphInfo.path);
  log('[graphify:ace:warm] hot files:', hotFiles);
  log('[graphify:ace:warm] hot symbols:', hotSymbols);

  const kvPacket = await buildKvContextPacket({
    taskId,
    query,
    hotFiles,
    hotSymbols,
    blockedAreas,
  });
  const kvContextBlock = formatKvPacketForPrompt(kvPacket);

  const packet = {
    schemaVersion: 'ace.graphify.packet.v1',
    packetKey: `ace:packet:${taskId}`,
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
    kvContext: {
      taskId: kvPacket.taskId,
      stablePrefixHash: kvPacket.stablePrefixHash,
      level1Runtime: kvPacket.level1Runtime,
      level2Compressed: kvPacket.level2Compressed,
      level3AttentionToc: kvPacket.level3AttentionToc,
      tokenBudget: kvPacket.tokenBudget,
    },
    promptBlock: kvContextBlock,
    generatedAt: new Date().toISOString(),
  };

  const packetStr = JSON.stringify(packet);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    graphPath: graphInfo.path,
    packetKey: packet.packetKey,
    hotFileCount: hotFiles.length,
    hotSymbolCount: hotSymbols.length,
    packetBytes: Buffer.byteLength(packetStr, 'utf8'),
    packetSha256: createHash('sha256').update(packetStr).digest('hex'),
    status: 'pending',
  };

  if (!DRY_RUN) {
    const redis = getValkeyClient();
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.set(packet.packetKey, packetStr, 'EX', 3600);
    report.status = 'written';
  } else {
    report.status = 'dry-run';
  }

  const outDir = resolve(ROOT, '.tmp', 'graphify');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    join(outDir, 'graphify-ace-packet-warm-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...report,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`[graphify:ace:warm] ${(error as Error).message}`);
  process.exit(1);
});
