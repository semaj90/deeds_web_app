#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_ROOT = path.resolve('C:\\Users\\james\\Documents\\Codex\\2026-05-12\\ve-updated-the-local-quantization-notebook');

const APP_REGISTRY = path.join(APP_ROOT, 'docs', 'atlas', 'feature-registry.json');
const ROOT_REGISTRY = path.join(DOCS_ROOT, 'docs', 'atlas', 'feature-registry.json');
const OUT_JSON = path.join(APP_ROOT, 'docs', 'reports', 'parent-atlas-overlay-sync-report.json');
const OUT_MD = path.join(APP_ROOT, 'docs', 'reports', 'parent-atlas-overlay-sync-report.md');

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function deriveKey(row) {
  return normalize(row?.feature_id ?? row?.featureKey ?? row?.title ?? row?.name ?? row?.feature);
}

async function readJson(file) {
  const text = await fs.readFile(file, 'utf8');
  return JSON.parse(text);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function summarizeRegistry(rows) {
  const ids = rows.map(deriveKey).filter(Boolean);
  return {
    rowCount: rows.length,
    uniqueCount: new Set(ids).size,
    sample: rows.slice(0, 5).map((row) => ({
      feature_id: row.feature_id ?? row.featureKey ?? row.title ?? row.name ?? null,
      status: row.status ?? null,
      storage_lane: row.storage_lane ?? null,
      retrieval_lane: row.retrieval_lane ?? null,
    })),
  };
}

function buildDiff(rootRows, appRows) {
  const appByKey = new Map();
  const rootKeys = new Set();
  for (const row of rootRows) {
    const key = deriveKey(row);
    if (key) rootKeys.add(key);
  }
  for (const row of appRows) {
    const key = deriveKey(row);
    if (!key) continue;
    if (!appByKey.has(key)) appByKey.set(key, row);
  }

  const rootMissingInApp = rootRows.filter((row) => !appByKey.has(deriveKey(row)));
  const appMissingInRoot = appRows.filter((row) => !rootKeys.has(deriveKey(row)));

  return {
    rootMatched: rootRows.length - rootMissingInApp.length,
    rootMissingInApp: rootMissingInApp.length,
    appMissingInRoot: appMissingInRoot.length,
    rootMissingSamples: rootMissingInApp.slice(0, 20).map((row) => ({
      feature_id: row.feature_id ?? row.featureKey ?? row.title ?? row.name ?? null,
      status: row.status ?? null,
      owner_file: row.owner_file ?? null,
    })),
    appOrphanSamples: appMissingInRoot.slice(0, 20).map((row) => ({
      feature_id: row.feature_id ?? row.featureKey ?? row.title ?? row.name ?? null,
      status: row.status ?? null,
      owner_file: row.owner_file ?? null,
    })),
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Parent Atlas Overlay Sync');
  lines.push('');
  lines.push(`- **classification**: ${report.summary.classification}`);
  lines.push(`- **rootRegistryRows**: ${report.summary.rootRegistryRows}`);
  lines.push(`- **appRegistryRows**: ${report.summary.appRegistryRows}`);
  lines.push(`- **rootMatchedInApp**: ${report.summary.rootMatchedInApp}`);
  lines.push(`- **rootMissingInApp**: ${report.summary.rootMissingInApp}`);
  lines.push(`- **appMissingInRoot**: ${report.summary.appMissingInRoot}`);
  lines.push('');
  lines.push('## Root Registry Samples');
  lines.push('');
  for (const row of report.root.sample) {
    lines.push(`- ${row.feature_id} | ${row.status ?? 'unknown'} | ${row.storage_lane ?? 'n/a'} | ${row.retrieval_lane ?? 'n/a'}`);
  }
  lines.push('');
  lines.push('## App Registry Samples');
  lines.push('');
  for (const row of report.app.sample) {
    lines.push(`- ${row.feature_id} | ${row.status ?? 'unknown'} | ${row.storage_lane ?? 'n/a'} | ${row.retrieval_lane ?? 'n/a'}`);
  }
  lines.push('');
  lines.push('## Missing In App');
  lines.push('');
  for (const row of report.diff.rootMissingSamples) {
    lines.push(`- ${row.feature_id} | ${row.status ?? 'unknown'} | ${row.owner_file ?? 'n/a'}`);
  }
  lines.push('');
  lines.push('## App Only');
  lines.push('');
  for (const row of report.diff.appOrphanSamples) {
    lines.push(`- ${row.feature_id} | ${row.status ?? 'unknown'} | ${row.owner_file ?? 'n/a'}`);
  }
  return lines.join('\n');
}

async function main() {
  const [rootExists, appExists] = await Promise.all([exists(ROOT_REGISTRY), exists(APP_REGISTRY)]);
  const report = {
    generatedAt: new Date().toISOString(),
    rootRegistryPath: ROOT_REGISTRY,
    appRegistryPath: APP_REGISTRY,
    sourceStatus: {
      rootRegistry: rootExists ? 'READY' : 'SOURCE_UNAVAILABLE',
      appRegistry: appExists ? 'READY' : 'SOURCE_UNAVAILABLE',
    },
    root: { rowCount: 0, uniqueCount: 0, sample: [] },
    app: { rowCount: 0, uniqueCount: 0, sample: [] },
    diff: {
      rootMatched: 0,
      rootMissingInApp: 0,
      appMissingInRoot: 0,
      rootMissingSamples: [],
      appOrphanSamples: [],
    },
    summary: {
      classification: 'SOURCE_UNAVAILABLE',
      rootRegistryRows: 0,
      appRegistryRows: 0,
      rootMatchedInApp: 0,
      rootMissingInApp: 0,
      appMissingInRoot: 0,
    },
  };

  if (rootExists) report.root = summarizeRegistry(await readJson(ROOT_REGISTRY));
  if (appExists) report.app = summarizeRegistry(await readJson(APP_REGISTRY));

  if (rootExists && appExists) {
    report.diff = buildDiff(await readJson(ROOT_REGISTRY), await readJson(APP_REGISTRY));
    report.summary = {
      classification:
        report.diff.rootMissingInApp === 0 && report.diff.rootMatched > 0
          ? 'SCHEMA_AND_SQL_ALIGNED'
          : 'OVERLAY_MISMATCH',
      rootRegistryRows: report.root.rowCount,
      appRegistryRows: report.app.rowCount,
      rootMatchedInApp: report.diff.rootMatched,
      rootMissingInApp: report.diff.rootMissingInApp,
      appMissingInRoot: report.diff.appMissingInRoot,
    };
  } else if (!rootExists && appExists) {
    report.summary = {
      classification: 'SOURCE_UNAVAILABLE',
      rootRegistryRows: 0,
      appRegistryRows: report.app.rowCount,
      rootMatchedInApp: 0,
      rootMissingInApp: 0,
      appMissingInRoot: report.diff.appMissingInRoot,
    };
  }

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');
  console.log(JSON.stringify({ ok: true, ...report.summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
