#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const exists = (path) => existsSync(resolve(root, path));

const paths = {
  storageMigration: 'sveltekit-frontend/drizzle/manual/20260516_storage_tier_routing.sql',
  routeMigration: 'sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql',
  duplicateStorageRepair: 'sveltekit-frontend/drizzle/manual/codebase_chunk_index_routing_tier_columns.sql',
  duplicateRouteRepair: 'sveltekit-frontend/drizzle/manual/route_runtime_packets_raw_column.sql',
  searchSchema: 'sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts',
  routeSchema: 'sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts',
  redisCompat: 'sveltekit-frontend/src/lib/server/redis.ts',
  valkeyOwner: 'sveltekit-frontend/src/lib/server/cache/valkey-client.ts',
  centroidContract: 'sveltekit-frontend/src/lib/server/retrieval/centroid-cache-contract-v1.ts',
  centroidCache: 'sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts',
};

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

for (const [name, path] of Object.entries(paths)) {
  if (name.startsWith('duplicate')) continue;
  check(`FILE_${name.toUpperCase()}`, exists(path), path);
}

const storage = read(paths.storageMigration);
check('STORAGE_RECONSTRUCTION_ERROR_OWNER', /ADD COLUMN IF NOT EXISTS reconstruction_error\s+real/i.test(storage), paths.storageMigration);
check('STORAGE_COMPRESSED_EMBEDDING_64_OWNER', /ADD COLUMN IF NOT EXISTS compressed_embedding\s+vector\(64\)/i.test(storage), paths.storageMigration);
check('STORAGE_CENTROID_UUID_FK_OWNER', /ADD COLUMN IF NOT EXISTS centroid_id\s+uuid\s+REFERENCES\s+centroid_registry\(id\)/i.test(storage), paths.storageMigration);
check('STORAGE_ROUTING_TIER_OWNER', /ADD COLUMN IF NOT EXISTS routing_tier\s+varchar\(10\)/i.test(storage), paths.storageMigration);

const routeMigration = read(paths.routeMigration);
check('ROUTE_RAW_OWNER', /ADD COLUMN IF NOT EXISTS raw\s+jsonb/i.test(routeMigration), paths.routeMigration);
check('ROUTE_PACKET_VERSION_OWNER', /ADD COLUMN IF NOT EXISTS packet_version\s+integer/i.test(routeMigration), paths.routeMigration);
check('ROUTE_SOURCE_REF_QUALITY_OWNER', /ADD COLUMN IF NOT EXISTS source_ref_quality\s+numeric/i.test(routeMigration), paths.routeMigration);

check('DUPLICATE_STORAGE_REPAIR_ABSENT', !exists(paths.duplicateStorageRepair), paths.duplicateStorageRepair);
check('DUPLICATE_ROUTE_REPAIR_ABSENT', !exists(paths.duplicateRouteRepair), paths.duplicateRouteRepair);

const searchSchema = read(paths.searchSchema);
check('CODEBASE_INDEX_RECONSTRUCTION_ERROR_MIRROR', /reconstructionError:\s*real\('reconstruction_error'\)/.test(searchSchema), paths.searchSchema);
check('CODEBASE_INDEX_CENTROID_ID_UUID', /centroidId:\s*uuid\('centroid_id'\)/.test(searchSchema), paths.searchSchema);
check('CODEBASE_INDEX_CENTROID_ID_NOT_INTEGER', !/centroidId:\s*integer\('centroid_id'\)/.test(searchSchema), paths.searchSchema);
check('CODEBASE_INDEX_COMPRESSED_EMBEDDING_64', /compressedEmbedding:\s*vector\('compressed_embedding',\s*\{\s*dimensions:\s*64\s*\}\)/.test(searchSchema), paths.searchSchema);
check('CODEBASE_INDEX_ROUTING_TIER', /routingTier:\s*varchar\('routing_tier',\s*\{\s*length:\s*10\s*\}\)\.default\('cold'\)/.test(searchSchema), paths.searchSchema);

const routeSchema = read(paths.routeSchema);
check('ROUTE_SCHEMA_RAW_MIRROR', /raw:\s*jsonb\('raw'\)/.test(routeSchema), paths.routeSchema);
check('ROUTE_SCHEMA_PACKET_VERSION_MIRROR', /packetVersion:\s*integer\('packet_version'\)/.test(routeSchema), paths.routeSchema);
check('ROUTE_SCHEMA_SOURCE_REF_QUALITY_MIRROR', /sourceRefQuality:\s*(?:numeric|real)\('source_ref_quality'/.test(routeSchema), paths.routeSchema);

const redisCompat = read(paths.redisCompat);
const valkeyOwner = read(paths.valkeyOwner);
check('REDIS_COMPAT_DELEGATES_TO_VALKEY', /getValkeyClient/.test(redisCompat), paths.redisCompat);
check('VALKEY_SINGLE_CONNECTION_OWNER', /getValkeyClient/.test(valkeyOwner) && /ioredis/i.test(valkeyOwner), paths.valkeyOwner);

const contract = read(paths.centroidContract);
check('CENTROID_CACHE_SCHEMA_V1', /atlas\.centroid-cache-envelope\.v1/.test(contract), paths.centroidContract);
check('CENTROID_CACHE_SEMANTIC_768', /semantic_768/.test(contract), paths.centroidContract);
check('CENTROID_CACHE_DIMENSION_768', /CENTROID_CACHE_DIMENSION_V1\s*=\s*768/.test(contract), paths.centroidContract);
check('CENTROID_CACHE_SOURCE_COLLECTION', /codebase_chunks_768/.test(contract), paths.centroidContract);
check('CENTROID_CACHE_LINEAGE_FIELDS', /representationRevision/.test(contract) && /producerRevision/.test(contract) && /lineageQualified/.test(contract), paths.centroidContract);

const centroidCache = read(paths.centroidCache);
check('CENTROID_CACHE_VERSIONED_READ_THROUGH_WIRED', /normalizeCentroidCacheRecordV1/.test(centroidCache), paths.centroidCache);
check('CENTROID_CACHE_VERSIONED_WRITE_WIRED', /serializeCentroidCacheEnvelopeV1/.test(centroidCache), paths.centroidCache);
check('CENTROID_CACHE_NEW_WRITES_NOT_BARE_ARRAY', !/setJsonWithTtl\(centroidKey\.cluster\(clusterId\),\s*Array\.from\(vec\)/.test(centroidCache), paths.centroidCache);

const failed = checks.filter((entry) => !entry.ok);
const report = {
  schema: 'atlas.ace-storage-runtime-alignment-audit.v1',
  checkedAt: new Date().toISOString(),
  readOnly: true,
  pass: failed.length === 0,
  counts: {
    checks: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
  },
  failed,
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.pass ? 0 : 1;
