#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limitIndex = args.indexOf('--limit');
const LIMIT = Number.parseInt(
  limitArg?.split('=')[1] ?? (limitIndex >= 0 ? args[limitIndex + 1] : '') ?? '',
  10,
);
const collectionArg = args.find((arg) => arg.startsWith('--collection='));
const collectionIndex = args.indexOf('--collection');

const INPUT_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'som-coordinate-coverage-report.json');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'som-coordinate-backfill-report.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'som-coordinate-backfill-report.md');

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointIdValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isSafeInteger(numeric) ? numeric : text;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

function collectPatchRows(report) {
  const detailRows = Object.values(report.details ?? {});
  const patchable = [];

  for (const row of detailRows) {
    const pointId = pointIdValue(row.pointId);
    const derived = row.derivedCoords ?? {};
    const somRow = finiteNumber(derived.somRow);
    const somCol = finiteNumber(derived.somCol);
    const somCluster = finiteNumber(derived.somCluster);
    const clusterId = finiteNumber(derived.clusterId);

    if (pointId === null || somRow === null || somCol === null) continue;
    if (!String(row.classification ?? '').startsWith('RECOVERABLE_FROM_')) continue;

    patchable.push({
      pointId,
      sourceRef: row.sourceRef ?? null,
      classification: row.classification,
      derivedFrom: row.derivedFrom ?? null,
      payload: {
        somRow,
        somCol,
        som_cluster: somCluster ?? `${somRow}:${somCol}`,
        gpuCluster: clusterId ?? somCluster ?? `${somRow}:${somCol}`,
      },
    });
  }

  const limited = Number.isFinite(LIMIT) && LIMIT > 0 ? patchable.slice(0, LIMIT) : patchable;
  return limited;
}

async function patchPoint(QDRANT_URL, collection, row) {
  const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: row.payload,
      points: [row.pointId],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Qdrant payload patch failed for ${row.pointId}: HTTP ${response.status} ${body.slice(0, 200)}`);
  }
}

async function main() {
  loadAtlasEnv();
  const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
  const QDRANT_COLLECTION =
    collectionArg?.split('=')[1]
    ?? (collectionIndex >= 0 ? args[collectionIndex + 1] : null)
    ?? process.env.CODEBASE_QDRANT_COLLECTION
    ?? 'codebase_chunks_768';
  const report = await readJson(INPUT_REPORT);
  const rows = collectPatchRows(report);

  const results = [];
  let written = 0;
  let failed = 0;

  for (const row of rows) {
    if (!APPLY) {
      results.push({ ...row, status: 'DRY_RUN' });
      continue;
    }

    try {
      await patchPoint(QDRANT_URL, QDRANT_COLLECTION, row);
      written += 1;
      results.push({ ...row, status: 'WRITTEN' });
    } catch (err) {
      failed += 1;
      results.push({ ...row, status: 'FAILED', error: String(err?.message ?? err) });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    inputReport: path.relative(REPO_ROOT, INPUT_REPORT),
    qdrantUrl: QDRANT_URL,
    collection: QDRANT_COLLECTION,
    candidateRows: rows.length,
    written,
    failed,
    rows: results,
  };

  await writeJson(OUT_JSON, output);
  await writeText(OUT_MD, [
    '# SOM Coordinate Backfill Report',
    '',
    `Generated: ${output.generatedAt}`,
    `Mode: ${output.mode}`,
    `Input report: ${output.inputReport}`,
    `Collection: ${output.collection}`,
    '',
    '## Summary',
    '',
    `- candidate rows: ${output.candidateRows}`,
    `- written: ${output.written}`,
    `- failed: ${output.failed}`,
    '',
    '## Samples',
    '',
    ...output.rows.slice(0, 25).map((row) => `- ${row.pointId} | ${row.status} | ${row.sourceRef ?? 'n/a'} | payload=${JSON.stringify(row.payload)}`),
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    ok: failed === 0,
    mode: output.mode,
    candidateRows: output.candidateRows,
    written,
    failed,
    reportJson: OUT_JSON,
    reportMd: OUT_MD,
  }, null, 2));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
