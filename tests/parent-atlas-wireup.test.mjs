import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDownstreamWireupReport,
  buildPackageSmokeReport,
} from '../scripts/atlas/parent-atlas-wireup.mjs';

const fakePackage = {
  extractPacketIdentityFromRow: () => ({}),
  validatePacketIdentityFromRow: () => [],
  verifyPacketIdentityConsistency: () => ({ consistent: true, mismatches: [] }),
  createEnvelopeFromRow: () => ({}),
  buildSummaryContext: () => ({}),
  makeGemma4SummaryPacket: () => ({}),
  makeChrom97Packet: () => ({}),
  toNdjsonLine: () => '',
  PacketValidator: class {},
  loadRepoEnv: () => ({}),
  resolveRedisConfig: () => ({}),
  resolveDatabaseUrl: () => ({}),
  createQdrantAdapter: () => ({}),
  createNeo4jAdapter: () => ({}),
  createPostgresAdapter: () => ({}),
};

const fakeServiceContract = {
  canonicalServiceProbeDefaults: {
    postgres: { url: 'postgresql://127.0.0.1:5434/legal_ai_db', port: 5434, transport: 'postgres' },
    qdrant: { url: 'http://127.0.0.1:6333', port: 6333, transport: 'http' },
    neo4j: { url: 'http://127.0.0.1:7474', port: 7474, transport: 'http' },
    'redis-valkey': { url: 'redis://127.0.0.1:6379', port: 6379, transport: 'redis' },
  },
};

test('package smoke report marks the package as importable when exports are present', () => {
  const report = buildPackageSmokeReport(fakePackage, {
    packageRoot: 'C:/repo/packages/parent-atlas',
    distEntry: 'C:/repo/packages/parent-atlas/dist/index.js',
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.missingExports.length, 0);
  assert.equal(report.requiredExports.length >= 1, true);
});

test('downstream wire-up report resolves canonical WSL2 containers', () => {
  const packageSmoke = buildPackageSmokeReport(fakePackage);
  const report = buildDownstreamWireupReport({
    packageSmoke,
    serviceContract: fakeServiceContract,
  });

  assert.equal(report.status, 'READY_FOR_DOWNSTREAM_IMPORT');
  assert.deepEqual(report.runtime.containerStack, ['postgres', 'qdrant']);
  assert.equal(report.services.postgres.port, 5434);
  assert.equal(report.services.qdrant.port, 6333);
});

