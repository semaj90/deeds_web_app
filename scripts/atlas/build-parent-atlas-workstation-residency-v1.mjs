#!/usr/bin/env node

/**
 * Build a BitFrost/Valkey residency descriptor and perform a real read-only
 * GET probe against the computed cache key.
 *
 * This is deliberately not a cache writer.  PostgreSQL remains authoritative;
 * this descriptor only proves the identity that a future residency adapter
 * would have to verify before accepting a hit. The probe never SETs a key --
 * it fails soft to CACHE_UNAVAILABLE if Valkey is unreachable.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contextPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ace-context-v1.json');
const synthesisPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-dry-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-residency-v1.json');

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const synthesis = JSON.parse(fs.readFileSync(synthesisPath, 'utf8'));

const identity = {
  schema: 'atlas.parent-atlas-workstation-residency-identity.v1',
  workboardChecksum: context.workboardChecksum,
  taskPopulationChecksum: context.taskPopulationChecksum,
  planChecksum: context.planChecksum,
  contextChecksum: context.contextChecksum,
  evidenceRefsChecksum: sha256(JSON.stringify(context.selectedEvidenceRefs ?? [])),
  evidenceRevisionSet: context.selectedEvidenceRefs ?? [],
  modelRevision: synthesis.loadedModel ?? null,
  promptRevision: synthesis.promptRevision ?? null,
  producerRevision: 'parent-atlas-workstation-residency:v1',
};

const identityChecksum = sha256(JSON.stringify(identity));
const cacheKey = `bitfrost:workstation:context:v1:${identityChecksum.slice('sha256:'.length)}`;

/**
 * Read-only Valkey probe. Never SETs the real cacheKey -- this descriptor is
 * still not a cache writer. GET-only, fail-soft on connection failure so a
 * down/absent Valkey never crashes this script or blocks the plan-only path.
 */
async function probeCache(key) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 1500,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
    const stored = await redis.get(key);
    if (stored === null) return { probeMode: 'READ_ONLY_GET', cacheDecision: 'MISS' };
    let storedIdentityChecksum = null;
    try {
      storedIdentityChecksum = JSON.parse(stored)?.identityChecksum ?? null;
    } catch {
      storedIdentityChecksum = null;
    }
    const cacheDecision = storedIdentityChecksum === identityChecksum ? 'EXACT_HIT' : 'STALE_REJECT';
    return { probeMode: 'READ_ONLY_GET', cacheDecision, storedIdentityChecksum };
  } catch (cause) {
    return {
      probeMode: 'READ_ONLY_GET',
      cacheDecision: 'CACHE_UNAVAILABLE',
      probeError: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

const probe = await probeCache(cacheKey);

const report = {
  schema: 'atlas.parent-atlas-workstation-residency.v1',
  gate: 'WORKSTATION-BITFROST-LIVE-READ-01',
  status: 'REFERENCE_ONLY',
  authority: 'BITFROST_VALKEY_RESIDENCY_ONLY',
  cacheKey,
  identity,
  identityChecksum,
  descriptor: {
    contextManifestRef: contextPath.replace(`${root}${path.sep}`, '').replaceAll(path.sep, '/'),
    synthesisReceiptRef: synthesisPath.replace(`${root}${path.sep}`, '').replaceAll(path.sep, '/'),
    selectedEvidenceRefs: context.selectedEvidenceRefs ?? [],
    residencyClass: 'WORKSTATION_CONTEXT_REFERENCE',
    canonicalAuthority: false,
  },
  probeMode: probe.probeMode,
  cacheDecision: probe.cacheDecision,
  storedIdentityChecksum: probe.storedIdentityChecksum ?? null,
  probeError: probe.probeError ?? null,
  canonicalWritesPerformed: false,
  cacheWritesPerformed: false,
  productionAdoption: 'BLOCKED_CURRENT_LINEAGE',
  writes: {
    valkey: 0,
    redis: 0,
    postgres: 0,
    qdrant: 0,
    neo4j: 0,
    sourceFiles: 0,
    modelCalls: 0,
  },
  notes: [
    'This script performs a real read-only GET against the computed cacheKey; it never SETs it.',
    'A future reader must compare the complete identity object, not TTL or key suffix alone.',
    'Any identity mismatch is a stale rejection (STALE_REJECT) and must not fall back to a latest key.',
    'CACHE_UNAVAILABLE means Valkey could not be reached -- fail-soft, not a hit.',
  ],
};

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  cacheKey: report.cacheKey,
  identityChecksum: report.identityChecksum,
  probeMode: report.probeMode,
  cacheDecision: report.cacheDecision,
  writes: report.writes,
  out: outPath,
}, null, 2));
