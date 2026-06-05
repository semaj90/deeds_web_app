#!/usr/bin/env node
/**
 * Read-only contextual tree readiness audit.
 *
 * This script only inspects existing read surfaces. It does not mutate
 * Postgres, Qdrant, Neo4j, DuckDB, CouchDB, Redis, files, or packets.
 *
 * Goal: verify the join spine that contextual trees depend on before any
 * clustering or latent annotation work:
 *   source_ref -> feature_id -> qdrant_point_id -> graph node -> packet id
 *   -> offline DuckDB/CouchDB rollups -> KMeans/SOM/AE annotation lanes
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  normalizeFeatureId,
  normalizePathLike,
  normalizeSourceRef,
  readJsonlFile,
  relativeDisplay,
} from '../../sveltekit-frontend/scripts/atlas/audit-jsonl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'contextual-tree-readiness-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'contextual-tree-readiness-report.md');
const DUCKDB_EXE = process.env.DUCKDB_PATH ?? 'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const PG_TABLES = ['parent_atlas_documents', 'route_runtime_packets', 'codebase_chunk_index', 'atlas_feature_map_synthesized', 'atlas_feature_synthesis'];
const SOURCE_REF_ALIASES = new Set(['source_ref', 'sourceRef', 'sourceRefs', 'file_path', 'filePath', 'relative_path', 'relPath', 'path']);
const FEATURE_ID_ALIASES = new Set(['feature_id', 'featureId', 'feature_ids', 'featureIds', 'feature', 'feature_label', 'featureLabel']);
const QDRANT_POINT_ALIASES = new Set(['qdrant_point_id', 'qdrantPointId', 'point_id', 'pointId', 'id']);
const GRAPH_NODE_ALIASES = new Set(['neo4j_node', 'neo4jNode', 'node_id', 'nodeId', 'graph_node', 'graphNode', 'filePath', 'sourceRef']);
const EXPECTED_QDRANT_PAYLOAD_KEYS = ['source_ref', 'file_path', 'feature_id', 'qdrant_point_id', 'som_cluster'];
const EXPECTED_DUCKDB_COLUMNS = ['source_ref', 'feature_id', 'sourceRef', 'featureId'];
const EXPECTED_NEO4J_PROPERTIES = ['filePath', 'sourceRef', 'feature_id', 'featureId', 'file_path', 'source_ref'];

function env() {
  return loadRepoEnv(process.env);
}

function databaseUrl(e) {
  return resolveDatabaseUrl(e);
}

function statusLabel(state) {
  return state.toUpperCase();
}

function createLane(name, purpose) {
  return {
    name,
    purpose,
    status: 'SOURCE_UNAVAILABLE',
    evidence: [],
    actualFieldNames: [],
    expectedAliasesMissing: [],
    expectedAliasesPresent: [],
    sourceUnavailable: false,
    dataAbsent: false,
    materializationMissing: false,
    fieldNameMismatch: false,
    ready: false,
  };
}

function classifyLane(lane, preferred = 'READY') {
  if (lane.sourceUnavailable) return 'SOURCE_UNAVAILABLE';
  if (lane.materializationMissing) return 'MATERIALIZATION_MISSING';
  if (lane.fieldNameMismatch) return 'FIELD_NAME_MISMATCH';
  if (lane.dataAbsent) return 'DATA_ABSENT';
  return preferred;
}

function finalizeLane(lane, details = {}) {
  lane.evidence = details.evidence ?? lane.evidence;
  lane.actualFieldNames = details.actualFieldNames ?? lane.actualFieldNames;
  lane.expectedAliasesPresent = details.expectedAliasesPresent ?? lane.expectedAliasesPresent;
  lane.expectedAliasesMissing = details.expectedAliasesMissing ?? lane.expectedAliasesMissing;
  lane.sourceUnavailable = details.sourceUnavailable ?? lane.sourceUnavailable;
  lane.dataAbsent = details.dataAbsent ?? lane.dataAbsent;
  lane.materializationMissing = details.materializationMissing ?? lane.materializationMissing;
  lane.fieldNameMismatch = details.fieldNameMismatch ?? lane.fieldNameMismatch;
  lane.ready = details.ready ?? lane.ready;
  lane.status = classifyLane(lane, details.preferredStatus ?? 'READY');
  return lane;
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectFieldNames(node, fieldNames, prefix = '', depth = 0, maxDepth = 2) {
  if (node === null || node === undefined) return;
  if (depth > maxDepth) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 3)) collectFieldNames(item, fieldNames, prefix, depth, maxDepth);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const pathName = prefix ? `${prefix}.${key}` : key;
    fieldNames.add(pathName);
    collectFieldNames(value, fieldNames, pathName, depth + 1, maxDepth);
  }
}

function compareAliases(actualFieldNames, expectedAliases) {
  const actual = [...new Set(actualFieldNames)].sort();
  const expected = [...new Set(expectedAliases)].sort();
  const actualSet = new Set(actual);
  return {
    actualFieldNames: actual,
    expectedAliases: expected,
    expectedAliasesPresent: expected.filter((alias) => actualSet.has(alias)),
    expectedAliasesMissing: expected.filter((alias) => !actualSet.has(alias)),
  };
}

function canonicalizeFieldName(fieldName) {
  if (SOURCE_REF_ALIASES.has(fieldName)) return 'source_ref';
  if (FEATURE_ID_ALIASES.has(fieldName)) return 'feature_id';
  if (QDRANT_POINT_ALIASES.has(fieldName)) return 'qdrant_point_id';
  if (GRAPH_NODE_ALIASES.has(fieldName)) return 'graph_node';
  return null;
}

function deriveCanonicalJoins(actualFieldNames) {
  const canonicalSet = new Set();
  for (const fieldName of actualFieldNames) {
    const canonical = canonicalizeFieldName(fieldName);
    if (canonical) canonicalSet.add(canonical);
  }
  return canonicalSet;
}

function deriveReadyFromAliases(actualFieldNames, requiredCanonicals) {
  const canonicalSet = deriveCanonicalJoins(actualFieldNames);
  return requiredCanonicals.every((canonical) => canonicalSet.has(canonical));
}

function normalizeAliasCoverage(actualFieldNames, expectedAliases) {
  const aliasCoverage = compareAliases(actualFieldNames, expectedAliases);
  return {
    actualFieldNames: aliasCoverage.actualFieldNames.filter((fieldName) => !fieldName.includes('.high') && !fieldName.includes('.low')),
    expectedAliases: aliasCoverage.expectedAliases,
    expectedAliasesPresent: aliasCoverage.expectedAliasesPresent,
    expectedAliasesMissing: aliasCoverage.expectedAliasesMissing,
    canonicalJoins: deriveCanonicalJoins(aliasCoverage.actualFieldNames),
  };
}

function recursiveFiles(root, predicate, limit = 200) {
  const out = [];
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop();
    if (!dir || seen.has(dir) || !fs.existsSync(dir)) continue;
    seen.add(dir);
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (predicate(fullPath)) {
        out.push(fullPath);
        if (out.length >= limit) break;
      }
    }
  }
  return out.sort();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function findDuckDbFiles() {
  try {
    const output = execFileSync('rg', [
      '--files', '-uuu', '-g', '*.duckdb', '-g', '!node_modules/**', '-g', '!.svelte-kit/**',
      '-g', '!.vite/**', '-g', '!dist/**', '-g', '!build/**', '-g', '!coverage/**', '-g', '!deeds_labs/**',
    ], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
    return output.split(/\r?\n/).filter(Boolean).map((entry) => path.resolve(ROOT, entry));
  } catch {
    return [];
  }
}

function duckdbQuery(filePath, sql) {
  const result = spawnSync(DUCKDB_EXE, [filePath, '-json', '-c', sql], { encoding: 'utf8', timeout: 25000 });
  if (result.error) {
    return { error: result.error instanceof Error ? result.error.message : String(result.error) };
  }
  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || 'duckdb query failed';
    return { error: message };
  }
  try {
    return { rows: JSON.parse(result.stdout.trim() || '[]') };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function couchdbConfig(e) {
  const raw = e.COUCHDB_URL ?? e.PUBLIC_COUCHDB_URL ?? '';
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
  } catch {
    return null;
  }
  const user = e.COUCHDB_USER ?? decodeURIComponent(url.username || '');
  const pass = e.COUCHDB_PASS ?? decodeURIComponent(url.password || '');
  const base = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  return { base, user, pass };
}

async function fetchJson(url, headers = {}, timeoutMs = 5000, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectPostgres(e, report) {
  const lane = createLane('postgres', 'Source-of-truth join tables');
  const url = databaseUrl(e);
  if (!url) {
    return finalizeLane(lane, { sourceUnavailable: true, evidence: ['DATABASE_URL missing'] });
  }

  let pool;
  try {
    pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 4000, idleTimeoutMillis: 4000, max: 1 });
    const summary = [];
    const tableStatuses = [];

    for (const tableName of PG_TABLES) {
      const existsRow = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
      const exists = existsRow.rows?.[0]?.exists === true;
      if (!exists) {
        tableStatuses.push({ tableName, exists: false, rowCount: null, columns: [], status: 'MATERIALIZATION_MISSING' });
        continue;
      }
      const countRow = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${tableName}`);
      const rowCount = Number(countRow.rows?.[0]?.count ?? 0);
      const columnsRes = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [tableName]
      );
      const columns = columnsRes.rows.map((row) => row.column_name);
      const expectedAliases = {
        parent_atlas_documents: ['source_ref', 'feature_id', 'qdrant_point_id', 'summary'],
        route_runtime_packets: ['source_refs', 'feature_ids', 'qdrant_hits', 'som_cluster'],
        codebase_chunk_index: ['source_ref', 'feature_id', 'qdrant_point_id', 'som_cluster'],
        atlas_feature_map_synthesized: ['source_ref', 'feature_id', 'qdrant_point_id', 'som_cluster'],
        atlas_feature_synthesis: ['source_ref', 'feature_id', 'primary_cluster_id', 'avg_confidence'],
      }[tableName] ?? [];
      const aliasCoverage = normalizeAliasCoverage(columns, expectedAliases);
      const hasSourceRef = aliasCoverage.canonicalJoins.has('source_ref');
      const hasFeatureId = aliasCoverage.canonicalJoins.has('feature_id');
      const ready = rowCount > 0 && (hasSourceRef || hasFeatureId || aliasCoverage.expectedAliasesMissing.length === 0);
      const fieldNameMismatch = rowCount > 0 && !ready && aliasCoverage.expectedAliasesPresent.length > 0;
      const dataAbsent = exists && rowCount === 0;
      const status = dataAbsent ? 'DATA_ABSENT' : ready ? 'READY' : fieldNameMismatch ? 'FIELD_NAME_MISMATCH' : 'SOURCE_UNAVAILABLE';
      tableStatuses.push({
        tableName,
        exists,
        rowCount,
        columns,
        actualFieldNames: columns,
        canonicalJoins: [...aliasCoverage.canonicalJoins],
        expectedAliases: aliasCoverage.expectedAliases,
        expectedAliasesPresent: aliasCoverage.expectedAliasesPresent,
        expectedAliasesMissing: aliasCoverage.expectedAliasesMissing,
        status,
      });
      summary.push(`${tableName}:${status}:${rowCount}`);
    }

    const allReady = tableStatuses.every((entry) => entry.status === 'READY');
    const anyMismatch = tableStatuses.some((entry) => entry.status === 'FIELD_NAME_MISMATCH');
    const anyMissing = tableStatuses.some((entry) => entry.status === 'MATERIALIZATION_MISSING');
    const anyAbsent = tableStatuses.some((entry) => entry.status === 'DATA_ABSENT');

    return finalizeLane(lane, {
      evidence: summary,
      ready: allReady,
      fieldNameMismatch: anyMismatch,
      materializationMissing: anyMissing,
      dataAbsent: anyAbsent,
      actualFieldNames: uniqueStrings(tableStatuses.flatMap((entry) => entry.actualFieldNames ?? [])),
      expectedAliasesPresent: uniqueStrings(tableStatuses.flatMap((entry) => entry.expectedAliasesPresent ?? [])),
      expectedAliasesMissing: uniqueStrings(tableStatuses.flatMap((entry) => entry.expectedAliasesMissing ?? [])),
      preferredStatus: allReady ? 'READY' : anyMissing ? 'MATERIALIZATION_MISSING' : anyMismatch ? 'FIELD_NAME_MISMATCH' : 'DATA_ABSENT',
    });
  } catch (error) {
    return finalizeLane(lane, {
      sourceUnavailable: true,
      evidence: [error instanceof Error ? error.message : String(error)],
    });
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

async function inspectNeo4j(e, report) {
  const lane = createLane('neo4j', 'Graph truth / contextual traversal tree');
  const uri = e.NEO4J_URI ?? e.NEO4J_URL ?? '';
  const password = e.NEO4J_PASSWORD ?? e.NEO4J_PASS ?? '';
  const user = e.NEO4J_USER ?? 'neo4j';
  if (!uri || !password) {
    return finalizeLane(lane, { sourceUnavailable: true, evidence: ['NEO4J_URI or password missing'] });
  }

  let driver;
  try {
    const neo4jPkg = await import('neo4j-driver');
    const neo4jModule = neo4jPkg.default ?? neo4jPkg;
    driver = neo4jModule.driver(uri, neo4jModule.auth.basic(user, password), { connectionTimeout: 4000 });
    const session = driver.session({ defaultAccessMode: neo4jModule.session.READ });
    try {
      const sample = await session.run(
        `MATCH (n:CodebaseFile)
         RETURN labels(n) AS labels,
                keys(n) AS keys,
                properties(n) AS properties,
                n.filePath AS filePath,
                n.sourceRef AS sourceRef,
                n.feature_id AS featureId
         LIMIT 10`
      );
      const nodes = sample.records ?? [];
      if (nodes.length === 0) {
        return finalizeLane(lane, { dataAbsent: true, evidence: ['no CodebaseFile nodes sampled'] });
      }

      const actualFieldNames = new Set();
      const sampleKeys = new Set();
      for (const record of nodes) {
        const labels = record.get('labels') ?? [];
        const keys = record.get('keys') ?? [];
        const properties = record.get('properties') ?? {};
        if (Array.isArray(labels)) labels.forEach((label) => sampleKeys.add(`label:${String(label)}`));
        if (Array.isArray(keys)) keys.forEach((key) => sampleKeys.add(String(key)));
        if (properties && typeof properties === 'object') {
          collectFieldNames(properties, actualFieldNames, '', 0, 2);
          Object.keys(properties).forEach((key) => sampleKeys.add(key));
        }
        ['filePath', 'sourceRef', 'featureId'].forEach((prop) => {
          if (Array.isArray(keys) && keys.includes(prop)) actualFieldNames.add(prop);
        });
      }

      const relationCounts = await session.run(
        `MATCH ()-[r]->()
         RETURN type(r) AS relationType, count(*) AS count
         ORDER BY count DESC
         LIMIT 25`
      );
      const relationTypes = (relationCounts.records ?? []).map((record) => ({
        relationType: record.get('relationType'),
        count: Number(record.get('count') ?? 0),
      }));

      const aliasCoverage = normalizeAliasCoverage(actualFieldNames, EXPECTED_NEO4J_PROPERTIES);
      const hasGraphNode = aliasCoverage.canonicalJoins.has('graph_node');
      const ready = nodes.length > 0 && hasGraphNode;
      const fieldNameMismatch = nodes.length > 0 && !ready && aliasCoverage.expectedAliasesPresent.length > 0;
      return finalizeLane(lane, {
        evidence: relationTypes.map((entry) => `${entry.relationType}:${entry.count}`),
        actualFieldNames: aliasCoverage.actualFieldNames,
        canonicalJoins: [...aliasCoverage.canonicalJoins],
        expectedAliasesPresent: aliasCoverage.expectedAliasesPresent,
        expectedAliasesMissing: aliasCoverage.expectedAliasesMissing,
        fieldNameMismatch,
        ready,
        preferredStatus: ready ? 'READY' : fieldNameMismatch ? 'FIELD_NAME_MISMATCH' : 'DATA_ABSENT',
      });
    } finally {
      await session.close().catch(() => {});
    }
  } catch (error) {
    return finalizeLane(lane, {
      sourceUnavailable: true,
      evidence: [error instanceof Error ? error.message : String(error)],
    });
  } finally {
    if (driver) {
      try {
        await driver.close();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

async function inspectQdrant(e, report) {
  const lane = createLane('qdrant', 'Semantic lookup/filter engine');
  const raw = e.QDRANT_URL ?? e.PUBLIC_QDRANT_URL ?? '';
  if (!raw) {
    return finalizeLane(lane, { sourceUnavailable: true, evidence: ['QDRANT_URL missing'] });
  }
  const base = raw.replace(/\/$/, '');
  try {
    const collectionRes = await fetchJson(`${base}/collections/${QDRANT_COLLECTION}`, {}, 5000);
    if (!collectionRes.response?.ok) {
      return finalizeLane(lane, { materializationMissing: true, evidence: [`collection missing or unreachable (${collectionRes.response?.status ?? 'no response'})`] });
    }
    const scrollRes = await fetchJson(
      `${base}/collections/${QDRANT_COLLECTION}/points/scroll`,
      {
        'content-type': 'application/json',
      },
      5000,
      {
        method: 'POST',
        body: JSON.stringify({ limit: 10, with_payload: true, with_vectors: false }),
      }
    );
    const response = scrollRes.response;
    if (!response?.ok) {
      return finalizeLane(lane, { sourceUnavailable: true, evidence: [`scroll failed (${response?.status ?? 'no response'})`] });
    }
    const payload = scrollRes.json ?? {};
    const points = payload?.result?.points ?? payload?.result ?? payload?.points ?? [];
    if (!Array.isArray(points) || points.length === 0) {
      return finalizeLane(lane, { dataAbsent: true, evidence: ['collection reachable but no points returned'] });
    }

    const actualFieldNames = new Set();
    const samplePayloadKeys = new Set();
    for (const point of points.slice(0, 10)) {
      collectFieldNames(point, actualFieldNames, '', 0, 2);
      if (point?.payload && typeof point.payload === 'object') {
        Object.keys(point.payload).forEach((key) => samplePayloadKeys.add(key));
        collectFieldNames(point.payload, actualFieldNames, 'payload', 0, 2);
      }
    }
    const aliasCoverage = normalizeAliasCoverage(actualFieldNames, EXPECTED_QDRANT_PAYLOAD_KEYS.map((key) => `payload.${key}`).concat(EXPECTED_QDRANT_PAYLOAD_KEYS));
    const hasPointId = aliasCoverage.canonicalJoins.has('qdrant_point_id');
    const ready = points.length > 0 && hasPointId;
    const fieldNameMismatch = points.length > 0 && !ready && aliasCoverage.expectedAliasesPresent.length > 0;
    return finalizeLane(lane, {
      evidence: [`points=${points.length}`, `payloadKeys=${[...samplePayloadKeys].slice(0, 12).join(', ') || 'none'}`],
      actualFieldNames: aliasCoverage.actualFieldNames,
      canonicalJoins: [...aliasCoverage.canonicalJoins],
      expectedAliasesPresent: aliasCoverage.expectedAliasesPresent,
      expectedAliasesMissing: aliasCoverage.expectedAliasesMissing,
      fieldNameMismatch,
      ready,
      preferredStatus: ready ? 'READY' : fieldNameMismatch ? 'FIELD_NAME_MISMATCH' : 'DATA_ABSENT',
    });
  } catch (error) {
    return finalizeLane(lane, {
      sourceUnavailable: true,
      evidence: [error instanceof Error ? error.message : String(error)],
    });
  }
}

function listDuckDbInventory() {
  const files = findDuckDbFiles();
  return files.map((filePath) => ({
    filePath,
    relPath: relativeDisplay(ROOT, filePath),
    exists: fs.existsSync(filePath),
  }));
}

function inspectDuckDbFile(filePath) {
  const tables = duckdbQuery(filePath, `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY table_name`);
  if (tables.error) {
    return { filePath, status: 'SOURCE_UNAVAILABLE', evidence: [tables.error], tables: [], views: [], columns: [], actualFieldNames: [], expectedAliasesMissing: EXPECTED_DUCKDB_COLUMNS, expectedAliasesPresent: [] };
  }
  const rows = tables.rows ?? [];
  const tableNames = rows.filter((row) => String(row.table_type ?? '').toLowerCase() === 'base table').map((row) => row.table_name);
  const viewNames = rows.filter((row) => String(row.table_type ?? '').toLowerCase() === 'view').map((row) => row.table_name);
  if (rows.length === 0) {
    return { filePath, status: 'DATA_ABSENT', evidence: ['no tables or views found'], tables: [], views: [], columns: [], actualFieldNames: [], expectedAliasesMissing: EXPECTED_DUCKDB_COLUMNS, expectedAliasesPresent: [] };
  }
  const columnRows = duckdbQuery(filePath, `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY table_name, ordinal_position`);
  const columns = columnRows.error ? [] : columnRows.rows ?? [];
  const actualFieldNames = [...new Set(columns.map((row) => row.column_name))].sort();
  const aliasCoverage = summarizeAliasFamilies(actualFieldNames, EXPECTED_DUCKDB_COLUMNS);
  const ready = aliasCoverage.expectedAliasesPresent.length > 0;
  const fieldNameMismatch = aliasCoverage.expectedAliasesMissing.length > 0 && ready;
  return {
    filePath,
    status: ready ? 'READY' : fieldNameMismatch ? 'FIELD_NAME_MISMATCH' : 'DATA_ABSENT',
    evidence: [`tables=${tableNames.join(', ') || 'none'}`, `views=${viewNames.join(', ') || 'none'}`],
    tables: tableNames,
    views: viewNames,
    columns,
    actualFieldNames,
    expectedAliasesMissing: aliasCoverage.expectedAliasesMissing,
    expectedAliasesPresent: aliasCoverage.expectedAliasesPresent,
  };
}

function inspectDuckDb(report) {
  const lane = createLane('duckdb', 'Offline analytical joins / rollups');
  const files = listDuckDbInventory();
  if (files.length === 0) {
    return finalizeLane(lane, { dataAbsent: true, evidence: ['no .duckdb files discovered'] });
  }
  const samples = files.slice(0, 5).map((entry) => inspectDuckDbFile(entry.filePath));
  const ready = samples.some((sample) => sample.status === 'READY');
  const sourceUnavailable = samples.every((sample) => sample.status === 'SOURCE_UNAVAILABLE');
  const fieldNameMismatch = samples.some((sample) => sample.status === 'FIELD_NAME_MISMATCH');
  const dataAbsent = samples.every((sample) => sample.status === 'DATA_ABSENT');
  return finalizeLane(lane, {
    evidence: samples.flatMap((sample) => sample.evidence.map((item) => `${sample.filePath}:${item}`)),
    actualFieldNames: uniqueStrings(samples.flatMap((sample) => sample.actualFieldNames ?? [])),
    expectedAliasesMissing: uniqueStrings(samples.flatMap((sample) => sample.expectedAliasesMissing ?? [])),
    expectedAliasesPresent: uniqueStrings(samples.flatMap((sample) => sample.expectedAliasesPresent ?? [])),
    sourceUnavailable,
    fieldNameMismatch,
    dataAbsent,
    ready,
    preferredStatus: ready ? 'READY' : sourceUnavailable ? 'SOURCE_UNAVAILABLE' : fieldNameMismatch ? 'FIELD_NAME_MISMATCH' : 'DATA_ABSENT',
  });
}

async function inspectCouchDb(e, report) {
  const lane = createLane('couchdb', 'Append-only archive / mapreduce views');
  const cfg = couchdbConfig(e);
  if (!cfg) {
    return finalizeLane(lane, { sourceUnavailable: true, evidence: ['COUCHDB_URL missing'] });
  }

  try {
    const auth = cfg.user && cfg.pass ? { Authorization: `Basic ${Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64')}` } : {};
    const ping = await fetchJson(`${cfg.base}/`, auth, 5000);
    if (!ping.response?.ok) {
      return finalizeLane(lane, { sourceUnavailable: true, evidence: [`root ping failed (${ping.response?.status ?? 'no response'})`] });
    }

    const dbs = await fetchJson(`${cfg.base}/_all_dbs`, auth, 5000);
    if (!dbs.response?.ok || !Array.isArray(dbs.json)) {
      return finalizeLane(lane, { sourceUnavailable: true, evidence: ['_all_dbs unavailable'] });
    }

    const sampleDbs = dbs.json.slice(0, 5);
    const designDocs = [];
    for (const dbName of sampleDbs) {
      const docs = await fetchJson(`${cfg.base}/${encodeURIComponent(dbName)}/_all_docs?startkey=%22_design/%22&endkey=%22_design0%22&include_docs=true`, auth, 5000);
      if (!docs.response?.ok || !docs.json?.rows) continue;
      for (const row of docs.json.rows) {
        const doc = row.doc ?? {};
        const views = Object.keys(doc.views ?? {});
        designDocs.push({ dbName, id: row.id, views });
      }
    }

    if (designDocs.length === 0) {
      return finalizeLane(lane, { dataAbsent: true, evidence: [`dbs=${sampleDbs.join(', ') || 'none'}`, 'no design docs found in sampled databases'] });
    }

    const views = uniqueStrings(designDocs.flatMap((doc) => doc.views.map((view) => `${doc.dbName}/${doc.id}:${view}`)));
    return finalizeLane(lane, {
      evidence: views.slice(0, 25),
      ready: views.length > 0,
      preferredStatus: views.length > 0 ? 'READY' : 'DATA_ABSENT',
    });
  } catch (error) {
    return finalizeLane(lane, { sourceUnavailable: true, evidence: [error instanceof Error ? error.message : String(error)] });
  }
}

function inspectPacketSurfaces(report) {
  const lane = createLane('packets', 'NES/CHROM packets, runtime packets, JSONL surfaces');
  const tmpJsonlFiles = recursiveFiles(path.join(ROOT, '.tmp'), (filePath) => filePath.toLowerCase().endsWith('.jsonl'), 75);
  const tmpNdjsonFiles = recursiveFiles(path.join(ROOT, '.tmp'), (filePath) => filePath.toLowerCase().endsWith('.ndjson'), 75);
  const packetFiles = uniqueStrings([...tmpJsonlFiles, ...tmpNdjsonFiles].map((filePath) => relativeDisplay(ROOT, filePath)));
  const packetRows = packetFiles.slice(0, 20).map((relPath) => readJsonlFile(path.join(ROOT, relPath)));
  const keySamples = uniqueStrings(packetRows.flatMap((row) => row.keySamples ?? []));
  const sourceRefHits = packetRows.reduce((sum, row) => sum + (row.rows ?? []).filter((entry) => normalizeSourceRef(entry)).length, 0);
  const featureIdHits = packetRows.reduce((sum, row) => sum + (row.rows ?? []).filter((entry) => normalizeFeatureId(entry)).length, 0);
  const ready = packetRows.length > 0 && (sourceRefHits > 0 || featureIdHits > 0);
  const dataAbsent = packetRows.length === 0;
  const fieldNameMismatch = packetRows.length > 0 && sourceRefHits === 0 && featureIdHits === 0;
  return finalizeLane(lane, {
    evidence: [
      `tmpJsonlFiles=${tmpJsonlFiles.length}`,
      `tmpNdjsonFiles=${tmpNdjsonFiles.length}`,
      `sourceRefHits=${sourceRefHits}`,
      `featureIdHits=${featureIdHits}`,
      `keySamples=${keySamples.slice(0, 12).join(', ') || 'none'}`,
    ],
    ready,
    dataAbsent,
    fieldNameMismatch,
    preferredStatus: ready ? 'READY' : fieldNameMismatch ? 'FIELD_NAME_MISMATCH' : 'DATA_ABSENT',
  });
}

function buildSummary(lanes, packetSurfaceDetails, duckdbInventory) {
  const statuses = Object.values(lanes).map((lane) => lane.status);
  const counts = statuses.reduce((acc, status) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, { READY: 0, FIELD_NAME_MISMATCH: 0, MATERIALIZATION_MISSING: 0, SOURCE_UNAVAILABLE: 0, DATA_ABSENT: 0 });
  const overall = counts.SOURCE_UNAVAILABLE > 0
    ? 'SOURCE_UNAVAILABLE'
    : counts.MATERIALIZATION_MISSING > 0
      ? 'MATERIALIZATION_MISSING'
      : counts.FIELD_NAME_MISMATCH > 0
        ? 'FIELD_NAME_MISMATCH'
        : counts.DATA_ABSENT > 0
          ? 'DATA_ABSENT'
          : 'READY';
  return {
    counts,
    overall,
    lanes,
    packetSurfaceDetails,
    duckdbInventory,
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Contextual Tree Readiness Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- overall: ${report.summary.overall}`,
    `- READY: ${report.summary.counts.READY}`,
    `- FIELD_NAME_MISMATCH: ${report.summary.counts.FIELD_NAME_MISMATCH}`,
    `- MATERIALIZATION_MISSING: ${report.summary.counts.MATERIALIZATION_MISSING}`,
    `- SOURCE_UNAVAILABLE: ${report.summary.counts.SOURCE_UNAVAILABLE}`,
    `- DATA_ABSENT: ${report.summary.counts.DATA_ABSENT}`,
    '',
    '## Guardrails',
    '',
    '- Neo4j builds traversal trees; KMeans/SOM/AE annotate those trees after join keys are proven.',
    '- Qdrant remains the semantic lookup/filter engine; topology math remains external and is audited through payload/table signals.',
    '- Louvain/PageRank are graph algorithms, not PCA/matmul lanes. This report only checks whether Neo4j graph truth is present.',
    '- Cold-storage readiness is treated as provenance visibility here. Actual archive/move flows remain gated.',
    '- Internal GEMM exists in simd-bridge/cpp/libtorch_graph_impl.cpp and simd-bridge/cpp/pytorch_graph_fp16.cc via torch::mm(); LibTorch GPU tensors dispatch torch::mm() through CUDA/cuBLAS where available.',
    '- The remaining native bridge gap is no generic public matmul_f32 export. That is a public API warning, not a failure of the canonical 768→256→64 autoencoder lane.',
    '',
    '## Join Lanes',
    '',
  ];

  for (const [name, lane] of Object.entries(report.summary.lanes)) {
    lines.push(`- ${name}`);
    lines.push(`  - status: ${lane.status}`);
    lines.push(`  - evidence: ${lane.evidence.join(' | ') || 'none'}`);
    lines.push(`  - actual field names: ${lane.actualFieldNames.join(', ') || 'none'}`);
    lines.push(`  - expected aliases present: ${lane.expectedAliasesPresent.join(', ') || 'none'}`);
    lines.push(`  - expected aliases missing: ${lane.expectedAliasesMissing.join(', ') || 'none'}`);
  }

  lines.push('', '## Packet Surfaces', '');
  lines.push(`- tmp JSONL files discovered: ${report.summary.packetSurfaceDetails.tmpJsonlFiles.length}`);
  lines.push(`- tmp NDJSON files discovered: ${report.summary.packetSurfaceDetails.tmpNdjsonFiles.length}`);
  lines.push(`- source_ref hits in sampled JSONL files: ${report.summary.packetSurfaceDetails.sourceRefHits}`);
  lines.push(`- feature_id hits in sampled JSONL files: ${report.summary.packetSurfaceDetails.featureIdHits}`);

  lines.push('', '## DuckDB Inventory', '');
  for (const entry of report.summary.duckdbInventory) {
    lines.push(`- ${entry.relPath}`);
    lines.push(`  - status: ${entry.status}`);
    lines.push(`  - tables: ${entry.tables?.join(', ') || 'none'}`);
    lines.push(`  - views: ${entry.views?.join(', ') || 'none'}`);
    lines.push(`  - field names: ${entry.actualFieldNames?.join(', ') || 'none'}`);
  }

  lines.push('', '## Checks', '');
  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} [${check.section}] ${check.id}: ${check.message}`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const e = env();
  const report = {
    schema: 'contextual_tree_readiness.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    checks: [],
    lanes: {},
    packetSurfaceDetails: {},
    duckdbInventory: [],
    summary: {
      overall: 'SOURCE_UNAVAILABLE',
      counts: { READY: 0, FIELD_NAME_MISMATCH: 0, MATERIALIZATION_MISSING: 0, SOURCE_UNAVAILABLE: 0, DATA_ABSENT: 0 },
      lanes: {},
      packetSurfaceDetails: {},
      duckdbInventory: [],
    },
  };

  const postgres = await inspectPostgres(e, report);
  const neo4jLane = await inspectNeo4j(e, report);
  const qdrant = await inspectQdrant(e, report);
  const duckdbInventory = listDuckDbInventory().map((entry) => ({
    ...entry,
    ...inspectDuckDbFile(entry.filePath),
  }));
  const duckdbLane = finalizeLane(createLane('duckdb', 'Offline analytical joins / rollups'), {
    ready: duckdbInventory.some((entry) => entry.status === 'READY'),
    fieldNameMismatch: duckdbInventory.some((entry) => entry.status === 'FIELD_NAME_MISMATCH'),
    materializationMissing: duckdbInventory.some((entry) => entry.status === 'MATERIALIZATION_MISSING'),
    dataAbsent: duckdbInventory.every((entry) => entry.status === 'DATA_ABSENT'),
    sourceUnavailable: duckdbInventory.every((entry) => entry.status === 'SOURCE_UNAVAILABLE'),
    evidence: duckdbInventory.slice(0, 5).flatMap((entry) => entry.evidence ?? []),
    actualFieldNames: uniqueStrings(duckdbInventory.flatMap((entry) => entry.actualFieldNames ?? [])),
    expectedAliasesPresent: uniqueStrings(duckdbInventory.flatMap((entry) => entry.expectedAliasesPresent ?? [])),
    expectedAliasesMissing: uniqueStrings(duckdbInventory.flatMap((entry) => entry.expectedAliasesMissing ?? [])),
    preferredStatus: duckdbInventory.some((entry) => entry.status === 'READY') ? 'READY' : duckdbInventory.some((entry) => entry.status === 'FIELD_NAME_MISMATCH') ? 'FIELD_NAME_MISMATCH' : duckdbInventory.some((entry) => entry.status === 'SOURCE_UNAVAILABLE') ? 'SOURCE_UNAVAILABLE' : 'DATA_ABSENT',
  });
  const couchdb = await inspectCouchDb(e, report);
  const packets = inspectPacketSurfaces(report);

  report.lanes = {
    postgres,
    neo4j: neo4jLane,
    qdrant,
    duckdb: duckdbLane,
    couchdb,
    packets,
  };

  report.packetSurfaceDetails = {
    tmpJsonlFiles: recursiveFiles(path.join(ROOT, '.tmp'), (filePath) => filePath.toLowerCase().endsWith('.jsonl'), 75).map((filePath) => relativeDisplay(ROOT, filePath)),
    tmpNdjsonFiles: recursiveFiles(path.join(ROOT, '.tmp'), (filePath) => filePath.toLowerCase().endsWith('.ndjson'), 75).map((filePath) => relativeDisplay(ROOT, filePath)),
    sourceRefHits: packets.evidence.find((entry) => String(entry).startsWith('sourceRefHits='))?.split('=')[1] ?? '0',
    featureIdHits: packets.evidence.find((entry) => String(entry).startsWith('featureIdHits='))?.split('=')[1] ?? '0',
  };

  report.duckdbInventory = duckdbInventory;
  report.summary = buildSummary(report.lanes, report.packetSurfaceDetails, report.duckdbInventory);

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Overall: ${report.summary.overall}`);
  console.log(`READY ${report.summary.counts.READY} / FIELD_NAME_MISMATCH ${report.summary.counts.FIELD_NAME_MISMATCH} / MATERIALIZATION_MISSING ${report.summary.counts.MATERIALIZATION_MISSING} / SOURCE_UNAVAILABLE ${report.summary.counts.SOURCE_UNAVAILABLE} / DATA_ABSENT ${report.summary.counts.DATA_ABSENT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});