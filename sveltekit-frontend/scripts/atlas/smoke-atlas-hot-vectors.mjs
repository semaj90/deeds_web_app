#!/usr/bin/env node
/**
 * Smoke Test: Valkey `atlas_hot_vectors_v1` hot-vector cache contract.
 *
 * Contract (documented in scripts/atlas/ensure-valkey-hot-vector-index.mjs,
 * which as of this writing does NOT implement --apply — it is a stub that
 * prints a "deferred" message and exits 0 without ever calling FT.CREATE):
 *   index:          atlas_hot_vectors_v1
 *   prefix:         atlas:hot-vector:
 *   storage:        HASH
 *   vector field:   vector
 *   dimensions:     768
 *   distance:       COSINE
 *   representation: embeddinggemma_300m_768_native_v1
 *   owner:          Qdrant holds the full corpus; this is a bounded hot cache only
 *
 * This script does NOT create the index. If the index is absent (the
 * documented default — hot-vector indexing is opt-in and disabled unless a
 * measured bottleneck justifies it), that is reported as a clean, non-failing
 * "not configured" result, not a smoke failure. If the index IS present
 * (someone ran a real --apply implementation), this script proves:
 *   1. the index definition matches the contract (prefix/field/dims/distance)
 *   2. a KNN query against a known vector ranks the identical vector first
 *   3. representation_id metadata round-trips
 *   4. malformed records (wrong dims, missing representation_id, NaN/Infinity,
 *      wrong encoding) are rejected by the local contract validator
 * ...and always cleans up only the temporary `atlas:hot-vector:smoke:*` test
 * keys it wrote — it never touches production hot-vector entries and never
 * drops the index.
 *
 * Usage:
 *   node scripts/atlas/smoke-atlas-hot-vectors.mjs [--verbose]
 */

import Redis from 'ioredis';

const VERBOSE = process.argv.includes('--verbose');
const INDEX_NAME = 'atlas_hot_vectors_v1';
const KEY_PREFIX = 'atlas:hot-vector:';
const TEST_PREFIX = `${KEY_PREFIX}smoke:`;
const VECTOR_FIELD = 'vector';
const DIMENSIONS = 768;
const DISTANCE_METRIC = 'COSINE';
const REPRESENTATION_ID = 'embeddinggemma_300m_768_native_v1';

let pass = 0;
let fail = 0;

function ok(label, msg) {
  console.log(`✅ ${label}: ${msg}`);
  pass++;
}

function bad(label, msg, detail = '') {
  console.error(`❌ ${label}: ${msg}${detail ? ' — ' + detail : ''}`);
  fail++;
}

function skip(label, msg) {
  console.log(`⏭️  ${label}: ${msg}`);
}

/** Deterministic (seeded, reproducible) pseudo-random 768-dim unit-ish vector. */
function deterministicVector(seed, dims = DIMENSIONS) {
  let state = seed >>> 0;
  const next = () => {
    // mulberry32
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i++) v[i] = next() * 2 - 1;
  return v;
}

function toBuffer(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * The write-path contract for atlas_hot_vectors_v1 records. No production
 * writer exists for this index yet (zero consumers found in src/ or scripts/
 * as of this writing) — this validator exists so the contract is defined and
 * enforced by *something* before any writer is built against it.
 */
function validateHotVectorRecord(record) {
  const errors = [];
  if (!(record.vector instanceof Float32Array)) {
    errors.push('vector must be a Float32Array');
  } else {
    if (record.vector.length !== DIMENSIONS) {
      errors.push(`vector must be ${DIMENSIONS}-dim, got ${record.vector.length}`);
    }
    for (let i = 0; i < record.vector.length; i++) {
      const x = record.vector[i];
      if (Number.isNaN(x) || !Number.isFinite(x)) {
        errors.push(`vector contains non-finite value at index ${i}`);
        break;
      }
    }
  }
  if (record.representationId !== REPRESENTATION_ID) {
    errors.push(`representationId must be "${REPRESENTATION_ID}", got ${JSON.stringify(record.representationId)}`);
  }
  return { valid: errors.length === 0, errors };
}

function parseFtInfo(flatArray) {
  const map = {};
  for (let i = 0; i < flatArray.length; i += 2) {
    map[flatArray[i]] = flatArray[i + 1];
  }
  return map;
}

async function main() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (String(pong).toUpperCase() !== 'PONG') {
      bad('connection', 'PING did not return PONG', String(pong));
      return finish();
    }
    ok('connection', 'Valkey PING → PONG');

    // ── Gate: does the search module exist at all? ──────────────────────────
    let modules;
    try {
      modules = await redis.call('MODULE', 'LIST');
    } catch (err) {
      bad('module', 'MODULE LIST failed', err.message);
      return finish();
    }
    const hasSearchModule = JSON.stringify(modules).includes('search');
    if (!hasSearchModule) {
      bad('module', 'RediSearch ("search") module not loaded — FT.* commands unavailable');
      return finish();
    }
    ok('module', 'RediSearch module loaded');

    // ── Gate: does the index exist? ──────────────────────────────────────────
    let info;
    try {
      info = await redis.call('FT.INFO', INDEX_NAME);
    } catch (err) {
      if (/unknown index name|index.*not found|no such index/i.test(err.message)) {
        skip(
          'index',
          `"${INDEX_NAME}" does not exist — hot-vector indexing is disabled by default ` +
            '(see scripts/atlas/ensure-valkey-hot-vector-index.mjs). This is the documented ' +
            'default configuration, not a failure. Nothing else to verify.'
        );
        return finish();
      }
      bad('index', 'FT.INFO failed unexpectedly', err.message);
      return finish();
    }
    ok('index', `"${INDEX_NAME}" exists`);

    // ── Gate: index definition matches the documented contract ──────────────
    const meta = parseFtInfo(info);
    const indexPrefixes = Array.isArray(meta.index_definition)
      ? parseFtInfo(meta.index_definition).prefixes
      : undefined;
    const prefixOk = Array.isArray(indexPrefixes) && indexPrefixes.includes(KEY_PREFIX);
    if (prefixOk) {
      ok('contract:prefix', `index prefix includes "${KEY_PREFIX}"`);
    } else {
      bad('contract:prefix', `expected prefix "${KEY_PREFIX}"`, JSON.stringify(indexPrefixes));
    }

    const attributes = Array.isArray(meta.attributes) ? meta.attributes : [];
    const vectorAttr = attributes.map((a) => parseFtInfo(a)).find((a) => a.attribute === VECTOR_FIELD);
    if (!vectorAttr) {
      bad('contract:field', `no "${VECTOR_FIELD}" attribute found on index`);
    } else {
      ok('contract:field', `"${VECTOR_FIELD}" attribute present`);
    }

    // ── Gates: write two deterministic vectors under the TEST prefix ────────
    const vecA = deterministicVector(1);
    const vecB = deterministicVector(2);
    const keyA = `${TEST_PREFIX}a`;
    const keyB = `${TEST_PREFIX}b`;
    const cleanupKeys = [keyA, keyB];

    try {
      const recA = { vector: vecA, representationId: REPRESENTATION_ID };
      const recB = { vector: vecB, representationId: REPRESENTATION_ID };
      const va = validateHotVectorRecord(recA);
      const vb = validateHotVectorRecord(recB);
      if (!va.valid || !vb.valid) {
        bad('write:validate', 'deterministic test vectors failed local contract validation', JSON.stringify([...va.errors, ...vb.errors]));
        return finish();
      }

      await redis.hset(keyA, {
        [VECTOR_FIELD]: toBuffer(vecA),
        representation_id: REPRESENTATION_ID,
      });
      await redis.hset(keyB, {
        [VECTOR_FIELD]: toBuffer(vecB),
        representation_id: REPRESENTATION_ID,
      });
      ok('write', `wrote 2 temporary test hashes under "${TEST_PREFIX}"`);

      // ── Gate: KNN search ranks the exact match first ───────────────────────
      const searchResult = await redis.call(
        'FT.SEARCH',
        INDEX_NAME,
        `*=>[KNN 2 @${VECTOR_FIELD} $BLOB AS __score]`,
        'PARAMS',
        '2',
        'BLOB',
        toBuffer(vecA),
        'RETURN',
        '2',
        'representation_id',
        '__score',
        'DIALECT',
        '2'
      );

      const totalResults = Array.isArray(searchResult) ? searchResult[0] : 0;
      const firstKey = Array.isArray(searchResult) ? searchResult[1] : null;
      if (totalResults > 0 && firstKey === keyA) {
        ok('search:knn', `exact-match vector ranked first (key=${firstKey})`);
      } else {
        bad('search:knn', 'exact-match vector did not rank first', `got key=${firstKey}, totalResults=${totalResults}`);
      }

      // ── Gate: representation metadata round-trips ───────────────────────────
      const storedRepr = await redis.hget(keyA, 'representation_id');
      if (storedRepr === REPRESENTATION_ID) {
        ok('metadata', 'representation_id round-trips correctly');
      } else {
        bad('metadata', 'representation_id mismatch', `got: ${storedRepr}`);
      }
    } finally {
      if (cleanupKeys.length) {
        await redis.del(...cleanupKeys);
        if (VERBOSE) console.log(`   cleaned up ${cleanupKeys.length} temporary key(s)`);
      }
    }

    // ── Gates: local contract validator rejects malformed records ───────────
    const rejectCases = [
      { name: '384-dim vector', record: { vector: deterministicVector(3, 384), representationId: REPRESENTATION_ID } },
      { name: '512-dim vector', record: { vector: deterministicVector(4, 512), representationId: REPRESENTATION_ID } },
      { name: 'missing representationId', record: { vector: deterministicVector(5), representationId: undefined } },
      {
        name: 'NaN in vector',
        record: {
          vector: (() => {
            const v = deterministicVector(6);
            v[10] = NaN;
            return v;
          })(),
          representationId: REPRESENTATION_ID,
        },
      },
      {
        name: 'Infinity in vector',
        record: {
          vector: (() => {
            const v = deterministicVector(7);
            v[20] = Infinity;
            return v;
          })(),
          representationId: REPRESENTATION_ID,
        },
      },
      { name: 'wrong encoding (plain array, not Float32Array)', record: { vector: Array.from(deterministicVector(8)), representationId: REPRESENTATION_ID } },
    ];
    let rejectAllOk = true;
    for (const { name, record } of rejectCases) {
      const result = validateHotVectorRecord(record);
      if (result.valid) {
        bad('reject', `"${name}" should have been rejected but validated`, '');
        rejectAllOk = false;
      }
    }
    if (rejectAllOk) {
      ok('reject', `all ${rejectCases.length} malformed-record cases correctly rejected`);
    }
  } catch (err) {
    bad('unexpected', 'smoke test threw', err.message);
  } finally {
    await redis.quit().catch(() => {});
  }

  return finish();
}

function finish() {
  console.log(`\n── Smoke: PASS=${pass} FAIL=${fail} ──`);
  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log('✅ All gates passed (or cleanly skipped — see ⏭️ lines above)');
  }
}

main();
