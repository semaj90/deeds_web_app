import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertCanonicalWriteAuthorized, CANONICAL_WRITE_SCOPE } from './admission-write-guard-v1.mjs';

const TOKEN = '--confirm-test-writer=AUTHORIZE_TEST_WRITER_V1';
const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

// Builds a temp repo with one snapshot manifest and a receipt bound to it.
function fixture({ scope = CANONICAL_WRITE_SCOPE, manifestSha = null, snapshotRevision = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'admission-guard-'));
  mkdirSync(path.join(root, 'docs/reports/manifests'), { recursive: true });
  const manifest = { schema: 'test.manifest', snapshotRevision: 'sha256:' + 'a'.repeat(64), sources: [] };
  const bytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(path.join(root, 'docs/reports/manifests/m.json'), bytes);
  const admission = {
    status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
    authority: true,
    workspaceRevision: 'sha256:' + 'b'.repeat(64),
    snapshotRevision: snapshotRevision ?? manifest.snapshotRevision,
    manifestPath: 'docs/reports/manifests/m.json',
    manifestSha256: manifestSha ?? sha(bytes),
    approval: { confirmation: 'AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1', scope },
  };
  return { root, admission };
}

test('tournament-only scope is refused for canonical writes', () => {
  const { root, admission } = fixture({ scope: 'TOURNAMENT_SOURCE_AUTHORITY_ONLY' });
  assert.throws(() => assertCanonicalWriteAuthorized({ root, admission, apply: false, argv: [], confirmToken: TOKEN }),
    /ADMISSION_SCOPE_NOT_CANONICAL_WRITE:TOURNAMENT_SOURCE_AUTHORITY_ONLY/);
});

test('--apply without the writer confirmation token is refused', () => {
  const { root, admission } = fixture();
  assert.throws(() => assertCanonicalWriteAuthorized({ root, admission, apply: true, argv: ['--apply'], confirmToken: TOKEN }),
    /CANONICAL_WRITE_CONFIRMATION_REQUIRED/);
});

test('a tampered manifest is refused even with the token', () => {
  const { root, admission } = fixture({ manifestSha: 'sha256:' + '0'.repeat(64) });
  assert.throws(() => assertCanonicalWriteAuthorized({ root, admission, apply: true, argv: [TOKEN], confirmToken: TOKEN }),
    /ADMISSION_MANIFEST_SHA256_MISMATCH/);
});

test('a snapshot revision that the manifest does not carry is refused', () => {
  const { root, admission } = fixture({ snapshotRevision: 'sha256:' + 'c'.repeat(64) });
  assert.throws(() => assertCanonicalWriteAuthorized({ root, admission, apply: true, argv: [TOKEN], confirmToken: TOKEN }),
    /ADMISSION_SNAPSHOT_REVISION_MISMATCH/);
});

test('a malformed manifest checksum is refused', () => {
  const { root, admission } = fixture({ manifestSha: 'sha256:xyz' });
  assert.throws(() => assertCanonicalWriteAuthorized({ root, admission, apply: false, argv: [], confirmToken: TOKEN }),
    /ADMISSION_MANIFEST_BINDING_MISSING/);
});

test('scope, token and bound manifest together return the verified manifest', () => {
  const { root, admission } = fixture();
  const { manifest, manifestPath } = assertCanonicalWriteAuthorized({ root, admission, apply: true, argv: [TOKEN], confirmToken: TOKEN });
  assert.equal(manifest.snapshotRevision, admission.snapshotRevision);
  assert.match(manifestPath, /m\.json$/);
});

test('dry-run needs no token but still needs the scope and bound manifest', () => {
  const { root, admission } = fixture();
  assert.equal(assertCanonicalWriteAuthorized({ root, admission, apply: false, argv: [], confirmToken: TOKEN }).manifest.schema, 'test.manifest');
});
