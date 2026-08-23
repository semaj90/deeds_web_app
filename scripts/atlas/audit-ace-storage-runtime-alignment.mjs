#!/usr/bin/env node
/**
 * Read-only ACE storage/runtime alignment audit.
 *
 * Purpose:
 * - distinguish an under-migrated live database from missing schema design
 * - enforce the canonical migration owners for ACE routing columns
 * - verify Drizzle mirrors those physical contracts
 * - verify Redis compatibility calls are backed by the shared Valkey client
 * - verify centroid cache payloads have a versioned representation contract
 *
 * This script never runs DDL/DML and never writes Postgres, Qdrant, Neo4j or Valkey.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');

const rel = (...parts) => path.join(...parts);
const read = (base, file) => fs.readFileSync(path.join(base, file), 'utf8');
const exists = (base, file) => fs.existsSync(path.join(base, file));
const containsAll = (text, needles) => needles.every((needle) => text.includes(needle));

const storageTierMigrationPath = rel('drizzle', 'manual', '20260516_storage_tier_routing.sql');
const routePacketMigrationPath = rel('drizzle', 'manual', '20260606_route_packet_tables.sql');
const analyticsSchemaPath = rel('src', 'lib', 'server', 'db', 'schema', 'search-analytics.ts');
const routePacketSchemaPath = rel('src', 'lib', 'server', 'db', 'schema', 'route_runtime_packets.ts');
const redisCompatPath = rel('src', 'lib', 'server', 'redis.ts');
const valkeyOwnerPath = rel('src', 'lib', 'server', 'cache', 'valkey-client.ts');
const centroidCachePath = rel('src', 'lib', 'server', 'retrieval', 'centroid-cache.ts');
const centroidContractPath = rel('src', 'lib', 'server', 'retrieval', 'centroid-cache-contract-v1.ts');

const storageTierMigration = exists(FRONTEND, storageTierMigrationPath)
  ? read(FRONTEND, storageTierMigrationPath)
  : '';
const routePacketMigration = exists(FRONTEND, routePacketMigrationPath)
  ? read(FRONTEND, routePacketMigrationPath)
  : '';
const analyticsSchema = exists(FRONTEND, analyticsSchemaPath)
  ? read(FRONTEND, analyticsSchemaPath)
  : '';
const routePacketSchema = exists(FRONTEND, routePacketSchemaPath)
  ? read(FRONTEND, routePacketSchemaPath)
  : '';
const redisCompat = exists(FRONTEND, redisCompatPath) ? read(FRONTEND, redisCompatPath) : '';
const valkeyOwner = exists(FRONTEND, valkeyOwnerPath) ? read(FRONTEND, valkeyOwnerPath) : '';
const centroidCache = exists(FRONTEND, centroidCachePath) ? read(FRONTEND, centroidCachePath) : '';
const centroidContract = exists(FRONTEND, centroidContractPath) ? read(FRONTEND, centroidContractPath) : '';

const checks = {
  canonicalStorageTierMigrationPresent: storageTierMigration.length > 0,
  storageTierOwnsReconstructionError: storageTierMigration.includes('reconstruction_error real'),
  storageTierOwnsCompressedEmbedding64: storageTierMigration.includes('compressed_embedding vector(64)'),
  storageTierOwnsUuidCentroidId:
    /centroid_id\s+uuid\s+REFERENCES\s+centroid_registry\(id\)/i.test(storageTierMigration),
  storageTierOwnsRoutingTier: /routing_tier\s+varchar\(10\)/i.test(storageTierMigration),

  canonicalRoutePacketMigrationPresent: routePacketMigration.length > 0,
  routePacketMigrationOwnsRuntimeColumns: containsAll(routePacketMigration, [
    'ADD COLUMN IF NOT EXISTS raw jsonb',
    'ADD COLUMN IF NOT EXISTS packet_version integer',
    'ADD COLUMN IF NOT EXISTS source_ref_quality numeric',
  ]),
  routePacketDrizzleMirrorsRuntimeColumns: containsAll(routePacketSchema, [
    "raw: jsonb('raw')",
    "packetVersion: integer('packet_version')",
    "sourceRefQuality: numeric('source_ref_quality')",
  ]),

  analyticsDrizzleHasReconstructionError: analyticsSchema.includes("reconstructionError: real('reconstruction_error')"),
  analyticsDrizzleHasCompressedEmbedding64:
    /compressedEmbedding:\s*vector\('compressed_embedding',\s*\{\s*dimensions:\s*64\s*\}\)/m.test(analyticsSchema),
  analyticsDrizzleHasRoutingTier: analyticsSchema.includes("routingTier: varchar('routing_tier'"),
  analyticsDrizzleUsesUuidCentroidId: analyticsSchema.includes("centroidId: uuid('centroid_id')"),
  analyticsDrizzleStillUsesIntegerCentroidId: analyticsSchema.includes("centroidId: integer('centroid_id')"),

  redisCompatibilityUsesValkeyOwner: containsAll(redisCompat, [
    "getValkeyClient",
    "from './cache/valkey-client.js'",
  ]),
  valkeyClientIsDeclaredSingleOwner: containsAll(valkeyOwner, [
    'single source of truth',
    'getValkeyClient()',
  ]),

  centroidCacheContractPresent: centroidContract.includes("atlas.centroid-cache-envelope.v1"),
  centroidCacheContractPinsSemantic768: containsAll(centroidContract, [
    "CENTROID_CACHE_REPRESENTATION = 'semantic_768'",
    'CENTROID_CACHE_DIMENSION = 768',
    "CENTROID_CACHE_SOURCE_COLLECTION = 'codebase_chunks_768'",
  ]),
  centroidCacheReadsVersionedContract:
    centroidCache.includes('normalizeCentroidCachePayloadV1'),
  centroidCacheWritesVersionedContract:
    centroidCache.includes('serializeCentroidCacheEnvelopeV1'),
};

const blockingGaps = [];
if (!checks.canonicalStorageTierMigrationPresent) blockingGaps.push('CANONICAL_STORAGE_TIER_MIGRATION_MISSING');
if (!checks.storageTierOwnsUuidCentroidId) blockingGaps.push('CENTROID_ID_MIGRATION_AUTHORITY_NOT_UUID');
if (!checks.routePacketMigrationOwnsRuntimeColumns) blockingGaps.push('ROUTE_PACKET_MIGRATION_RUNTIME_COLUMNS_INCOMPLETE');
if (!checks.routePacketDrizzleMirrorsRuntimeColumns) blockingGaps.push('ROUTE_PACKET_DRIZZLE_MIRROR_INCOMPLETE');
if (!checks.analyticsDrizzleHasReconstructionError) blockingGaps.push('CODEBASE_INDEX_RECONSTRUCTION_ERROR_MIRROR_MISSING');
if (!checks.analyticsDrizzleUsesUuidCentroidId) blockingGaps.push('CODEBASE_INDEX_CENTROID_ID_DRIZZLE_TYPE_MISMATCH');
if (!checks.analyticsDrizzleHasCompressedEmbedding64) blockingGaps.push('CODEBASE_INDEX_COMPRESSED_EMBEDDING_MIRROR_MISSING');
if (!checks.analyticsDrizzleHasRoutingTier) blockingGaps.push('CODEBASE_INDEX_ROUTING_TIER_MIRROR_MISSING');
if (!checks.redisCompatibilityUsesValkeyOwner || !checks.valkeyClientIsDeclaredSingleOwner) {
  blockingGaps.push('VALKEY_SINGLE_OWNER_NOT_PROVEN');
}
if (!checks.centroidCacheContractPresent || !checks.centroidCacheContractPinsSemantic768) {
  blockingGaps.push('CENTROID_CACHE_REPRESENTATION_CONTRACT_MISSING');
}

const wiringGaps = [];
if (!checks.centroidCacheReadsVersionedContract) wiringGaps.push('CENTROID_CACHE_VERSIONED_READ_THROUGH_NOT_WIRED');
if (!checks.centroidCacheWritesVersionedContract) wiringGaps.push('CENTROID_CACHE_VERSIONED_WRITE_NOT_WIRED');

const report = {
  schema: 'atlas.ace-storage-runtime-alignment-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STATIC',
  checks,
  blockingGaps,
  wiringGaps,
  interpretation: {
    canonicalMigrationAuthority: [
      `sveltekit-frontend/${storageTierMigrationPath.replaceAll('\\', '/')}`,
      `sveltekit-frontend/${routePacketMigrationPath.replaceAll('\\', '/')}`,
    ],
    underMigratedLiveDatabaseIsNotMissingSchemaDesign: true,
    duplicateRepairMigrationsShouldNotBeAdded: true,
    postgresOwnsDurableCentroids: true,
    valkeyOwnsHotCentroidCache: true,
    qdrantIsRebuildableSemanticProjection: true,
    centroidClusterIndexIsNotCanonicalIdentity: true,
    semantic768CentroidCacheIsNotSemantic512IdentityAuthority: true,
  },
  status: blockingGaps.length === 0 && wiringGaps.length === 0
    ? 'ALIGNED_STATIC'
    : 'ALIGNMENT_GAPS',
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = blockingGaps.length > 0 ? 2 : 0;
