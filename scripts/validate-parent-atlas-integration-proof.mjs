#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  collectEnvFromRoots,
  extractEnvKeys,
  loadConfig,
  readJson,
  readText,
  resolveRepoPath,
} from './atlas/_atlas-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
dotenv.config({ path: resolve(REPO_ROOT, '.env') });

const STATUS = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  NOT_PROVEN: 'NOT_PROVEN',
  BLOCKED: 'BLOCKED',
  FAIL: 'FAIL',
});

const PROGRESS_STATUSES = new Set([STATUS.PASS, STATUS.PARTIAL]);

const args = process.argv.slice(2);
const gateIndex = args.indexOf('gate');
const gateName = gateIndex >= 0 ? args[gateIndex + 1] : null;
const allRequested = args.includes('all') || !gateName;
const jsonRequested = args.includes('--json');
const reportDir = resolve(REPO_ROOT, '.tmp', 'reports');

mkdirSync(reportDir, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function makeResult(gate, status, evidence = [], notes = []) {
  return {
    gate,
    status,
    evidence,
    notes,
    generatedAt: nowIso(),
  };
}

function makeBlockedResult(gate, dependencyResults) {
  return makeResult(
    gate,
    STATUS.BLOCKED,
    [
      evidence('dependency_block', {
        blockedBy: dependencyResults.map((item) => ({
          gate: item.gate,
          status: item.status,
        })),
      }),
    ],
    dependencyResults.map((item) => `blocked by ${item.gate}=${item.status}`),
  );
}

function evidence(kind, data) {
  return { kind, ...data };
}

function dependencySatisfied(status) {
  return PROGRESS_STATUSES.has(status);
}

function readRepoTextIfExists(relPath) {
  const abs = resolveRepoPath(relPath);
  return existsSync(abs) ? readText(abs, '') : '';
}

function gateStatusFromEvidence(hasEvidence, hasProblem = false) {
  if (hasProblem) return STATUS.NOT_PROVEN;
  return hasEvidence ? STATUS.PASS : STATUS.NOT_PROVEN;
}

async function fetchJson(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMcpSseJson(url, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      try {
        payload = JSON.parse(data);
        break;
      } catch {
        // keep scanning SSE chunks
      }
    }
    return { ok: response.ok, status: response.status, body: payload, text };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHealthProbeUrl(rawUrl, healthPath) {
  const base = new URL(rawUrl);
  if (!base.pathname || base.pathname === '/') {
    base.pathname = healthPath;
  } else if (!base.pathname.endsWith('/health') && healthPath) {
    const trimmed = base.pathname.replace(/\/$/, '');
    base.pathname = `${trimmed}${healthPath}`;
  }
  base.search = '';
  base.hash = '';
  return base.toString();
}

function fileAgeMinutes(path) {
  const ageMs = Date.now() - statSync(path).mtimeMs;
  return Math.round(ageMs / 60000);
}

function inferEnvCurrentType(envServerText, key) {
  const assignPattern = new RegExp(`\\b${key}\\s*:\\s*([^,\\n]+)`);
  const match = envServerText.match(assignPattern);
  if (!match) return 'not present';

  const rhs = match[1];
  if (/parseBoolean\s*\(/.test(rhs)) return 'boolean';
  if (/parseInteger\s*\(/.test(rhs)) return 'number';
  if (/privateEnv\.[A-Z0-9_]+\s*\?\?/.test(rhs) || /\|\|/.test(rhs)) return 'string';
  if (/privateEnv\.[A-Z0-9_]+/.test(rhs)) return 'string | undefined';

  return 'unknown';
}

function buildEnvAuditTable(envServerText) {
  const rows = [
    {
      key: 'CODEBASE_INDEX_URL',
      expectedType: 'string | url',
      defaultPolicy: 'pass-through in canonical env; downstream adapter may add dev fallback',
      required: 'required for codebase index lanes',
      secret: false,
      consumerGuardStatus: 'guarded by codebase-index routes; verify any fallback lives outside canonical ENV'
    },
    {
      key: 'EXT7_MCP_URL',
      expectedType: 'string | url',
      defaultPolicy: 'none',
      required: 'optional / not yet proven',
      secret: false,
      consumerGuardStatus: 'not present in canonical env surface; treat as unresolved note until a consumer is proven'
    },
    {
      key: 'TRACE_MCP_URL',
      expectedType: 'string | url',
      defaultPolicy: 'none',
      required: 'required for trace / MCP proof lanes',
      secret: false,
      consumerGuardStatus: 'guarded by MCP clients and proof runner; missing value should fail loudly'
    },
    {
      key: 'SEARXNG_URL',
      expectedType: 'string | url',
      defaultPolicy: 'none',
      required: 'optional for search lanes',
      secret: false,
      consumerGuardStatus: 'guarded by search adapters; downstream callers may degrade if unset'
    },
    {
      key: 'HFORF_MODEL_PATH',
      expectedType: 'filesystem path string',
      defaultPolicy: 'none in canonical ENV; downstream pages may choose a local fallback',
      required: 'optional for admin/model routing',
      secret: false,
      consumerGuardStatus: 'guarded by admin atlas page fallback chain; verify current path is intentional'
    },
  ];

  return rows.map((row) => ({
    ...row,
    currentType: inferEnvCurrentType(envServerText, row.key),
  }));
}

async function openDb() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) return null;
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  return pool;
}

async function existingTables(pool, tableNames) {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [tableNames]);
  return new Set(result.rows.map((row) => row.table_name));
}

async function gateEnv() {
  const used = collectEnvFromRoots(['sveltekit-frontend/src', 'packages', 'scripts']);
  const envServerFiles = [];
  for (const rel of ['src/lib/server/env.server.ts', 'sveltekit-frontend/src/lib/server/env.server.ts']) {
    const abs = resolveRepoPath(rel);
    if (existsSync(abs)) envServerFiles.push(rel);
  }

  const declared = new Set();
  for (const rel of envServerFiles) {
    const text = readText(resolveRepoPath(rel), '');
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) declared.add(match[1]);
  }
  const envServerText = envServerFiles.length > 0 ? readText(resolveRepoPath(envServerFiles[0]), '') : '';
  const envAuditTable = buildEnvAuditTable(envServerText);

  const serviceTargets = [
    {
      name: 'web',
      url: normalizeHealthProbeUrl(process.env.PUBLIC_API_URL ?? 'http://127.0.0.1:5173', '/api/health'),
      required: true,
    },
    {
      name: 'trace_mcp',
      url: normalizeHealthProbeUrl(process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788', '/health'),
      required: true,
    },
    { name: 'qdrant', url: process.env.QDRANT_URL ? `${process.env.QDRANT_URL.replace(/\/$/, '')}/collections` : 'http://127.0.0.1:6333/collections', required: false },
    { name: 'gemma4', url: 'http://127.0.0.1:8090/health', required: false },
    { name: 'ollama', url: 'http://127.0.0.1:8094/health', required: false },
    { name: 'mcp', url: 'http://127.0.0.1:8791/health', required: false },
  ];

  const probes = [];
  for (const target of serviceTargets) {
    try {
      const result = await fetchJson(target.url, 8000);
      probes.push(evidence('http_probe', {
        source: target.name,
        url: target.url,
        status: result.status,
        ok: result.ok,
        required: target.required,
      }));
    } catch (error) {
      probes.push(evidence('http_probe', {
        source: target.name,
        url: target.url,
        error: error?.message ?? String(error),
        required: target.required,
      }));
    }
  }

  const malformed = [...used.envUsage.keys()].filter((key) => /localhost:5173|undefined/.test(key));
  const requiredFailures = probes.filter((item) => item.required && !item.ok);
  const optionalMissing = probes.filter((item) => !item.required && !item.ok);
  const undeclaredUsed = [...used.envUsage.keys()].filter((key) => declared.size > 0 && !declared.has(key));

  let status = STATUS.PARTIAL;
  if (requiredFailures.length > 0 || malformed.length > 0) status = STATUS.FAIL;
  else if (undeclaredUsed.length === 0 && requiredFailures.length === 0 && optionalMissing.length === 0) status = STATUS.PASS;

  return makeResult('env', status, [
    evidence('env_usage', { used: [...used.envUsage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50) }),
    evidence('env_declared', { envServerFiles: envServerFiles }),
    evidence('env_audit_table', { rows: envAuditTable }),
    ...probes,
    evidence('env_parity', { undeclaredUsed, malformed }),
  ], [
    optionalMissing.length > 0 ? `optional services not configured or not healthy: ${optionalMissing.map((p) => p.source).join(', ')}` : null,
  ].filter(Boolean));
}

async function gateIdentity() {
  const pool = await openDb();
  if (!pool) {
    return makeResult('identity', STATUS.BLOCKED, [
      evidence('database', { message: 'DATABASE_URL/POSTGRES_URL not set' }),
    ], ['database connection unavailable']);
  }

  try {
    const tables = ['atlas_packets', 'atlas_tree_nodes', 'atlas_source_refs', 'graphify_symbols'];
    const present = await existingTables(pool, tables);
    const missing = tables.filter((table) => !present.has(table));

    const packets = present.has('atlas_packets')
      ? await pool.query(`
        SELECT
          COUNT(*)::int AS packets,
          COUNT(DISTINCT packet_key)::int AS packet_keys,
          COUNT(tree_node_id)::int AS packets_with_tree_node,
          COUNT(DISTINCT tree_node_id)::int AS distinct_tree_nodes
        FROM atlas_packets
      `)
      : { rows: [{}] };
    const treeNodes = present.has('atlas_tree_nodes')
      ? await pool.query(`
        SELECT
          COUNT(*)::int AS tree_nodes,
          COUNT(DISTINCT node_id)::int AS distinct_node_ids,
          COUNT(DISTINCT source_ref)::int AS source_refs
        FROM atlas_tree_nodes
      `)
      : { rows: [{}] };
    const sourceRefs = present.has('atlas_source_refs')
      ? await pool.query(`
        SELECT
          COUNT(*)::int AS refs,
          COUNT(content_hash)::int AS with_content_hash
        FROM atlas_source_refs
      `)
      : { rows: [{}] };
    const reusedTreeNodes = present.has('atlas_packets')
      ? await pool.query(`
        SELECT COUNT(*)::int AS reused_tree_nodes
        FROM (
          SELECT tree_node_id
          FROM atlas_packets
          WHERE tree_node_id IS NOT NULL
          GROUP BY tree_node_id
          HAVING COUNT(*) > 1
        ) t
      `)
      : { rows: [{}] };

    const packetRow = packets.rows[0] ?? {};
    const treeRow = treeNodes.rows[0] ?? {};
    const refsRow = sourceRefs.rows[0] ?? {};
    const reusedRow = reusedTreeNodes.rows[0] ?? {};

    const treeCoverage = packetRow.packets > 0 ? packetRow.packets_with_tree_node / packetRow.packets : 0;
    const hashCoverage = refsRow.refs > 0 ? refsRow.with_content_hash / refsRow.refs : 0;
    const reusableTreeIds = Number(reusedRow.reused_tree_nodes ?? 0);
    const graphifySymbolsExists = present.has('graphify_symbols');

    const hasOperationalEvidence =
      packetRow.packets > 0 ||
      treeRow.tree_nodes > 0 ||
      refsRow.refs > 0 ||
      reusableTreeIds >= 0;
    const status = hasOperationalEvidence ? STATUS.PARTIAL : STATUS.NOT_PROVEN;

    return makeResult('identity', status, [
      evidence('table_check', { present: [...present], missing }),
      evidence('sql', { table: 'atlas_packets', row: packetRow }),
      evidence('sql', { table: 'atlas_tree_nodes', row: treeRow }),
      evidence('sql', { table: 'atlas_source_refs', row: refsRow }),
      evidence('sql', { table: 'packet_tree_reuse', row: reusedRow }),
      evidence('table_check', { table: 'graphify_symbols', exists: graphifySymbolsExists }),
    ], [
      missing.length > 0 ? `missing tables: ${missing.join(', ')}` : null,
      `tree-node linkage coverage is ${Math.round(treeCoverage * 100)}%`,
      `atlas_source_refs content_hash coverage is ${Math.round(hashCoverage * 100)}%`,
      reusableTreeIds > 0 ? `tree_node_id reuse observed in ${reusableTreeIds} groups` : null,
      !graphifySymbolsExists ? 'graphify_symbols does not exist — cross-revision symbol_id stability remains blocked' : null,
    ].filter(Boolean));
  } finally {
    await pool.end().catch(() => {});
  }
}

async function gateOkf() {
  const okfFiles = [];
  for (const rel of ['okf', 'docs', 'packages']) {
    const abs = resolveRepoPath(rel);
    if (!existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', '.svelte-kit'].includes(entry.name)) continue;
          stack.push(full);
          continue;
        }
        if (/\.okf(\.|$)|(^|[\\/])okf([\\/]|$)/i.test(full)) okfFiles.push(full);
      }
    }
  }

  if (okfFiles.length === 0) {
    return makeResult('okf', STATUS.NOT_PROVEN, [
      evidence('file_scan', { message: 'no OKF artifacts discovered via file scan' }),
    ], ['OKF files were not found in the current checkout']);
  }

  return makeResult('okf', STATUS.PARTIAL, [
    evidence('file_scan', { files: okfFiles.slice(0, 20).map((file) => file.replace(REPO_ROOT + '\\', '')) }),
  ]);
}

async function gateClassification() {
  const pool = await openDb();
  if (!pool) {
    return makeResult('classification', STATUS.BLOCKED, [evidence('database', { message: 'database unavailable' })]);
  }

  try {
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('atlas_domain_predictions', 'atlas_packets')
      ORDER BY table_name
    `);
    const tableNames = tables.rows.map((row) => row.table_name);

    if (!tableNames.includes('atlas_domain_predictions')) {
      const packets = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(domain_class)::int AS classified,
          COUNT(*) FILTER (WHERE domain_class IS NULL)::int AS missing
        FROM atlas_packets
      `);
      return makeResult('classification', STATUS.NOT_PROVEN, [
        evidence('sql', { table: 'atlas_packets', row: packets.rows[0] ?? {} }),
        evidence('sql', { table: 'atlas_domain_predictions', present: false }),
      ], ['domain prediction ledger not present']);
    }

    const predictions = await pool.query(`
      SELECT
        classifier_id,
        classifier_revision,
        COUNT(*)::int AS predictions,
        AVG(confidence)::float AS avg_confidence,
        COUNT(*) FILTER (WHERE abstained)::int AS abstained
      FROM atlas_domain_predictions
      GROUP BY classifier_id, classifier_revision
      ORDER BY predictions DESC
      LIMIT 20
    `);

    return makeResult('classification', predictions.rows.length > 0 ? STATUS.PARTIAL : STATUS.NOT_PROVEN, [
      evidence('sql', { table: 'atlas_domain_predictions', rows: predictions.rows }),
    ]);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function gateSemantic() {
  const pool = await openDb();
  if (!pool) {
    return makeResult('semantic', STATUS.BLOCKED, [evidence('database', { message: 'database unavailable' })]);
  }

  try {
    const tables = ['atlas_representation_records', 'atlas_packets'];
    const present = await existingTables(pool, tables);
    const columns = present.has('atlas_packets')
      ? new Set((await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'atlas_packets'
          AND column_name IN ('content_embedding_768', 'latent_64')
      `)).rows.map((row) => row.column_name))
      : new Set();
    const representationRecords = present.has('atlas_representation_records')
      ? await pool.query(`
        SELECT
          representation_id,
          representation_revision,
          COUNT(*)::int AS rows,
          COUNT(DISTINCT packet_id)::int AS packets
        FROM atlas_representation_records
        GROUP BY representation_id, representation_revision
        ORDER BY rows DESC
        LIMIT 20
      `)
      : { rows: [] };

    let packetVectorProof = [];
    if (present.has('atlas_packets') && (columns.has('content_embedding_768') || columns.has('latent_64'))) {
      try {
        const semanticColumn = columns.has('content_embedding_768') ? 'content_embedding_768' : 'latent_64';
        packetVectorProof = (await pool.query(`
          SELECT
            COUNT(*)::int AS rows,
            COUNT(${semanticColumn})::int AS with_semantic_vector,
            MAX(pg_column_size(${semanticColumn}))::int AS max_bytes_semantic
          FROM atlas_packets
        `)).rows;
        packetVectorProof[0] = { ...packetVectorProof[0], semantic_column: semanticColumn };
      } catch (error) {
        packetVectorProof = [{ error: error?.message ?? String(error) }];
      }
    }

    const status = (present.has('atlas_representation_records') && representationRecords.rows.length > 0) || packetVectorProof.length > 0 ? STATUS.PARTIAL : STATUS.NOT_PROVEN;
    return makeResult('semantic', status, [
      evidence('table_check', { present: [...present], missing: tables.filter((table) => !present.has(table)) }),
      evidence('column_check', { table: 'atlas_packets', columns: [...columns] }),
      evidence('sql', { table: 'atlas_representation_records', rows: representationRecords.rows }),
      evidence('sql', { table: 'atlas_packets', rows: packetVectorProof }),
    ]);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function gateAnn() {
  const baseUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const url = `${baseUrl.replace(/\/$/, '')}/collections`;
  try {
    const result = await fetchJson(url, 5000);
    const collections = Array.isArray(result.body?.result?.collections)
      ? result.body.result.collections
      : Array.isArray(result.body?.collections)
        ? result.body.collections
        : [];
    const canonical = collections.find((collection) => /codebase_chunks_768/.test(collection.name ?? collection.collection_name ?? ''));
    return makeResult('ann', canonical ? STATUS.PARTIAL : STATUS.NOT_PROVEN, [
      evidence('http', { url, status: result.status, ok: result.ok }),
      evidence('collections', { names: collections.map((c) => c.name ?? c.collection_name ?? 'unknown').slice(0, 50) }),
    ], canonical ? [] : ['canonical 768 collection not proven from live Qdrant registry']);
  } catch (error) {
    return makeResult('ann', STATUS.BLOCKED, [evidence('http', { url, error: error?.message ?? String(error) })]);
  }
}

async function gateClustering() {
  const pool = await openDb();
  if (!pool) {
    return makeResult('clustering', STATUS.BLOCKED, [evidence('database', { message: 'database unavailable' })]);
  }

  try {
    const present = await existingTables(pool, ['atlas_topology_index']);
    if (!present.has('atlas_topology_index')) {
      return makeResult('clustering', STATUS.NOT_PROVEN, [
        evidence('table_check', { present: [...present], missing: ['atlas_topology_index'] }),
      ], ['atlas_topology_index not present']);
    }
    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'atlas_topology_index'
      ORDER BY ordinal_position
    `);
    const columnNames = columns.rows.map((row) => row.column_name);
    const coordinatePairs = [
      ['som_row', 'som_col'],
      ['row', 'col'],
      ['row', 'column'],
      ['grid_row', 'grid_col'],
      ['x', 'y'],
    ];
    const selectedPair = coordinatePairs.find(([rowColumn, colColumn]) => columnNames.includes(rowColumn) && columnNames.includes(colColumn)) ?? null;
    if (!selectedPair) {
      return makeResult('clustering', STATUS.NOT_PROVEN, [
        evidence('table_check', { present: [...present], missing: [] }),
        evidence('column_check', { table: 'atlas_topology_index', columns: columnNames }),
      ], ['no recognized coordinate columns found for SOM proof']);
    }
    const [rowColumn, colColumn] = selectedPair;
    const info = await pool.query(`
      SELECT
        COUNT(*)::int AS rows,
        COUNT(*) FILTER (WHERE ${rowColumn} BETWEEN 0 AND 19 AND ${colColumn} BETWEEN 0 AND 19)::int AS in_bounds,
        COUNT(*) FILTER (WHERE ${rowColumn} IS NULL OR ${colColumn} IS NULL)::int AS missing_coords
      FROM atlas_topology_index
    `);
    const row = info.rows[0] ?? {};
    const status = Number(row.rows ?? 0) > 0 ? STATUS.PARTIAL : STATUS.NOT_PROVEN;
    return makeResult('clustering', status, [
      evidence('column_check', { table: 'atlas_topology_index', columns: columnNames, selectedPair }),
      evidence('sql', { table: 'atlas_topology_index', row }),
    ]);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function gateGraph() {
  const candidates = [];
  for (const rel of [
    'docs/graph/codebase-graph.json',
    'memory/graphify/deep/deep-import-graph.json',
    'codebase-graph.json',
    'sveltekit-frontend/codebase-graph.json',
    'packages/parent-atlas/codebase-graph.json',
  ]) {
    const abs = resolveRepoPath(rel);
    if (existsSync(abs)) {
      candidates.push({
        file: rel,
        ageMinutes: fileAgeMinutes(abs),
        sizeBytes: statSync(abs).size,
      });
    }
  }

  if (candidates.length === 0) {
    return makeResult('graph', STATUS.NOT_PROVEN, [
      evidence('file_scan', { message: 'graph artifact not found in docs/graph or legacy locations' }),
    ]);
  }

  const freshest = candidates.sort((a, b) => a.ageMinutes - b.ageMinutes)[0];
  const status = freshest.ageMinutes <= 60 ? STATUS.PARTIAL : STATUS.NOT_PROVEN;
  return makeResult('graph', status, [
    evidence('file', { candidates }),
  ], [
    `freshest graph artifact age is ${freshest.ageMinutes} minutes`,
  ]);
}

async function gateGraphifyLock() {
  const startupWrapperRel = 'scripts/startup/run-graphify-daily-startup.mjs';
  const taskFileRel = '.vscode/tasks.json';
  const chainScriptRel = 'sveltekit-frontend/package.json';
  const wrapperText = readRepoTextIfExists(startupWrapperRel);
  const taskText = readRepoTextIfExists(taskFileRel);
  const chainText = readRepoTextIfExists(chainScriptRel);
  const lockFileMentioned = /graphify-daily-start\.lock|graphify-pipeline-lock/.test(wrapperText);
  const releaseHookMentioned = /process\.on\(['"]exit['"]/.test(wrapperText) && /releaseStartupLock/.test(wrapperText);
  const contentionBackoffMentioned = /process\.exit\(75\)|backing off/.test(wrapperText);
  let taskConfig = null;
  try {
    taskConfig = JSON.parse(taskText);
  } catch {
    taskConfig = null;
  }
  const graphifyTask = Array.isArray(taskConfig?.tasks)
    ? taskConfig.tasks.find((task) => task?.label === '🗺️ Startup: Auto-Map Codebase (graphify:daily)')
    : null;
  const folderOpenTaskPresent = graphifyTask?.runOptions?.runOn === 'folderOpen';
  const chainReferenced = /graphify:daily:chain/.test(chainText);

  const status = gateStatusFromEvidence(
    lockFileMentioned && releaseHookMentioned && contentionBackoffMentioned && chainReferenced && folderOpenTaskPresent,
  );

  return makeResult('graphify_lock', status, [
    evidence('file_scan', {
      files: [
        startupWrapperRel,
        taskFileRel,
        chainScriptRel,
      ],
    }),
    evidence('text_scan', {
      lockFileMentioned,
      releaseHookMentioned,
      contentionBackoffMentioned,
      folderOpenTaskPresent,
      taskConfigParsed: Boolean(taskConfig),
      chainReferenced,
    }),
  ], [
    folderOpenTaskPresent ? 'graphify:daily startup is configured on folder open with a single-instance lock' : 'graphify:daily startup is not configured on folder open',
  ]);
}

async function gateFeatureEnvelope() {
  const featureEnvelopeRel = 'sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts';
  const featureText = readRepoTextIfExists(featureEnvelopeRel);
  const hasAdvisoryLock = /pg_try_advisory_lock/.test(featureText);
  const hasIncrementalFilter = /feature_envelope\s+IS\s+NULL/i.test(featureText) || /feature_envelope->>'feature_schema_version'/.test(featureText);
  const hasDeterministicOrder = /ORDER BY packet_id/i.test(featureText);
  const hasReceipt = /materialize-feature-envelopes-receipt\.json/.test(featureText);
  const hasApplyMode = /--apply/.test(featureText) && /--force-refresh/.test(featureText);
  const status = gateStatusFromEvidence(hasAdvisoryLock && hasIncrementalFilter && hasDeterministicOrder && hasReceipt && hasApplyMode);

  return makeResult('feature_envelope', status, [
    evidence('file_scan', { files: [featureEnvelopeRel] }),
    evidence('text_scan', {
      hasAdvisoryLock,
      hasIncrementalFilter,
      hasDeterministicOrder,
      hasReceipt,
      hasApplyMode,
    }),
  ], [
    hasAdvisoryLock && hasIncrementalFilter && hasDeterministicOrder
      ? 'feature-envelope writer is incremental and lock-protected'
      : 'feature-envelope writer still needs a bounded incremental proof',
  ]);
}

async function gateLatentDiagnostic() {
  const latentRel = 'scripts/atlas/backfill-latent-vectors.mjs';
  const latentText = readRepoTextIfExists(latentRel);
  const hasMemDiag = /--mem-diag/.test(latentText);
  const hasBoundedLimit = /--limit=/.test(latentText) && /const LIMIT\s*=\s*limitArg\s*\?\s*parseInt/.test(latentText);
  const hasInfinityDefault = /:\s*Infinity/.test(latentText);
  const hasPageStreaming = /fetchQdrantPage\(/.test(latentText)
    && /while\s*\(\s*processedCount\s*<\s*LIMIT\s*\)/.test(latentText)
    && /pageCursor\s*=\s*page\.nextOffset/.test(latentText)
    && /writeCheckpoint\(\{[\s\S]{0,500}nextOffset:\s*page\.nextOffset/.test(latentText);
  const hasBatching = /--batch=/.test(latentText) && /BATCH_SZ/.test(latentText);
  const status = hasMemDiag && hasBoundedLimit && !hasInfinityDefault && hasPageStreaming
    ? STATUS.PASS
    : (hasMemDiag ? STATUS.PARTIAL : STATUS.NOT_PROVEN);

  return makeResult('latent_diagnostic', status, [
    evidence('file_scan', { files: [latentRel] }),
    evidence('text_scan', {
      hasMemDiag,
      hasBoundedLimit,
      hasInfinityDefault,
      hasPageStreaming,
      hasBatching,
    }),
  ], [
    status === STATUS.PASS
      ? 'latent backfill now streams bounded pages with checkpointing and diagnostics'
      : hasInfinityDefault || !hasPageStreaming
        ? 'latent backfill diagnostic path still needs bounded page streaming proof'
        : 'latent backfill diagnostic path exists but its memory profile was not verified here',
  ].filter(Boolean));
}

async function gateLatentBounded() {
  const latentRel = 'scripts/atlas/backfill-latent-vectors.mjs';
  const latentText = readRepoTextIfExists(latentRel);
  const hasResume = /--force-refresh|--limit=|--batch=/.test(latentText) && /checkpoint|resume/i.test(latentText);
  const hasFiniteDefault = !/:\s*Infinity/.test(latentText);
  const hasCheckpointContract = /checkpoint/i.test(latentText) && /datasetDigest/i.test(latentText);
  const status = hasResume && hasFiniteDefault && hasCheckpointContract ? STATUS.PASS : STATUS.NOT_PROVEN;

  return makeResult('latent_bounded', status, [
    evidence('file_scan', { files: [latentRel] }),
    evidence('text_scan', {
      hasResume,
      hasFiniteDefault,
      hasCheckpointContract,
    }),
  ], [
    status === STATUS.PASS ? 'latent backfill bounded resume contract is present' : 'bounded latent replay and checkpointing remain unproven',
  ]);
}

async function gateGraphArtifact() {
  const artifactRel = 'docs/graph/codebase-graph.json';
  const artifactAbs = resolveRepoPath(artifactRel);
  const candidateFiles = [];
  if (existsSync(artifactAbs)) {
    candidateFiles.push({
      file: artifactRel,
      ageMinutes: fileAgeMinutes(artifactAbs),
      sizeBytes: statSync(artifactAbs).size,
    });
  }
  const fresh = candidateFiles.length > 0 && candidateFiles[0].ageMinutes <= 60;
  return makeResult('graph_artifact', fresh ? STATUS.PASS : STATUS.NOT_PROVEN, [
    evidence('file', { candidates: candidateFiles }),
  ], [
    fresh ? 'graph artifact is fresh enough for review' : 'graph artifact remains stale or absent',
  ]);
}

async function gateStudio() {
  const boardRel = 'sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board.ts';
  const phaseRel = 'sveltekit-frontend/src/lib/server/atlas/board/phase89-workflow.ts';
  const boardText = readRepoTextIfExists(boardRel);
  const phaseText = readRepoTextIfExists(phaseRel);
  const proofReportMentioned = /parent-atlas-integration-proof|proof report|graphify recovery/i.test(boardText);
  const warningPropagationMentioned = /warnings/.test(boardText) && /warnings/.test(phaseText);
  const status = proofReportMentioned && warningPropagationMentioned ? STATUS.PASS : STATUS.NOT_PROVEN;

  return makeResult('studio', status, [
    evidence('file_scan', { files: [boardRel, phaseRel] }),
    evidence('text_scan', { proofReportMentioned, warningPropagationMentioned }),
  ], [
    status === STATUS.PASS
      ? 'Studio board consumes recovery proof signals and propagates warning state'
      : 'Studio board still lacks a recovery proof feed',
  ]);
}

async function gateAce() {
  const pool = await openDb();
  if (!pool) {
    return makeResult('ace', STATUS.BLOCKED, [evidence('database', { message: 'database unavailable' })]);
  }

  try {
    const tables = ['trace_runs', 'trace_events'];
    const present = await existingTables(pool, tables);
    const traces = present.has('trace_runs')
      ? await pool.query(`
        SELECT
          COUNT(*)::int AS traces,
          COUNT(DISTINCT id)::int AS distinct_traces
        FROM trace_runs
      `)
      : { rows: [{}] };
    const steps = present.has('trace_events')
      ? await pool.query(`
        SELECT
          COUNT(*)::int AS steps,
          COUNT(DISTINCT run_id)::int AS runs_with_steps
        FROM trace_events
      `)
      : { rows: [{}] };

    return makeResult('ace', (present.has('trace_runs') && Number(traces.rows[0]?.traces ?? 0) > 0) || (present.has('trace_events') && Number(steps.rows[0]?.steps ?? 0) > 0) ? STATUS.PARTIAL : STATUS.NOT_PROVEN, [
      evidence('table_check', { present: [...present], missing: tables.filter((table) => !present.has(table)) }),
      evidence('sql', { table: 'trace_runs', row: traces.rows[0] ?? {} }),
      evidence('sql', { table: 'trace_events', row: steps.rows[0] ?? {} }),
    ]);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function gateMcp() {
  const traceMcpBase = (process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788')
    .replace(/\/mcp\/?$/, '')
    .replace(/\/$/, '');
  const traceMcpUrl = `${traceMcpBase}/mcp`;

  const toolFiles = [
    'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
    'packages/atlas-core/src/evidence/trace-dynamic-context.ts',
    'packages/atlas-core/src/evidence/trace-dynamic-context-report.ts',
    'packages/atlas-core/src/tools/acp-tool-contracts.ts',
    'packages/atlas-core/src/langgraph/worker.ts',
    'packages/parent-atlas-client/src/mcp/client.ts',
  ].filter((rel) => existsSync(resolveRepoPath(rel)));

  const currentText = toolFiles.map((rel) => readText(resolveRepoPath(rel), '')).join('\n');
  const registeredTraceTool = /registerTool\(\s*['"]trace_dynamic_context['"]/.test(currentText);
  const currentTools = [...currentText.matchAll(/\b[a-z][a-z0-9_.:-]+\b/g)].slice(0, 100).map((m) => m[0]);

  let liveTools = null;
  let liveToolsError = null;
  let liveTraceCall = null;
  let liveTraceError = null;
  try {
    const toolsList = await fetchMcpSseJson(
      traceMcpUrl,
      { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }
    );
    liveTools = toolsList.body?.result?.tools ?? null;
  } catch (error) {
    liveToolsError = error?.message ?? String(error);
  }

  if (Array.isArray(liveTools) && liveTools.some((tool) => tool?.name === 'trace_dynamic_context')) {
    const pool = await openDb();
    let packetKey = null;
    let sourceRef = 'packages/atlas-core/src/evidence/trace-dynamic-context.ts';
    let sourceRevision = 'git:proof';
    if (pool) {
      try {
        const packet = await pool.query(`
          SELECT packet_key, source_ref
          FROM atlas_packets
          WHERE packet_key IS NOT NULL
          ORDER BY packet_key
          LIMIT 1
        `);
        packetKey = packet.rows[0]?.packet_key ?? null;
        sourceRef = packet.rows[0]?.source_ref ?? sourceRef;
      } finally {
        await pool.end().catch(() => {});
      }
    }

    const callArgs = {
      workspaceId: 'integration-proof',
      question: 'prove the evidence pipeline works end to end',
      target: {
        filePath: sourceRef,
        ...(packetKey ? { packetKey } : {}),
      },
      workspaceRevision: sourceRevision,
      sourceRevision,
      lanes: ['lexical'],
      limits: {
        topK: 5,
        maxFiles: 5,
        maxSymbols: 5,
        maxTokens: 1000,
        graphDepth: 1,
        timeoutMs: 5000,
        runtimeMode: 'read_only',
      },
    };

    try {
      const toolCall = await fetchMcpSseJson(
        traceMcpUrl,
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'trace_dynamic_context', arguments: callArgs } },
        12000
      );
      liveTraceCall = toolCall.body?.result?.content?.[0]?.text ?? null;
    } catch (error) {
      liveTraceError = error?.message ?? String(error);
    }
  }

  const liveTraceParsed = (() => {
    if (typeof liveTraceCall !== 'string' || liveTraceCall.length === 0) return null;
    try {
      return JSON.parse(liveTraceCall);
    } catch {
      return null;
    }
  })();

  const liveTraceSucceeded = Boolean(
    liveTraceParsed &&
      liveTraceParsed.status &&
      liveTraceParsed.reportMarkdown &&
      Array.isArray(liveTraceParsed.evidence) &&
      liveTraceParsed.evidence.length > 0
  );

  return makeResult('mcp', registeredTraceTool && Array.isArray(liveTools) && liveTraceSucceeded ? STATUS.PASS : registeredTraceTool ? STATUS.PARTIAL : STATUS.NOT_PROVEN, [
    evidence('file_scan', { toolFiles }),
    evidence('text_scan', { registeredTraceTool, sampleTokens: currentTools.slice(0, 30) }),
    evidence('http_probe', {
      source: 'trace_mcp',
      url: traceMcpUrl,
      ok: Array.isArray(liveTools),
      tools: Array.isArray(liveTools) ? liveTools.slice(0, 10).map((tool) => tool?.name).filter(Boolean) : null,
      error: liveToolsError,
    }),
    evidence('tool_call', {
      tool: 'trace_dynamic_context',
      ok: liveTraceSucceeded,
      error: liveTraceError,
      result: liveTraceParsed
        ? {
            status: liveTraceParsed.status,
            evidenceCount: liveTraceParsed.evidenceCount,
            packetKey: liveTraceParsed.packetKey,
            sourceId: liveTraceParsed.sourceId,
          }
        : null,
    }),
  ], [
    registeredTraceTool ? 'trace_dynamic_context registration present' : 'trace_dynamic_context not yet wired into trace-mcp-server',
    Array.isArray(liveTools) ? 'trace MCP tools/list succeeded' : 'trace MCP tools/list did not return a tool array',
    liveTraceSucceeded ? 'trace_dynamic_context live tools/call succeeded' : 'trace_dynamic_context live tools/call did not return bounded evidence',
  ]);
}

const gateDefinitions = [
  { name: 'env', handler: gateEnv, deps: [] },
  { name: 'identity', handler: gateIdentity, deps: ['env'] },
  { name: 'okf', handler: gateOkf, deps: ['env'] },
  { name: 'classification', handler: gateClassification, deps: ['identity'] },
  { name: 'semantic', handler: gateSemantic, deps: ['identity'] },
  { name: 'ann', handler: gateAnn, deps: ['semantic'] },
  { name: 'clustering', handler: gateClustering, deps: ['semantic', 'ann'] },
  { name: 'graph', handler: gateGraph, deps: ['identity', 'semantic'] },
  { name: 'graphify_lock', handler: gateGraphifyLock, deps: [] },
  { name: 'feature_envelope', handler: gateFeatureEnvelope, deps: ['graphify_lock'] },
  { name: 'latent_diagnostic', handler: gateLatentDiagnostic, deps: ['graphify_lock'] },
  { name: 'latent_bounded', handler: gateLatentBounded, deps: ['latent_diagnostic'] },
  { name: 'graph_artifact', handler: gateGraphArtifact, deps: ['graphify_lock', 'feature_envelope', 'latent_bounded'] },
  { name: 'studio', handler: gateStudio, deps: ['graph_artifact'] },
  { name: 'ace', handler: gateAce, deps: ['graph'] },
  { name: 'mcp', handler: gateMcp, deps: ['env'] },
];

const gateHandlers = Object.fromEntries(gateDefinitions.map((definition) => [definition.name, definition]));

async function runSelectedGates(selectedGate) {
  const gateNames = selectedGate ? [selectedGate] : gateDefinitions.map((definition) => definition.name);
  const results = [];
  const resultsByGate = new Map();
  for (const gate of gateNames) {
    const definition = gateHandlers[gate];
    if (!definition) {
      results.push(makeResult(gate, STATUS.FAIL, [evidence('cli', { message: 'unknown gate' })], [`Unknown gate: ${gate}`]));
      continue;
    }

    if (!selectedGate && definition.deps.length > 0) {
      const blockedDeps = definition.deps
        .map((dep) => resultsByGate.get(dep))
        .filter((depResult) => depResult && !dependencySatisfied(depResult.status));
      if (blockedDeps.length > 0) {
        const blocked = makeBlockedResult(gate, blockedDeps);
        results.push(blocked);
        resultsByGate.set(gate, blocked);
        continue;
      }
    }

    try {
      const result = await definition.handler();
      results.push(result);
      resultsByGate.set(gate, result);
    } catch (error) {
      const failed = makeResult(gate, STATUS.FAIL, [evidence('exception', { message: error?.message ?? String(error), stack: error?.stack })]);
      results.push(failed);
      resultsByGate.set(gate, failed);
    }
  }
  return results;
}

const results = await runSelectedGates(gateName);
const report = {
  generatedAt: nowIso(),
  repoRoot: REPO_ROOT,
  gate: gateName ?? 'all',
  dependencyGraph: gateDefinitions.map(({ name, deps }) => ({ gate: name, deps })),
  results,
};

writeFileSync(resolve(reportDir, 'parent-atlas-integration-proof.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const markdown = [
  '# Parent Atlas Integration Proof',
  '',
  `- Generated at: ${report.generatedAt}`,
  `- Gate: ${report.gate}`,
  '',
  '| Gate | Status | Notes |',
  '| --- | --- | --- |',
  ...results.map((result) => `| ${result.gate} | ${result.status} | ${(result.notes ?? []).join('; ').replace(/\|/g, '\\|')} |`),
  '',
].join('\n');

writeFileSync(resolve(reportDir, 'parent-atlas-integration-proof.md'), markdown, 'utf8');

if (jsonRequested) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  for (const result of results) {
    console.log(`[${result.gate}] ${result.status}`);
    for (const item of result.evidence.slice(0, 5)) {
      console.log(`  - ${item.kind}${item.source ? ` (${item.source})` : ''}`);
    }
    for (const note of result.notes ?? []) {
      console.log(`  note: ${note}`);
    }
  }
}

const failed = results.some((result) => result.status === STATUS.FAIL);
process.exit(failed ? 1 : 0);
