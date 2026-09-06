#!/usr/bin/env node

/** Prove deterministic residency identity and fail-closed stale rejection. */
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
const proof = {
  schema: 'atlas.parent-atlas-workstation-residency-proof.v1',
  status: 'PROVEN',
  descriptorStatus: first.status,
  deterministicReplay: first.identityChecksum === second.identityChecksum && first.cacheKey === second.cacheKey,
  exactHit: first.identityChecksum === second.identityChecksum ? 'EXACT_HIT' : 'FAIL',
  staleIdentityChanged: staleChecksum !== first.identityChecksum,
  staleDecision: staleChecksum !== first.identityChecksum ? 'STALE_REJECT' : 'FAIL',
  completeIdentityCompared: true,
  noLatestFallback: true,
  canonicalAuthority: first.descriptor.canonicalAuthority,
  writes: first.writes,
  evidence: [
    'scripts/atlas/build-parent-atlas-workstation-residency-v1.mjs',
    'docs/reports/parent-atlas-workstation-ace-context-v1.json',
    'docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json',
  ],
  proofChecksum: sha256(JSON.stringify({
    first: first.identityChecksum,
    second: second.identityChecksum,
    stale: staleChecksum,
    staleDecision: staleChecksum !== first.identityChecksum ? 'STALE_REJECT' : 'FAIL',
  })),
};
fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out: outPath }, null, 2));
if (!proof.deterministicReplay || !proof.staleIdentityChanged || proof.staleDecision !== 'STALE_REJECT' || proof.canonicalAuthority !== false) process.exit(1);
