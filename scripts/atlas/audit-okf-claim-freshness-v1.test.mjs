import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditOkfClaims } from './audit-okf-claim-freshness-v1.mjs';

test('OKF claim freshness audit is deterministic and rejects stale revisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-okf-'));
  fs.writeFileSync(path.join(root, 'claim.md'), `---\nclaimId: claim-1\nclaimRevision: claim-v1\nsourceRef: src/example.ts\nsourceRevision: src-v2\nworkspaceRevision: ws-v1\nevidence_refs:\n  - docs/evidence.json\nevidenceChecksum: sha256:evidence\nproducerRevision: producer-v1\n---\n# Claim\n`);
  const first = auditOkfClaims({ root, sourceRevision: 'src-v1', workspaceRevision: 'ws-v1' });
  const second = auditOkfClaims({ root, sourceRevision: 'src-v1', workspaceRevision: 'ws-v1' });
  assert.equal(first.summary.staleClaims, 1);
  assert.equal(first.claims[0].status, 'STALE_REVISION');
  assert.equal(first.indexChecksum, second.indexChecksum);
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.writesPerformed, false);
});

test('OKF claim freshness audit accepts a complete derived claim', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-okf-'));
  fs.writeFileSync(path.join(root, 'claim.md'), `---\nclaimId: claim-2\nclaimRevision: claim-v1\nsourceRef: src/example.ts\nsourceRevision: src-v1\nworkspaceRevision: ws-v1\nevidence_refs: [docs/evidence.json]\nevidenceChecksum: sha256:evidence\nproducerRevision: producer-v1\n---\n# Claim\n`);
  const report = auditOkfClaims({ root, sourceRevision: 'src-v1', workspaceRevision: 'ws-v1' });
  assert.equal(report.summary.validClaims, 1);
  assert.equal(report.claims[0].status, 'VALID_DERIVED_CLAIM');
});

test('OKF audit excludes documentation without claim metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-okf-'));
  fs.writeFileSync(path.join(root, 'README.md'), '# Documentation only\n');
  fs.writeFileSync(path.join(root, 'claim.md'), `---\nclaimId: claim-3\nclaimRevision: claim-v1\nsourceRef: src/example.ts\nsourceRevision: src-v1\nworkspaceRevision: ws-v1\nevidence_refs:\n  - docs/evidence.json\nevidenceChecksum: sha256:evidence\nproducerRevision: producer-v1\n---\n# Claim\n`);
  const report = auditOkfClaims({ root, sourceRevision: 'src-v1', workspaceRevision: 'ws-v1' });
  assert.equal(report.summary.scannedArtifacts, 2);
  assert.equal(report.summary.claimCandidates, 1);
  assert.equal(report.summary.ignoredArtifacts, 1);
  assert.equal(report.ignoredArtifacts[0].reason, 'NO_CLAIM_METADATA');
  assert.equal(report.status, 'CLAIM_FRESHNESS_PROVEN_DERIVED_ONLY');
});
