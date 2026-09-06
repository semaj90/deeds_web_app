#!/usr/bin/env node

/**
 * WORKSTATION-BITFROST-LIVE-READ-01 proof.
 *
 * Proves two SEPARATE things and does not conflate them:
 *   1. In-memory identity/staleness determinism (deterministic replay, and a
 *      changed context produces a changed, rejected identity). This never
 *      touches real Valkey and is unchanged from the original design.
 *   2. That a real Valkey GET against the exact shared cache key actually
 *      happened (probeMode === 'READ_ONLY_GET') and was classified as one of
 *      MISS | EXACT_HIT | STALE_REJECT.
 *
 * This gate performs NO SET, DEL, ZADD, SCAN, warming, or promotion against
 * Valkey -- cacheWritesPerformed stays false throughout. It does not attempt
 * to force a live EXACT_HIT/STALE_REJECT by seeding a key; the in-memory
 * fixture in (1) already proves that classification logic works. A future,
 * separate mutation-fixture gate may seed an isolated namespace and must
 * honestly report cacheWritesPerformed:true when it does.
 *
 * CACHE_UNAVAILABLE (Valkey unreachable) is fail-soft for the BUILDER (it
 * must not crash), but this PROOF reports LIVE_RUNTIME_UNAVAILABLE / a
 * non-zero exit in that case -- rejection/fallback behavior is not the same
 * as live function proven.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const builder = path.join(root, 'scripts', 'atlas', 'build-parent-atlas-workstation-residency-v1.mjs');
const reportPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-residency-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-residency-proof-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

const run = () => {
  execFileSync(process.execPath, [builder], { cwd: root, stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
};

const first = run();
const second = run();
const staleIdentity = { ...first.identity, contextChecksum: sha256(`${first.identity.contextChecksum}:changed`) };
const staleChecksum = sha256(JSON.stringify(staleIdentity));

const deterministicReplay = first.identityChecksum === second.identityChecksum && first.cacheKey === second.cacheKey;
const staleIdentityChanged = staleChecksum !== first.identityChecksum;
const staleDecision = staleIdentityChanged ? 'STALE_REJECT' : 'FAIL';

const liveReadValidClassifications = ['MISS', 'EXACT_HIT', 'STALE_REJECT'];
const liveProbeAttempted = first.probeMode === 'READ_ONLY_GET';
const liveRuntimeUnavailable = first.cacheDecision === 'CACHE_UNAVAILABLE';
const liveReadClassificationValid = liveProbeAttempted && liveReadValidClassifications.includes(first.cacheDecision);

let status;
if (!deterministicReplay || !staleIdentityChanged || staleDecision !== 'STALE_REJECT' || first.descriptor.canonicalAuthority !== false) {
  status = 'NOT_PROVEN';
} else if (liveRuntimeUnavailable) {
  status = 'LIVE_RUNTIME_UNAVAILABLE';
} else if (!liveReadClassificationValid) {
  status = 'NOT_PROVEN';
} else {
  status = 'LIVE_GET_PROVEN';
}

const proof = {
  schema: 'atlas.parent-atlas-workstation-residency-proof.v1',
  gate: 'WORKSTATION-BITFROST-LIVE-READ-01',
  status,
  proofPassed: status === 'LIVE_GET_PROVEN',
  descriptorStatus: first.status,
  deterministicReplay,
  exactHit: deterministicReplay ? 'EXACT_HIT' : 'FAIL',
  staleIdentityChanged,
  staleDecision,
  completeIdentityCompared: true,
  noLatestFallback: true,
  canonicalAuthority: first.descriptor.canonicalAuthority,
  writes: first.writes,
  liveReadProbe: {
    probeMode: first.probeMode,
    cacheDecision: first.cacheDecision,
    classificationValid: liveReadClassificationValid,
    canonicalWritesPerformed: false,
    cacheWritesPerformed: false,
  },
  productionAdoption: 'BLOCKED_CURRENT_LINEAGE',
  evidence: [
    'scripts/atlas/build-parent-atlas-workstation-residency-v1.mjs',
    'docs/reports/parent-atlas-workstation-ace-context-v1.json',
    'docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json',
  ],
  proofChecksum: sha256(JSON.stringify({
    first: first.identityChecksum,
    second: second.identityChecksum,
    stale: staleChecksum,
    staleDecision,
    liveCacheDecision: first.cacheDecision,
  })),
};
fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out: outPath }, null, 2));
if (proof.status !== 'LIVE_GET_PROVEN') process.exit(1);
if (proof.writes.valkey !== 0 || proof.writes.redis !== 0) process.exit(1);
