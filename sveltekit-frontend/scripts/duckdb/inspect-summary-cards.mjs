#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(process.cwd());
const DUCKDB = process.env.DUCKDB_BIN || 'duckdb';

const FILES = {
  top100Json: resolve(ROOT, 'memory/cards/top-100-codebase-summary-cards.json'),
  cardsJsonl: resolve(ROOT, 'memory/cards/codebase-summary-cards.jsonl'),
  laneReport: resolve(ROOT, 'docs/reports/summary-card-lane-report.json'),
};

function mustExist(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`missing required file: ${filePath}`);
  }
}

function runDuckdb(sql) {
  const res = spawnSync(DUCKDB, ['-c', sql], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || '').trim() || `duckdb exited ${res.status}`);
  }
  return (res.stdout || '').trim();
}

function runDuckdbJson(sql) {
  const res = spawnSync(DUCKDB, ['-json', '-c', sql], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || '').trim() || `duckdb exited ${res.status}`);
  }
  return JSON.parse(res.stdout || '[]');
}

function main() {
  for (const file of Object.values(FILES)) mustExist(file);
  let top100Count = 0;
  let typeCounts = '';
  let topPaths = '';
  let degraded = false;

  try {
    const rows = runDuckdbJson(`SELECT len(cards) AS n FROM read_json_auto('${FILES.top100Json.replace(/'/g, "''")}');`);
    top100Count = Number(rows[0]?.n ?? 0);
    typeCounts = runDuckdb(`SELECT summary_type, COUNT(*) AS cnt FROM read_json_auto('${FILES.cardsJsonl.replace(/'/g, "''")}') GROUP BY 1 ORDER BY 2 DESC;`);
    topPaths = runDuckdb(`SELECT c.path, c.scores.rank_score FROM (SELECT unnest(cards) AS c FROM read_json_auto('${FILES.top100Json.replace(/'/g, "''")}')) ORDER BY 2 DESC LIMIT 10;`);
  } catch (error) {
    degraded = true;
    const top = JSON.parse(readFileSync(FILES.top100Json, 'utf8'));
    const rows = Array.isArray(top.cards) ? top.cards : [];
    top100Count = rows.length;
    const byType = new Map();
    for (const row of rows) {
      const t = String(row.summary_type || 'unknown');
      byType.set(t, (byType.get(t) || 0) + 1);
    }
    typeCounts = JSON.stringify(Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])));
    topPaths = JSON.stringify(rows.slice(0, 10).map((row) => ({ path: row.path, score: row?.scores?.rank_score ?? 0 })));
  }

  const lane = JSON.parse(readFileSync(FILES.laneReport, 'utf8'));

  console.log(JSON.stringify({
    ok: true,
    duckdb: DUCKDB,
    degraded,
    files: Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, v.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/')])),
    counts: {
      top100: top100Count,
      sourceFiles: lane.sourceFiles ?? null,
      cardTypes: lane.cardTypes ?? {},
    },
    typeCountsPreview: typeCounts,
    topPathsPreview: topPaths,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[duckdb:cards:inspect] ${error?.message ?? String(error)}`);
  process.exit(1);
}
