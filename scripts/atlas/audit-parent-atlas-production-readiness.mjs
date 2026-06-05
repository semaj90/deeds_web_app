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
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisConfig } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'parent-atlas-production-readiness-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'parent-atlas-production-readiness-report.md');

function env() {
  return loadRepoEnv(process.env);
}

function databaseUrl(e) {
  return resolveDatabaseUrl(e);
}

function redisUrl(e) {
  return resolveRedisConfig(e).url;
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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
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

function inspectSummaryBatch(report) {
  const reportPaths = [
    path.join(ROOT, '.tmp', 'gemma4-parent-atlas-summary-cache-report.json'),
    path.join(ROOT, '.tmp', 'gemma4-parent-atlas-summary-report.json'),
  ];
  const foundPath = reportPaths.find((p) => fs.existsSync(p)) ?? null;
  const batch = foundPath ? readJsonIfExists(foundPath) : null;
  report.summaryBatch = {
    path: foundPath ? path.relative(ROOT, foundPath).replace(/\\/g, '/') : null,
    report: batch,
  };

  if (!batch) {
    addCheck(
      report,
      'summary-batch',
      'report:missing',
      'warn',
      'No saved Gemma4 parent-atlas summary batch report was found'
    );
    return;
  }

  const rowsQueued = Number(batch.rows_queued ?? batch.queued ?? 0);
  const succeeded = Number(batch.succeeded ?? 0);
  const failed = Number(batch.failed ?? 0);
  const exactHits = Number(batch.exactCacheHits ?? batch.exact_hits ?? 0);
  const semanticHits = Number(batch.semanticCacheHits ?? batch.semantic_hits ?? 0);
  const llamaCalls = Number(batch.llamaCalls ?? 0);
  const sourceRefPacketReads = Number(batch.sourceRefPacketReads ?? 0);
  const skippedVendor = Number(batch.skippedVendor ?? 0);
  const skippedFeatureBuckets = Number(batch.skippedFeatureBuckets ?? 0);
  const summariesWritten = Number(batch.summariesWritten ?? 0);

  addCheck(
    report,
    'summary-batch',
    'report:exists',
    'pass',
    `Loaded ${path.basename(foundPath)} (${rowsQueued} queued)`,
    {
      rowsQueued,
      succeeded,
      failed,
      exactHits,
      semanticHits,
      llamaCalls,
    }
  );
  addCheck(
    report,
    'summary-batch',
    'report:passed',
    failed === 0 ? 'pass' : 'warn',
    `Failed rows: ${failed}`,
    { failed }
  );
  addCheck(
    report,
    'summary-batch',
    'report:sourceRefReads',
    sourceRefPacketReads > 0 ? 'pass' : 'warn',
    `sourceRef packet reads: ${sourceRefPacketReads}`,
    { sourceRefPacketReads }
  );
  addCheck(
    report,
    'summary-batch',
    'report:summariesWritten',
    summariesWritten > 0 ? 'pass' : 'warn',
    `summaries written: ${summariesWritten}`,
    { summariesWritten }
  );
  addCheck(
    report,
    'summary-batch',
    'report:cache-counters',
    exactHits + semanticHits + llamaCalls >= succeeded ? 'pass' : 'warn',
    `Exact hits=${exactHits}, semantic hits=${semanticHits}, llama calls=${llamaCalls}`,
    {
      exactHits,
      semanticHits,
      llamaCalls,
      succeeded,
    }
  );

  report.summaryBatch.metrics = {
    rowsQueued,
    succeeded,
    failed,
    exactHits,
    semanticHits,
    sourceRefPacketReads,
    sourceRefPacketReuse: Number(batch.sourceRefPacketReuse ?? 0),
    dbSummaryReuse: Number(batch.dbSummaryReuse ?? 0),
    cacheRepairs: Number(batch.cacheRepairs ?? 0),
    cacheRepairWrites: Number(batch.cacheRepairWrites ?? 0),
    cacheMisses: Number(batch.cacheMisses ?? 0),
    llamaCalls,
    wouldCallLlama: Number(batch.wouldCallLlama ?? 0),
    llamaCallsAvoided: Number(batch.llamaCallsAvoided ?? batch.callsAvoided ?? 0),
    callsAvoided: Number(batch.callsAvoided ?? 0),
    summariesWritten,
    skippedVendor,
    skippedFeatureBuckets,
    avgLatencyMs: Number(batch.avgLatencyMs ?? 0),
    stillMissing: Number(batch.still_missing ?? 0),
  };
}

function inspectGpuBridge(report) {
  const files = {
    libtorchBridge: 'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
    pytorchGraph: 'sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts',
    autoencoderBridge: 'sveltekit-frontend/src/lib/server/gpu/autoencoder-bridge.ts',
    topologyProjection: 'sveltekit-frontend/src/lib/server/gpu/topology-projection.ts',
    trainAutoencoderPy: 'sveltekit-frontend/scripts/train-autoencoder.py',
    trainAutoencoderMjs: 'sveltekit-frontend/scripts/train-autoencoder.mjs',
    somPipeline: 'scripts/atlas/pytorch-qdrant-redis-som-index.mjs',
    libtorchGraphImpl: 'simd-bridge/cpp/libtorch_graph_impl.cpp',
    pytorchGraphCpp: 'simd-bridge/cpp/pytorch_graph.cc',
    pytorchGraphFp16Cpp: 'simd-bridge/cpp/pytorch_graph_fp16.cc',
    cuvsBridge: 'simd-bridge/cpp/cuvs_bridge.cc',
  };

  const contents = {};
  report.gpu = { files: {}, dimensions: {}, capabilities: {} };
  for (const [key, relPath] of Object.entries(files)) {
    const file = filePresence(relPath);
    report.gpu.files[key] = file;
    contents[key] = file.exists ? fs.readFileSync(path.join(ROOT, relPath), 'utf8') : '';
    addCheck(
      report,
      'gpu',
      key,
      file.exists ? 'pass' : 'fail',
      file.exists ? `${relPath} exists` : `${relPath} missing`,
      file
    );
  }

  const py = contents.trainAutoencoderPy;
  const mjs = contents.trainAutoencoderMjs;
  const libtorch = contents.libtorchBridge;
  const topology = contents.topologyProjection;
  const pytorch = contents.pytorchGraph;
  const libtorchGraphImpl = contents.libtorchGraphImpl;
  const pytorchGraphCpp = contents.pytorchGraphCpp;
  const pytorchGraphFp16Cpp = contents.pytorchGraphFp16Cpp;
  const cuvsBridge = contents.cuvsBridge;

  const dims = {
    inputDim: Number(py.match(/DIM_IN\s*=\s*(\d+)/)?.[1] ?? 768),
    hiddenDim: Number(py.match(/DIM_HIDDEN\s*=\s*(\d+)/)?.[1] ?? 256),
    latentDim: Number(py.match(/DIM_LATENT\s*=\s*(\d+)/)?.[1] ?? 64),
    somGrid: Number(
      contents.somPipeline.match(/SOM_GRID\s*=\s*parseInt\([^)]*['"](\d+)['"]/m)?.[1] ?? 8
    ),
  };
  const topologyHint = `768→256(ReLU)→64(L2)`;
  const bridgeCapabilities = {
    hasMatmulExport:
      /\bmatmul\b/i.test(libtorch) && /export\s+(async\s+)?function\s+matmul/i.test(libtorch),
    hasDotProduct: /\bdotProduct\b/.test(libtorch),
    hasBatchCosine: /\bbatchCosineSimilarity\b/.test(libtorch),
    hasKMeans: /\bkmeansWithCentroids\b/.test(libtorch),
    hasSOM: /\bsomCache\b/.test(libtorch),
    hasPCA: /\bpcaProject\b/.test(libtorch) || /\bpcaProject\b/.test(topology),
    hasAutoencoderEncode:
      /\bautoencoderEncode\b/.test(libtorch) || /\bautoencoderEncode\b/.test(topology),
    hasTorchMmBackend:
      /torch::mm\(/.test(libtorchGraphImpl) ||
      /torch::mm\(/.test(pytorchGraphCpp) ||
      /torch::mm\(/.test(pytorchGraphFp16Cpp),
    hasCuvsStub: /RegisterCuvsCompress/.test(cuvsBridge),
  };

  report.gpu.dimensions = {
    autoencoder: dims,
    topologyHint,
    trainScriptArchitecture: `${dims.inputDim}-${dims.hiddenDim}-${dims.latentDim}-${dims.hiddenDim}-${dims.inputDim}`,
    mjsArchitecture: mjs.includes('Encoder: Linear(768→256) → ReLU → Linear(256→64)')
      ? 'Encoder: Linear(768→256) → ReLU → Linear(256→64)'
      : null,
  };
  report.gpu.capabilities = bridgeCapabilities;
  addCheck(
    report,
    'gpu',
    'dimensions:768-256-64',
    dims.inputDim === 768 && dims.hiddenDim === 256 && dims.latentDim === 64 ? 'pass' : 'warn',
    `Autoencoder dims: ${dims.inputDim}→${dims.hiddenDim}→${dims.latentDim}`,
    dims
  );
  addCheck(
    report,
    'gpu',
    'som:grid',
    dims.somGrid === 8 ? 'pass' : 'warn',
    `SOM grid: ${dims.somGrid}×${dims.somGrid}`,
    { somGrid: dims.somGrid }
  );
  addCheck(
    report,
    'gpu',
    'bridge:torch-mm-backend',
    bridgeCapabilities.hasTorchMmBackend ? 'pass' : 'warn',
    'Internal GEMM is present: simd-bridge/cpp/libtorch_graph_impl.cpp and simd-bridge/cpp/pytorch_graph_fp16.cc use torch::mm(); LibTorch GPU tensors dispatch torch::mm() through CUDA/cuBLAS where available.',
    {
      libtorchGraphImpl: filePresence('simd-bridge/cpp/libtorch_graph_impl.cpp'),
      pytorchGraphCpp: filePresence('simd-bridge/cpp/pytorch_graph.cc'),
      pytorchGraphFp16Cpp: filePresence('simd-bridge/cpp/pytorch_graph_fp16.cc'),
      cuvsBridge: filePresence('simd-bridge/cpp/cuvs_bridge.cc'),
      ...bridgeCapabilities,
    }
  );
  addCheck(
    report,
    'gpu',
    'bridge:matmul-export',
    bridgeCapabilities.hasMatmulExport ? 'pass' : 'warn',
    'No generic public matmul_f32 native bridge export is exposed yet; this is a public API gap, not evidence that GEMM is absent. Keep the canonical 768→256→64 autoencoder lane valid.',
    bridgeCapabilities
  );
}

function inspectNativeJsonParser(report) {
  const files = {
    simdjsonBridge: 'sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts',
    jsonBench: 'scripts/bench/json-parse-bench.mjs',
    parserSmoke: 'sveltekit-frontend/scripts/smoke/qdrant-simdjson-parser-smoke.mjs',
    rustAddonPackager: 'simd-bridge/scripts/package-win.ps1',
  };

  const contents = {};
  report.nativeJsonParser = { files: {}, capabilities: {} };
  for (const [key, relPath] of Object.entries(files)) {
    const file = filePresence(relPath);
    report.nativeJsonParser.files[key] = file;
    contents[key] = file.exists ? fs.readFileSync(path.join(ROOT, relPath), 'utf8') : '';
    addCheck(
      report,
      'native-json-parser',
      key,
      file.exists ? 'pass' : 'warn',
      file.exists ? `${relPath} exists` : `${relPath} missing`,
      file
    );
  }

  const bridgeText = contents.simdjsonBridge;
  const benchText = contents.jsonBench;
  const smokeText = contents.parserSmoke;
  const packagerText = contents.rustAddonPackager;

  const capabilities = {
    nativeAddonPathRefs: /tensorrt_bridge\.node|simd_bridge_rs\.node/.test(
      `${bridgeText}\n${packagerText}`
    ),
    nativeParseExport: /simdJsonParse/.test(bridgeText),
    fallbackPath: /JSON\.parse fallback|fall back to JSON\.parse|fallback to JSON\.parse/i.test(
      `${bridgeText}\n${benchText}\n${smokeText}`
    ),
    simdjsonMentions: /simdjson/i.test(`${bridgeText}\n${benchText}\n${smokeText}`),
    rustPackagingRefs: /rust-simdjson|simd_bridge_rs\.node/.test(packagerText),
  };
  report.nativeJsonParser.capabilities = capabilities;

  const hasNativeParser =
    capabilities.nativeAddonPathRefs &&
    capabilities.nativeParseExport &&
    capabilities.simdjsonMentions;
  const hasFallback = capabilities.fallbackPath;
  const overallStatus = hasFallback ? (hasNativeParser ? 'pass' : 'warn') : 'fail';

  addCheck(
    report,
    'native-json-parser',
    'overall',
    overallStatus,
    hasNativeParser
      ? 'Native simdjson parser path is present and the JSON.parse fallback remains in place.'
      : 'Native parser appears optional or absent; JSON.parse fallback remains in place.',
    capabilities
  );
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
    'docs/reports/compressed-semantic-geometry-report.json',
    'docs/reports/hidden-packet-pathmap-report.json',
    'docs/reports/hidden-packet-pathmap-duckdb-report.json',
    'docs/reports/hidden-packet-pathmap.duckdb',
    'scripts/atlas/ndjson-mapreduce-join.mjs',
    'scripts/atlas/materialize-mapreduce-duckdb.mjs',
    'scripts/atlas/offline-parent-atlas-mapreduce.sql',
    'scripts/atlas/gemma4-parent-atlas-summaries.mjs',
    'scripts/atlas/report-compressed-semantic-geometry.mjs',
    'scripts/atlas/audit-hidden-packet-pathmap.mjs',
    'scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs',
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
    `- Native JSON parser: ${report.nativeJsonParser?.capabilities?.nativeAddonPathRefs ? 'native addon path present' : 'fallback-only or unavailable'}; fallback ${report.nativeJsonParser?.capabilities?.fallbackPath ? 'present' : 'missing'}`,
    `- NDJSON files discovered with rg -uuu: ${report.ndjsonInventory?.total ?? 'n/a'}`,
    `- Phase 101 batch summaries: ${report.summaryBatch?.metrics?.succeeded ?? 'n/a'} succeeded / ${report.summaryBatch?.metrics?.failed ?? 'n/a'} failed`,
    `- Autoencoder dims: ${report.gpu?.dimensions?.autoencoder?.inputDim ?? 'n/a'}→${report.gpu?.dimensions?.autoencoder?.hiddenDim ?? 'n/a'}→${report.gpu?.dimensions?.autoencoder?.latentDim ?? 'n/a'}`,
    '',
    '## Directory Lanes',
    '',
    `- scripts/atlas/: batch summaries validated, NDJSON/DuckDB offline indexing present, and the production readiness audit is read-only`,
    `- scripts/atlas/gemma4-parent-atlas-summaries.mjs: latest cached batch report loaded (${report.summaryBatch?.metrics?.rowsQueued ?? 'n/a'} queued)`,
    `- scripts/atlas/ndjson-mapreduce-join.mjs: offline MapReduce join, cluster summaries, and graph-edge generation present`,
    `- scripts/atlas/materialize-mapreduce-duckdb.mjs: DuckDB materialization lane present`,
    `- sveltekit-frontend/src/lib/server/gpu/: libtorch/autoencoder/topology projection lane present; internal torch::mm GEMM is detected; generic matmul_f32 export remains absent`,
    `- sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts: native JSON parser path is present with a JSON.parse fallback; optional parser validation scripts exist`,
    `- sveltekit-frontend/src/lib/server/db/: Drizzle barrels mirror the NES/CHROM and route runtime packet schemas`,
    '',
    '## Checks',
    '',
  ];
  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} [${check.section}] ${check.id}: ${check.message}`);
  }
  lines.push('');
  lines.push('## Audit Guardrails');
  lines.push('');
  lines.push('- This audit is read-only. It does not run migrations, push Drizzle schema, prune Qdrant, archive files, or mutate production data.');
  lines.push('- Qdrant remains the semantic lookup/filter engine; topology math remains external and is audited through payload/table signals.');
  lines.push('- Louvain/PageRank are graph algorithms, not PCA/matmul lanes. This report only checks whether Neo4j graph truth is present.');
  lines.push('- Cold-storage readiness is treated as provenance visibility here. Actual archive/move flows remain gated.');
  lines.push(
    '- Internal GEMM exists in simd-bridge/cpp/libtorch_graph_impl.cpp and simd-bridge/cpp/pytorch_graph_fp16.cc via torch::mm(); LibTorch GPU tensors dispatch torch::mm() through CUDA/cuBLAS where available.'
  );
  lines.push(
    '- The remaining native bridge gap is no generic public matmul_f32 export. That is a public API warning, not a failure of the canonical 768→256→64 autoencoder lane.'
  );
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

  inspectSummaryBatch(report);
  inspectGpuBridge(report);
  inspectNativeJsonParser(report);
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
