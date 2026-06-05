#!/usr/bin/env node
/**
 * Read-only Parent Atlas production-readiness audit.
 *
 * This script does not mutate Postgres, Redis, Qdrant, Neo4j, DuckDB, or files
 * outside the generated report surface. It verifies the packet/indexing spine:
 *
 *   sourceRef -> Postgres ledger -> NES/CHROM packets -> Redis LOD cache
 *             -> Qdrant payload/vector lookup -> Neo4j contextual tree
 *             -> offline MapReduce/DuckDB artifacts
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';
import { NORMALIZED_COVERAGE_CTE } from './report-production-qdrant-no-som.lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'parent-atlas-production-readiness-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'parent-atlas-production-readiness-report.md');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function env() {
  return {
    ...loadEnvFile(path.join(ROOT, '.env')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
    ...loadEnvFile(path.join(FRONTEND, '.env')),
    ...loadEnvFile(path.join(FRONTEND, '.env.local')),
    ...process.env,
  };
}

function databaseUrl(e) {
  return (
    e.DATABASE_URL ||
    e.ADMIN_DATABASE_URL ||
    `postgresql://${e.DB_USER || 'legal_admin'}:${e.DB_PASSWORD || '123456'}@${e.DB_HOST || '127.0.0.1'}:${e.DB_PORT || '5434'}/${e.DB_NAME || 'legal_ai_db'}`
  );
}

function redisUrl(e) {
  const raw = e.REDIS_URL || '';
  if (/^redis(s)?:\/\//.test(raw)) return raw;
  const host = e.REDIS_HOST || (raw.includes(':') ? raw.split(':')[0] : '127.0.0.1');
  const port = Number(e.REDIS_PORT || (raw.includes(':') ? raw.split(':')[1] : 6379));
  return `redis://${host}:${port}`;
}

function qdrantUrl(e) {
  const raw = e.QDRANT_URL || e.PUBLIC_QDRANT_URL || '';
  if (/^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  const host = e.QDRANT_HOST || '127.0.0.1';
  const port = e.QDRANT_PORT || '6333';
  return `http://${host}:${port}`;
}

function normalizeSourceRefSql(expr) {
  return `regexp_replace(regexp_replace(${expr}, '^(\\.\\./)+', ''), '^sveltekit-frontend/', '')`;
}

function status(ok, warn = false) {
  if (ok) return 'pass';
  return warn ? 'warn' : 'fail';
}

function addCheck(report, section, id, state, message, details = {}) {
  report.checks.push({ section, id, status: state, message, details });
  if (!report.sections[section]) report.sections[section] = [];
  report.sections[section].push({ id, status: state, message, details });
}

async function queryOne(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? {};
}

async function tableExists(pool, tableName) {
  const row = await queryOne(pool, `SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
  return row.exists === true;
}

async function tableCount(pool, tableName) {
  if (!(await tableExists(pool, tableName))) return null;
  const row = await queryOne(pool, `SELECT COUNT(*)::bigint AS count FROM ${tableName}`);
  return Number(row.count ?? 0);
}

async function safeQuery(section, id, report, fn) {
  try {
    return await fn();
  } catch (err) {
    addCheck(report, section, id, 'warn', err instanceof Error ? err.message : String(err));
    return null;
  }
}

function filePresence(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return { exists: false, bytes: 0, relPath };
  const stat = fs.statSync(abs);
  return { exists: true, bytes: stat.size, relPath };
}

function findNdjsonInventory() {
  try {
    const output = execFileSync('rg', [
      '--files',
      '-uuu',
      '-g', '*.ndjson',
      '-g', '!node_modules/**',
      '-g', '!.svelte-kit/**',
      '-g', '!.vite/**',
      '-g', '!dist/**',
      '-g', '!build/**',
    ], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    const files = output.split(/\r?\n/).filter(Boolean);
    return {
      status: 'pass',
      total: files.length,
      sample: files.slice(0, 25),
    };
  } catch (err) {
    return {
      status: 'warn',
      total: 0,
      sample: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function inspectPostgres(pool, report) {
  const tables = [
    'parent_atlas_documents',
    'atlas_feature_map',
    'atlas_feature_map_synthesized',
    'nes_chrom_packets',
    'nes_chrom_kag_dag_hits',
    'route_runtime_packets',
    'task_semantic_packets',
    'codebase_chunk_index',
    'agent_pickup_queue',
  ];

  const counts = {};
  for (const table of tables) {
    const count = await tableCount(pool, table);
    counts[table] = count;
    addCheck(
      report,
      'postgres',
      `table:${table}`,
      count === null ? 'fail' : 'pass',
      count === null ? `${table} is missing` : `${table} exists with ${count} rows`,
      { count },
    );
  }
  report.postgres.tableCounts = counts;

  if (counts.parent_atlas_documents !== null) {
    const summary = await safeQuery('postgres', 'parent_atlas_documents:summary', report, () => queryOne(pool, `
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref <> '')::bigint AS with_source_ref,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL AND feature_id <> '')::bigint AS with_feature_id,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::bigint AS with_summary
      FROM parent_atlas_documents
      WHERE COALESCE(NOT ('vendor' = ANY(tags)), true)
    `));
    if (summary) {
      report.postgres.parentAtlasDocuments = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, Number(v)]));
      addCheck(report, 'postgres', 'parent_atlas_documents:sourceRef', status(Number(summary.with_source_ref) > 0), `Parent Atlas sourceRefs: ${summary.with_source_ref}/${summary.total}`);
      addCheck(report, 'postgres', 'parent_atlas_documents:summaries', status(Number(summary.with_summary) > 0), `Parent Atlas summaries: ${summary.with_summary}/${summary.total}`);
    }
  }

  if (counts.atlas_feature_map !== null) {
    const coverage = await safeQuery('postgres', 'active-topology', report, () => queryOne(pool, `
      ${NORMALIZED_COVERAGE_CTE}
      SELECT
        (SELECT COUNT(*) FROM atlas_feature_map)::bigint AS raw_total,
        (SELECT COUNT(*) FROM atlas_feature_map WHERE som_cluster IS NOT NULL)::bigint AS raw_with_som,
        (SELECT COUNT(*) FROM atlas_feature_map WHERE qdrant_point_id IS NOT NULL)::bigint AS raw_with_qdrant,
        COUNT(*)::bigint AS active_total,
        COUNT(*) FILTER (WHERE som_cluster IS NOT NULL)::bigint AS active_with_som,
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL)::bigint AS active_with_qdrant,
        COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::bigint AS active_qdrant_no_som
      FROM active
    `));
    if (coverage) {
      report.postgres.topologyCoverage = Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, Number(v)]));
      addCheck(
        report,
        'postgres',
        'active-production:topology',
        status(Number(coverage.active_qdrant_no_som) === 0, true),
        `Active production qdrant-without-SOM rows: ${coverage.active_qdrant_no_som}`,
        report.postgres.topologyCoverage,
      );
    }
  }

  if (counts.nes_chrom_packets !== null) {
    const nes = await safeQuery('postgres', 'nes-chrom:join', report, () => queryOne(pool, `
      WITH normalized_packets AS (
        SELECT *, ${normalizeSourceRefSql('source_ref')} AS norm_source_ref
        FROM nes_chrom_packets
      ),
      normalized_pad AS (
        SELECT *, ${normalizeSourceRefSql('source_ref')} AS norm_source_ref
        FROM parent_atlas_documents
      )
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE p.source_ref IS NOT NULL)::bigint AS parent_atlas_matches,
        COUNT(*) FILTER (WHERE n.source_ref IS NOT NULL AND n.source_ref <> '')::bigint AS with_source_ref,
        COUNT(*) FILTER (WHERE n.feature_id IS NOT NULL AND n.feature_id <> '')::bigint AS with_feature_id,
        COUNT(*) FILTER (WHERE n.qdrant_point_id IS NOT NULL AND n.qdrant_point_id <> '')::bigint AS with_qdrant_point,
        COUNT(*) FILTER (WHERE n.som_cluster IS NOT NULL AND n.som_cluster <> '')::bigint AS with_som_cluster
      FROM normalized_packets n
      LEFT JOIN normalized_pad p ON p.norm_source_ref = n.norm_source_ref
    `));
    if (nes) {
      report.postgres.nesChromPackets = Object.fromEntries(Object.entries(nes).map(([k, v]) => [k, Number(v)]));
      addCheck(report, 'postgres', 'nes-chrom:sourceRef-parent-join', status(Number(nes.parent_atlas_matches) > 0, true), `NES/CHROM packets matching Parent Atlas: ${nes.parent_atlas_matches}/${nes.total}`);
    }
  }

  if (counts.route_runtime_packets !== null) {
    const runtime = await safeQuery('postgres', 'route-runtime:summary', report, () => queryOne(pool, `
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(source_refs), 0) > 0)::bigint AS with_source_refs,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(feature_ids), 0) > 0)::bigint AS with_feature_ids,
        COUNT(*) FILTER (WHERE COALESCE(qdrant_hits, 0) > 0)::bigint AS with_qdrant_hits,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(som_cluster, ''), NULLIF(cluster_id, '')) IS NOT NULL)::bigint AS with_cluster
      FROM route_runtime_packets
    `));
    if (runtime) {
      report.postgres.routeRuntimePackets = Object.fromEntries(Object.entries(runtime).map(([k, v]) => [k, Number(v)]));
      addCheck(report, 'postgres', 'route-runtime:sourceRefs', status(Number(runtime.with_source_refs) > 0), `Runtime packets with sourceRefs: ${runtime.with_source_refs}/${runtime.total}`);
    }
  }
}

async function inspectRedis(e, pool, report) {
  if (!(await tableExists(pool, 'route_runtime_packets'))) {
    addCheck(report, 'redis', 'lod0:route-runtime', 'warn', 'route_runtime_packets is missing; skipped Redis LOD probe');
    return;
  }
  const rows = await safeQuery('redis', 'lod0:latest-ids', report, async () => {
    const { rows } = await pool.query(`
      SELECT id::text
      FROM route_runtime_packets
      ORDER BY captured_at DESC
      LIMIT 50
    `);
    return rows;
  });
  const ids = Array.isArray(rows) ? rows.map((row) => row.id) : [];
  const redis = new Redis(redisUrl(e), {
    password: e.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const keys = ids.map((id) => `ace:telemetry:${id}:lod0`);
    const values = keys.length ? await redis.mget(keys) : [];
    const found = values.filter(Boolean).length;
    report.redis = { available: true, latestRuntimePacketsChecked: ids.length, lod0Found: found, lod0Missing: keys.length - found };
    addCheck(report, 'redis', 'lod0:route-runtime', status(found > 0 || ids.length === 0, true), `Redis LOD0 runtime packets: ${found}/${ids.length}`);
  } catch (err) {
    report.redis = { available: false, error: err instanceof Error ? err.message : String(err) };
    addCheck(report, 'redis', 'connect', 'warn', report.redis.error);
  } finally {
    try {
      if (redis.status !== 'end') await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

async function inspectQdrant(e, report) {
  const base = qdrantUrl(e);
  const headers = e.QDRANT_API_KEY ? { 'api-key': e.QDRANT_API_KEY } : {};
  try {
    const res = await fetch(`${base}/collections/codebase_chunks_768`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    const result = data.result ?? {};
    report.qdrant = {
      available: true,
      url: base,
      collection: 'codebase_chunks_768',
      pointsCount: Number(result.points_count ?? result.vectors_count ?? 0),
      indexedVectorsCount: Number(result.indexed_vectors_count ?? 0),
      status: result.status ?? null,
    };
    addCheck(report, 'qdrant', 'collection:codebase_chunks_768', status(report.qdrant.pointsCount > 0), `Qdrant codebase_chunks_768 points: ${report.qdrant.pointsCount}`);
  } catch (err) {
    report.qdrant = { available: false, url: base, error: err instanceof Error ? err.message : String(err) };
    addCheck(report, 'qdrant', 'collection:codebase_chunks_768', 'warn', report.qdrant.error);
  }
}

async function inspectNeo4j(e, report) {
  const uri = e.NEO4J_URI || 'bolt://127.0.0.1:7687';
  const user = e.NEO4J_USER || e.NEO4J_USERNAME || 'neo4j';
  const pass = e.NEO4J_PASSWORD || e.NEO4J_PASS || 'neo4j123';
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const session = driver.session({ database: 'neo4j' });
  try {
    const res = await session.run(`
      MATCH (n)
      WITH count(n) AS total_nodes
      CALL {
        MATCH (c:CodebaseFile)
        RETURN count(c) AS codebase_files
      }
      CALL {
        MATCH (f:ParentAtlasFeature)
        RETURN count(f) AS parent_atlas_features
      }
      CALL {
        MATCH ()-[r]->()
        RETURN count(r) AS total_relationships
      }
      CALL {
        MATCH ()-[r:BELONGS_TO_FEATURE]->()
        RETURN count(r) AS belongs_to_feature
      }
      CALL {
        MATCH ()-[r:SIMILAR_TOPOLOGY]->()
        RETURN count(r) AS similar_topology
      }
      RETURN
        total_nodes,
        codebase_files,
        parent_atlas_features,
        total_relationships,
        belongs_to_feature,
        similar_topology
    `);
    const row = res.records[0];
    const toNumber = (key) => Number(row.get(key)?.toString?.() ?? row.get(key) ?? 0);
    report.neo4j = {
      available: true,
      uri,
      totalNodes: toNumber('total_nodes'),
      codebaseFiles: toNumber('codebase_files'),
      parentAtlasFeatures: toNumber('parent_atlas_features'),
      totalRelationships: toNumber('total_relationships'),
      belongsToFeature: toNumber('belongs_to_feature'),
      similarTopology: toNumber('similar_topology'),
    };
    addCheck(report, 'neo4j', 'contextual-tree', status(report.neo4j.codebaseFiles > 0 && report.neo4j.parentAtlasFeatures > 0, true), `Neo4j CodebaseFile=${report.neo4j.codebaseFiles}, ParentAtlasFeature=${report.neo4j.parentAtlasFeatures}`);
  } catch (err) {
    report.neo4j = { available: false, uri, error: err instanceof Error ? err.message : String(err) };
    addCheck(report, 'neo4j', 'contextual-tree', 'warn', report.neo4j.error);
  } finally {
    await session.close().catch(() => {});
    await driver.close().catch(() => {});
  }
}

function inspectDrizzle(report) {
  const files = {
    nesChromSchema: 'sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts',
    routeRuntimeSchema: 'sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts',
    schemaIndex: 'sveltekit-frontend/src/lib/server/db/schema/index.ts',
    schemaPostgres: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
  };
  report.drizzle = {};
  for (const [key, relPath] of Object.entries(files)) {
    const present = filePresence(relPath);
    report.drizzle[key] = present;
    addCheck(report, 'drizzle', key, present.exists ? 'pass' : 'fail', present.exists ? `${relPath} exists` : `${relPath} missing`, present);
  }

  const indexText = fs.existsSync(path.join(ROOT, files.schemaIndex)) ? fs.readFileSync(path.join(ROOT, files.schemaIndex), 'utf8') : '';
  const pgText = fs.existsSync(path.join(ROOT, files.schemaPostgres)) ? fs.readFileSync(path.join(ROOT, files.schemaPostgres), 'utf8') : '';
  const mirrors = {
    indexExportsNesChrom: indexText.includes("./nes-chrom-packets.js"),
    indexExportsRouteRuntime: indexText.includes("./route_runtime_packets.js"),
    postgresExportsNesChrom: pgText.includes("./schema/nes-chrom-packets.js"),
  };
  report.drizzle.mirrors = mirrors;
  addCheck(report, 'drizzle', 'mirrors:nes-chrom-route-runtime', status(Object.values(mirrors).every(Boolean)), 'Drizzle barrels mirror NES/CHROM and route runtime packet schemas', mirrors);
}

function inspectOfflineArtifacts(report) {
  const artifacts = [
    '.tmp/offline-synthesis/consolidated-index.ndjson',
    '.tmp/offline-synthesis/consolidated-index.ndjson.manifest.json',
    'docs/reports/offline-synthesis-mapreduce.duckdb',
    'docs/reports/offline-synthesis-mapreduce-duckdb-report.json',
    'docs/reports/offline-synthesis-mapreduce-duckdb-report.md',
    'docs/reports/production-qdrant-no-som-report.json',
    'docs/reports/route-runtime-packets-report.json',
  ];
  report.offlineArtifacts = artifacts.map(filePresence);
  for (const artifact of report.offlineArtifacts) {
    addCheck(report, 'offline', artifact.relPath, artifact.exists ? 'pass' : 'warn', artifact.exists ? `${artifact.relPath} exists` : `${artifact.relPath} missing`, artifact);
  }
  report.ndjsonInventory = findNdjsonInventory();
  addCheck(report, 'offline', 'rg-uu:ndjson-inventory', report.ndjsonInventory.status, `rg -uuu found ${report.ndjsonInventory.total} NDJSON files`, { sample: report.ndjsonInventory.sample });
}

function renderMarkdown(report) {
  const counts = report.summary.counts;
  const lines = [
    '# Parent Atlas Production Readiness Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- PASS: ${counts.pass}`,
    `- WARN: ${counts.warn}`,
    `- FAIL: ${counts.fail}`,
    '',
    '## Key Signals',
    '',
    `- Parent Atlas documents: ${report.postgres.tableCounts?.parent_atlas_documents ?? 'n/a'}`,
    `- Atlas feature map rows: ${report.postgres.tableCounts?.atlas_feature_map ?? 'n/a'}`,
    `- NES/CHROM packets: ${report.postgres.tableCounts?.nes_chrom_packets ?? 'n/a'}`,
    `- Route runtime packets: ${report.postgres.tableCounts?.route_runtime_packets ?? 'n/a'}`,
    `- Qdrant points: ${report.qdrant?.pointsCount ?? 'n/a'}`,
    `- Neo4j CodebaseFile nodes: ${report.neo4j?.codebaseFiles ?? 'n/a'}`,
    `- Redis LOD0 latest packet coverage: ${report.redis?.lod0Found ?? 'n/a'}/${report.redis?.latestRuntimePacketsChecked ?? 'n/a'}`,
    `- NDJSON files discovered with rg -uuu: ${report.ndjsonInventory?.total ?? 'n/a'}`,
    '',
    '## Checks',
    '',
  ];
  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} [${check.section}] ${check.id}: ${check.message}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This audit is read-only. It does not run migrations, push Drizzle schema, prune Qdrant, archive files, or mutate production data.');
  lines.push('- Qdrant remains the semantic lookup/filter engine; topology math remains external and is audited through payload/table signals.');
  lines.push('- Louvain/PageRank are graph algorithms, not PCA/matmul lanes. This report only checks whether Neo4j graph truth is present.');
  lines.push('- Cold-storage readiness is treated as provenance visibility here. Actual archive/move flows remain gated.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const e = env();
  const report = {
    schema: 'parent_atlas_production_readiness.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    sections: {},
    checks: [],
    postgres: {},
    redis: {},
    qdrant: {},
    neo4j: {},
    drizzle: {},
    offlineArtifacts: [],
    ndjsonInventory: null,
    summary: { counts: { pass: 0, warn: 0, fail: 0 } },
  };

  inspectDrizzle(report);
  inspectOfflineArtifacts(report);

  const pool = new pg.Pool({ connectionString: databaseUrl(e) });
  try {
    await inspectPostgres(pool, report);
    await inspectRedis(e, pool, report);
  } catch (err) {
    addCheck(report, 'postgres', 'connect', 'fail', err instanceof Error ? err.message : String(err));
  } finally {
    await pool.end().catch(() => {});
  }

  await inspectQdrant(e, report);
  await inspectNeo4j(e, report);

  for (const check of report.checks) {
    if (check.status === 'pass') report.summary.counts.pass += 1;
    else if (check.status === 'warn') report.summary.counts.warn += 1;
    else report.summary.counts.fail += 1;
  }

  await fsp.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsp.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fsp.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log('Parent Atlas production-readiness audit');
  console.log(`PASS ${report.summary.counts.pass} / WARN ${report.summary.counts.warn} / FAIL ${report.summary.counts.fail}`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);

  if (report.summary.counts.fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[parent-atlas-production-readiness] fatal:', err);
  process.exit(1);
});
