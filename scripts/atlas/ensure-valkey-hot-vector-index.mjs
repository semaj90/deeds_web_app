#!/usr/bin/env node

/**
 * Valkey Hot-Vector Index Provisioner — `atlas_hot_vectors_v1`
 *
 * Optional: creates a bounded hot-vector cache in Valkey. Only run this if
 * you have a measured use case requiring hot-vector retrieval; the
 * documented default is NOT to enable this (Qdrant owns the full-corpus
 * semantic index; Valkey is a cache/routing layer only).
 *
 * Documented contract (the only thing with real backing — no design doc or
 * code consumer for `atlas_hot_vectors_v1` exists anywhere in this repo as
 * of 2026-08-01; do NOT extend this schema speculatively):
 *   index:          atlas_hot_vectors_v1
 *   prefix:         atlas:hot-vector:
 *   storage:        HASH
 *   vector field:   vector, FLOAT32, 768-dim, COSINE distance
 *   representation: embeddinggemma_300m_768_native_v1 (representation_id tag field)
 *   owner:          Qdrant holds the full corpus; this is a bounded hot cache only
 *   algorithm:      FLAT (small working set — no HNSW build/tuning needed)
 *
 * Usage:
 *   node ensure-valkey-hot-vector-index.mjs [--preflight|--apply] [--verbose]
 *   (no flag = preflight only; this script NEVER writes without --apply)
 *
 * Every run prints exactly one JSON line to stdout as its last line, for
 * automation to parse. That JSON line is the source of truth — human-
 * readable lines above it (only with --verbose) are for a person reading
 * the terminal, not for a script deciding whether provisioning happened.
 *
 * Exit codes: 0 = preflight/apply genuinely succeeded (see `status` field
 * for what that means — 'ready_to_provision' on a bare preflight is a
 * PASS, not "created"). Non-zero = blocked, schema drift, or error. This
 * script never prints "deferred" and exits 0 — a stub or unsupported
 * capability is a distinct nonzero `status: "blocked"` result.
 */

import { createAtlasRedisClient, getAtlasRedisConfig } from './lib/redis-client-factory.mjs';

const INDEX_NAME = 'atlas_hot_vectors_v1';
const KEY_PREFIX = 'atlas:hot-vector:';
const VECTOR_FIELD = 'vector';
const DIMENSIONS = 768;
const DISTANCE_METRIC = 'COSINE';
const REPRESENTATION_ID = 'embeddinggemma_300m_768_native_v1';

const isApply = process.argv.includes('--apply');
const isPreflight = process.argv.includes('--preflight') || !isApply; // default = preflight
const isVerbose = process.argv.includes('--verbose');

function log(...args) {
  if (isVerbose) console.log(...args);
}

function parseFtInfo(flatArray) {
  const map = {};
  for (let i = 0; i < flatArray.length; i += 2) map[flatArray[i]] = flatArray[i + 1];
  return map;
}

function emitResult(result) {
  // Exactly one JSON line, always the last line of output.
  console.log(JSON.stringify(result));
  process.exit(result.status === 'ready_to_provision' || result.status === 'proven_existing' || result.status === 'provisioned' ? 0 : 1);
}

async function inspectIndex(redis) {
  let modules;
  try {
    modules = await redis.call('MODULE', 'LIST');
  } catch (err) {
    return { error: `MODULE LIST failed: ${err.message}` };
  }
  const searchModule = Array.isArray(modules)
    ? modules.map((m) => parseFtInfo(m)).find((m) => m.name === 'search')
    : null;
  const searchModulePresent = Boolean(searchModule);

  if (!searchModulePresent) {
    return { searchModulePresent: false, indexExists: false, indexInfo: null };
  }

  let indexList;
  try {
    indexList = await redis.call('FT._LIST');
  } catch (err) {
    return { error: `FT._LIST failed: ${err.message}` };
  }
  const indexExists = Array.isArray(indexList) && indexList.includes(INDEX_NAME);

  let indexInfo = null;
  if (indexExists) {
    try {
      const raw = await redis.call('FT.INFO', INDEX_NAME);
      indexInfo = parseFtInfo(raw);
    } catch (err) {
      return { error: `FT.INFO failed on existing index: ${err.message}` };
    }
  }

  return { searchModulePresent: true, indexExists, indexInfo };
}

/** Compare an existing index's FT.INFO against the documented contract. Returns null if it matches. */
function diffAgainstContract(indexInfo) {
  const diffs = [];

  const prefixes = Array.isArray(indexInfo.index_definition)
    ? parseFtInfo(indexInfo.index_definition).prefixes
    : undefined;
  if (!Array.isArray(prefixes) || !prefixes.includes(KEY_PREFIX)) {
    diffs.push({ field: 'prefix', expected: KEY_PREFIX, actual: prefixes });
  }

  const storageType = Array.isArray(indexInfo.index_definition)
    ? parseFtInfo(indexInfo.index_definition).key_type
    : undefined;
  if (storageType && storageType !== 'HASH') {
    diffs.push({ field: 'storage', expected: 'HASH', actual: storageType });
  }

  const attributes = Array.isArray(indexInfo.attributes) ? indexInfo.attributes.map(parseFtInfo) : [];
  const vectorAttr = attributes.find((a) => a.attribute === VECTOR_FIELD || a.identifier === VECTOR_FIELD);
  if (!vectorAttr) {
    diffs.push({ field: 'vector_field', expected: VECTOR_FIELD, actual: null });
  } else {
    // The vector attribute's numeric contract (dims/distance/data type) is nested
    // one level deeper under its own "index" sub-object — RediSearch's FT.INFO
    // response shape, not something to skip checking.
    const vectorIndexInfo = Array.isArray(vectorAttr.index) ? parseFtInfo(vectorAttr.index) : {};
    const actualDims = Number(vectorIndexInfo.dimensions ?? vectorIndexInfo.dim);
    if (actualDims !== DIMENSIONS) {
      diffs.push({ field: 'dimensions', expected: DIMENSIONS, actual: vectorIndexInfo.dimensions ?? vectorIndexInfo.dim ?? null });
    }
    const actualDistance = vectorIndexInfo.distance_metric;
    if (actualDistance && actualDistance !== DISTANCE_METRIC) {
      diffs.push({ field: 'distance_metric', expected: DISTANCE_METRIC, actual: actualDistance });
    }
    const actualDataType = vectorIndexInfo.data_type;
    if (actualDataType && actualDataType !== 'FLOAT32') {
      diffs.push({ field: 'data_type', expected: 'FLOAT32', actual: actualDataType });
    }
  }

  return diffs.length > 0 ? diffs : null;
}

async function main() {
  const configSummary = getAtlasRedisConfig(); // password already redacted
  log('[valkey:hot-vector-index] Config (redacted):', JSON.stringify(configSummary));
  log('[valkey:hot-vector-index] Contract:');
  log(`  Index:             ${INDEX_NAME}`);
  log(`  Prefix:            ${KEY_PREFIX}`);
  log(`  Storage:           HASH`);
  log(`  Vector field:      ${VECTOR_FIELD}`);
  log(`  Dimensions:        ${DIMENSIONS}`);
  log(`  Distance:          ${DISTANCE_METRIC}`);
  log(`  Representation:    ${REPRESENTATION_ID}`);
  log(`  Mode:              ${isApply ? 'apply' : 'preflight'}`);

  const redis = createAtlasRedisClient();
  let serverInfo = { server: 'unknown', server_version: null };

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (String(pong).toUpperCase() !== 'PONG') {
      emitResult({
        status: 'blocked',
        reason: 'ping_failed',
        server: serverInfo.server,
        index: INDEX_NAME,
        write_attempted: false,
      });
      return;
    }
    log('[valkey:hot-vector-index] PING -> PONG (authenticated)');

    try {
      const rawInfo = await redis.info('server');
      const serverName = /server_name:(\S+)/.exec(rawInfo)?.[1];
      const valkeyVersion = /valkey_version:(\S+)/.exec(rawInfo)?.[1];
      const redisVersion = /redis_version:(\S+)/.exec(rawInfo)?.[1];
      serverInfo = {
        server: serverName === 'valkey' ? 'valkey' : 'redis',
        server_version: valkeyVersion ?? redisVersion ?? null,
      };
      log(`[valkey:hot-vector-index] Server: ${serverInfo.server} ${serverInfo.server_version}`);
    } catch {
      // Non-fatal — INFO server may be restricted; classification still proceeds.
    }

    const inspection = await inspectIndex(redis);
    if (inspection.error) {
      emitResult({
        status: 'blocked',
        reason: 'inspection_failed',
        detail: inspection.error,
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        write_attempted: false,
      });
      return;
    }

    if (!inspection.searchModulePresent) {
      log('[valkey:hot-vector-index] RediSearch module NOT loaded — FT.* commands unavailable');
      emitResult({
        status: 'blocked',
        reason: 'search_module_unavailable',
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        search_module_present: false,
        write_attempted: false,
      });
      return;
    }
    log('[valkey:hot-vector-index] RediSearch module loaded');

    if (inspection.indexExists) {
      const diffs = diffAgainstContract(inspection.indexInfo);
      if (diffs) {
        log('[valkey:hot-vector-index] Existing index does NOT match the documented contract:', JSON.stringify(diffs));
        emitResult({
          status: 'schema_drift',
          reason: 'existing_index_does_not_match_contract',
          server: serverInfo.server,
          server_version: serverInfo.server_version,
          index: INDEX_NAME,
          search_module_present: true,
          index_exists_before: true,
          index_exists_after: true,
          schema_diff: diffs,
          write_attempted: false,
        });
        return;
      }
      log(`[valkey:hot-vector-index] "${INDEX_NAME}" already exists and matches the documented contract`);
      emitResult({
        status: 'proven_existing',
        reason: 'index_matches_contract',
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        search_module_present: true,
        index_exists_before: true,
        index_exists_after: true,
        write_attempted: false,
      });
      return;
    }

    // Index absent, module present.
    if (isPreflight && !isApply) {
      log(`[valkey:hot-vector-index] "${INDEX_NAME}" absent — module present, provisioning is supported`);
      emitResult({
        status: 'ready_to_provision',
        reason: 'search_module_present_index_absent',
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        search_module_present: true,
        index_exists_before: false,
        index_exists_after: false,
        write_attempted: false,
      });
      return;
    }

    // --apply, index genuinely absent: create it, then verify by reading it back.
    log(`[valkey:hot-vector-index] Creating "${INDEX_NAME}"...`);
    try {
      await redis.call(
        'FT.CREATE',
        INDEX_NAME,
        'ON',
        'HASH',
        'PREFIX',
        '1',
        KEY_PREFIX,
        'SCHEMA',
        VECTOR_FIELD,
        'VECTOR',
        'FLAT',
        '6',
        'TYPE',
        'FLOAT32',
        'DIM',
        String(DIMENSIONS),
        'DISTANCE_METRIC',
        DISTANCE_METRIC,
        'representation_id',
        'TAG'
      );
    } catch (err) {
      emitResult({
        status: 'error',
        reason: 'ft_create_failed',
        detail: err.message,
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        search_module_present: true,
        index_exists_before: false,
        write_attempted: true,
      });
      return;
    }

    // Verify by reading the created index back — do not trust FT.CREATE's OK alone.
    const postCreate = await inspectIndex(redis);
    if (postCreate.error || !postCreate.indexExists) {
      emitResult({
        status: 'error',
        reason: 'post_create_verification_failed',
        detail: postCreate.error ?? 'index still absent after FT.CREATE returned OK',
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        write_attempted: true,
        index_exists_after: false,
      });
      return;
    }
    const postDiff = diffAgainstContract(postCreate.indexInfo);
    if (postDiff) {
      emitResult({
        status: 'error',
        reason: 'created_index_does_not_match_contract',
        server: serverInfo.server,
        server_version: serverInfo.server_version,
        index: INDEX_NAME,
        write_attempted: true,
        index_exists_after: true,
        schema_diff: postDiff,
      });
      return;
    }

    log(`[valkey:hot-vector-index] "${INDEX_NAME}" created and verified via read-back`);
    emitResult({
      status: 'provisioned',
      reason: 'index_created_and_verified',
      server: serverInfo.server,
      server_version: serverInfo.server_version,
      index: INDEX_NAME,
      search_module_present: true,
      index_exists_before: false,
      index_exists_after: true,
      write_attempted: true,
    });
  } catch (err) {
    emitResult({
      status: 'blocked',
      reason: 'connection_failed',
      detail: err.message,
      server: serverInfo.server,
      index: INDEX_NAME,
      write_attempted: false,
    });
  } finally {
    await redis.quit().catch(() => {});
  }
}

main();
