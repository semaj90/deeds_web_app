#!/usr/bin/env node
/**
 * Read-only recommendation merge audit.
 *
 * Reports the current recommendation snapshot size, source surfaces, and
 * likely reasons a historical collapse claim may be stale in this workspace.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const OUT_JSON = path.join(ROOT, 'docs', 'reports', 'recommendation-merge-audit-report.json');
const OUT_MD = path.join(ROOT, 'docs', 'reports', 'recommendation-merge-audit-report.md');
const SNAPSHOT = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const EVENTS = path.join(ROOT, '.opencode', 'recommendations', 'recommendation-events.jsonl');
const GRAPH = path.join(ROOT, 'docs', 'graph', 'recommendations.json');
const LEGACY = path.join(ROOT, 'docs', 'phase100', 'feature-recommendations.json');
const NEXT_MOVES = path.join(ROOT, 'memory', 'exports', 'next-moves-recommendation.json');

function safeJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  if (!existsSync(filePath)) return '';
  try {
    return fsSync.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function countJsonlLines(filePath) {
  if (!existsSync(filePath)) return 0;
  try {
    const text = fsSync.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

function summarizeSnapshot(payload) {
  const clusters = payload?.clusters && typeof payload.clusters === 'object' ? payload.clusters : {};
  const all = Object.values(clusters).flatMap((rows) => (Array.isArray(rows) ? rows : []));
  return {
    totalCount: Number(payload?.totalCount ?? all.length ?? 0),
    clusterCount: Object.keys(clusters).length,
    top10Count: Array.isArray(payload?.top10) ? payload.top10.length : 0,
    titles: all.slice(0, 8).map((row) => row?.title).filter(Boolean),
    types: [...new Set(all.map((row) => row?.type).filter(Boolean))],
  };
}

function buildReport() {
  const snapshot = safeJson(SNAPSHOT);
  const graph = safeJson(GRAPH);
  const legacy = safeJson(LEGACY);
  const nextMoves = safeJson(NEXT_MOVES);
  const eventsCount = countJsonlLines(EVENTS);
  const snapshotSummary = summarizeSnapshot(snapshot);

  const likelyReasons = [];
  if (snapshotSummary.totalCount <= 5) {
    likelyReasons.push('current snapshot is intentionally small and gate-filtered');
  }
  if (snapshotSummary.types.some((t) => String(t).includes('missing_feature'))) {
    likelyReasons.push('recommendations are dominated by missing_feature gates');
  }
  if (eventsCount > 0 && snapshotSummary.totalCount < eventsCount) {
    likelyReasons.push('append-only recommendation events outnumber the current merged snapshot');
  }
  if (!graph) likelyReasons.push('docs/graph/recommendations.json is absent or unreadable');
  if (!legacy) likelyReasons.push('legacy feature recommendation source is absent or unreadable');
  if (!nextMoves) likelyReasons.push('memory/export next-moves snapshot is absent or unreadable');

  return {
    generatedAt: new Date().toISOString(),
    paths: {
      snapshot: path.relative(ROOT, SNAPSHOT).replace(/\\/g, '/'),
      events: path.relative(ROOT, EVENTS).replace(/\\/g, '/'),
      graph: path.relative(ROOT, GRAPH).replace(/\\/g, '/'),
      legacy: path.relative(ROOT, LEGACY).replace(/\\/g, '/'),
      nextMoves: path.relative(ROOT, NEXT_MOVES).replace(/\\/g, '/'),
    },
    snapshot: snapshotSummary,
    eventsCount,
    sources: {
      hasSnapshot: !!snapshot,
      hasGraph: !!graph,
      hasLegacy: !!legacy,
      hasNextMoves: !!nextMoves,
    },
    likelyReasons,
  };
}

function toMarkdown(report) {
  return [
    `# Recommendation Merge Audit`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `## Snapshot`,
    `- totalCount: ${report.snapshot.totalCount}`,
    `- clusterCount: ${report.snapshot.clusterCount}`,
    `- top10Count: ${report.snapshot.top10Count}`,
    `- eventsCount: ${report.eventsCount}`,
    '',
    `## Source Surfaces`,
    `- .opencode/recommendations/recommendations.json: ${report.sources.hasSnapshot ? 'present' : 'missing'}`,
    `- .opencode/recommendations/recommendation-events.jsonl: ${report.eventsCount > 0 ? 'present' : 'missing'}`,
    `- docs/graph/recommendations.json: ${report.sources.hasGraph ? 'present' : 'missing'}`,
    `- docs/phase100/feature-recommendations.json: ${report.sources.hasLegacy ? 'present' : 'missing'}`,
    `- memory/exports/next-moves-recommendation.json: ${report.sources.hasNextMoves ? 'present' : 'missing'}`,
    '',
    `## Likely Reasons`,
    ...(report.likelyReasons.length ? report.likelyReasons.map((line) => `- ${line}`) : ['- none detected']),
    '',
    `## Recommendation Types`,
    ...(report.snapshot.types.length ? report.snapshot.types.map((type) => `- ${type}`) : ['- none']),
  ].join('\n');
}

async function main() {
  const report = buildReport();
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, toMarkdown(report) + '\n', 'utf8');

  console.log(`Recommendation snapshot totalCount: ${report.snapshot.totalCount}`);
  console.log(`Recommendation snapshot clusterCount: ${report.snapshot.clusterCount}`);
  console.log(`Recommendation events: ${report.eventsCount}`);
  for (const reason of report.likelyReasons) console.log(`- ${reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
