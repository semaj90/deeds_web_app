#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FORBIDDEN_FIELDS = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

function assertNoForbiddenFields(obj, label) {
  const raw = JSON.stringify(obj);
  for (const key of FORBIDDEN_FIELDS) {
    if (raw.includes(`"${key}"`)) {
      throw new Error(`Forbidden field "${key}" detected in ${label}`);
    }
  }
}

function readJsonSafe(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function dateStamp(iso) {
  return iso.slice(0, 10);
}

function normalizeRoot() {
  const cwd = process.cwd();
  if (cwd.endsWith('sveltekit-frontend')) {
    return {
      repoRoot: resolve(cwd, '..'),
      appRoot: cwd,
    };
  }
  return {
    repoRoot: cwd,
    appRoot: join(cwd, 'sveltekit-frontend'),
  };
}

function buildSourceRefs(paths) {
  return paths.map((p) => ({
    kind: 'local_code',
    path: p,
    note: 'generated from mega-audit artifacts',
  }));
}

function buildRows({ chunk2, chunk3, routeMap, generatedAt }) {
  const rows = [];
  const profile = 'mega_audit_contracts';

  const routeItems = chunk2?.questions?.routes_call_services ?? [];
  const storageItems = chunk2?.questions?.services_touch_storage ?? [];
  const bypassItems = chunk2?.questions?.files_bypass_bifrost_or_direct_llm ?? [];
  const routeCount = routeMap?.totalRoutes ?? 0;
  const routeWithTests = routeMap?.routeWithTests ?? 0;
  const routeWithSchemaRefs = routeMap?.routeWithSchemaRefs ?? 0;

  rows.push({
    query: 'Summarize route coverage and schema linkage from mega-audit reports.',
    instruction: 'Produce a compact reliability summary from route-schema-test and storage-memory audit artifacts.',
    input: JSON.stringify(
      {
        totalRoutes: routeCount,
        routesWithTests: routeWithTests,
        routesWithSchemaRefs: routeWithSchemaRefs,
        storageTouchpoints: storageItems.length,
        directBypassFiles: bypassItems.length,
      },
      null,
      0,
    ),
    output: [
      `totalRoutes=${routeCount}`,
      `routesWithTests=${routeWithTests}`,
      `routesWithSchemaRefs=${routeWithSchemaRefs}`,
      `storageTouchpoints=${storageItems.length}`,
      `directBypassFiles=${bypassItems.length}`,
    ].join('; '),
    profile,
    labels: ['contracts', 'coverage', 'storage'],
    sourceRefs: buildSourceRefs([
      '.tmp/mega-audit/chunk2-report.json',
      '.tmp/mega-audit/chunk3-storage-memory-integrity.json',
      '.tmp/mega-audit/route-schema-test-map.json',
    ]),
  });

  for (const item of routeItems) {
    rows.push({
      query: `Describe route dependency and store footprint: ${item.route}`,
      instruction: 'Given one API route, summarize service role, store footprint, and test presence.',
      input: JSON.stringify(
        {
          route: item.route,
          service: item.service,
          stores: item.stores ?? [],
          tests: item.tests ?? [],
          labels: item.labels ?? [],
        },
        null,
        0,
      ),
      output: [
        `route=${item.route}`,
        `service=${item.service ?? 'unknown'}`,
        `stores=${(item.stores ?? []).join('|') || 'none'}`,
        `tests=${(item.tests ?? []).length}`,
      ].join('; '),
      profile,
      labels: ['route', 'service-map', ...(item.labels ?? [])],
      sourceRefs: buildSourceRefs(['.tmp/mega-audit/chunk2-report.json']),
    });
  }

  for (const item of storageItems) {
    rows.push({
      query: `Summarize integrity risks for store ${item.store}`,
      instruction: 'Summarize storage role, risks, and implementation touchpoints.',
      input: JSON.stringify(
        {
          store: item.store,
          role: item.role,
          risks: item.risks ?? [],
          touchpoints: item.touchpoints ?? [],
        },
        null,
        0,
      ),
      output: [
        `store=${item.store}`,
        `role=${item.role ?? 'n/a'}`,
        `risks=${(item.risks ?? []).join('|') || 'none'}`,
        `touchpoints=${(item.touchpoints ?? []).length}`,
      ].join('; '),
      profile,
      labels: ['storage', 'integrity', 'risk'],
      sourceRefs: buildSourceRefs([
        '.tmp/mega-audit/chunk2-report.json',
        '.tmp/mega-audit/chunk3-storage-memory-integrity.json',
      ]),
    });
  }

  if (chunk3 && typeof chunk3 === 'object') {
    const keys = Object.keys(chunk3).filter((k) => k !== 'generatedAt');
    for (const key of keys) {
      const node = chunk3[key];
      const lineCount = typeof node?.lineCount === 'number' ? node.lineCount : null;
      const sample = Array.isArray(node?.sample) ? node.sample.slice(0, 3) : [];
      rows.push({
        query: `Summarize memory-integrity signal: ${key}`,
        instruction: 'Summarize one integrity signal from chunk3 storage-memory report.',
        input: JSON.stringify({ key, lineCount, sample }, null, 0),
        output: `signal=${key}; lineCount=${lineCount ?? 'n/a'}; sampleCount=${sample.length}`,
        profile,
        labels: ['storage', 'memory', 'integrity', key],
        sourceRefs: buildSourceRefs(['.tmp/mega-audit/chunk3-storage-memory-integrity.json']),
      });
    }
  }

  return rows.map((row, index) => {
    const timestamp = generatedAt;
    return {
      runId: `mega_audit_${dateStamp(timestamp)}_${String(index + 1).padStart(4, '0')}`,
      sessionId: null,
      userId: null,
      authUserId: null,
      query: row.query,
      profile: row.profile,
      acePacket: {
        datasetType: 'mega_audit_training',
        labels: row.labels,
      },
      toolCalls: [],
      sourceRefs: row.sourceRefs,
      cacheKeys: {},
      trustTier: 'local_code',
      model: 'analysis-only',
      validation: {
        sanitized: true,
      },
      instruction: row.instruction,
      input: row.input,
      output: row.output,
      createdAt: timestamp,
      datasetTimestamp: timestamp,
    };
  });
}

function toTurboVecRecords(rows) {
  return rows.map((row) => ({
    id: row.runId,
    text: [row.instruction, row.input, row.output].filter(Boolean).join('\n\n'),
    tags: row.acePacket?.labels ?? [],
    metadata: {
      source: 'mega-audit',
      profile: row.profile,
      trustTier: row.trustTier,
      sourceRefs: row.sourceRefs,
      createdAt: row.createdAt,
    },
  }));
}

function main() {
  const dryRun = hasFlag('dry-run');
  const skipTurboVec = hasFlag('no-turbovec');
  const customInputDir = arg('input-dir');

  const { repoRoot, appRoot } = normalizeRoot();
  const inputDir = customInputDir ? resolve(customInputDir) : join(appRoot, '.tmp', 'mega-audit');

  const chunk2Path = join(inputDir, 'chunk2-report.json');
  const chunk3Path = join(inputDir, 'chunk3-storage-memory-integrity.json');
  const routeMapPath = join(inputDir, 'route-schema-test-map.json');

  const chunk2 = readJsonSafe(chunk2Path);
  const chunk3 = readJsonSafe(chunk3Path);
  const routeMap = readJsonSafe(routeMapPath);

  if (!chunk2 || !routeMap) {
    console.error('Missing required mega-audit artifacts. Expected chunk2-report.json and route-schema-test-map.json.');
    process.exit(1);
  }

  const generatedAt = nowIso();
  const rows = buildRows({ chunk2, chunk3, routeMap, generatedAt });
  assertNoForbiddenFields(rows, 'rows');

  const day = dateStamp(generatedAt);
  const synthesisDir = join(repoRoot, 'memory', 'datasets', 'llm_synthesis');
  const synthesisPath = join(synthesisDir, `${day}.jsonl`);

  const turboVecDir = join(appRoot, '.tmp', 'turbovec');
  const turboVecPath = join(turboVecDir, `mega-audit-${day}.jsonl`);
  const turboVecRecords = toTurboVecRecords(rows);
  assertNoForbiddenFields(turboVecRecords, 'turbovecRecords');

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'dry-run',
      inputDir,
      rowCount: rows.length,
      synthesisPath,
      turboVecPath: skipTurboVec ? null : turboVecPath,
      sample: rows[0] ?? null,
    }, null, 2));
    return;
  }

  ensureDir(synthesisDir);
  for (const row of rows) {
    appendFileSync(synthesisPath, `${JSON.stringify(row)}\n`, 'utf8');
  }

  if (!skipTurboVec) {
    ensureDir(turboVecDir);
    writeFileSync(turboVecPath, `${turboVecRecords.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    rowCount: rows.length,
    synthesisPath,
    turboVecPath: skipTurboVec ? null : turboVecPath,
    sources: {
      chunk2Path,
      chunk3Path: existsSync(chunk3Path) ? chunk3Path : null,
      routeMapPath,
    },
  }, null, 2));
}

main();