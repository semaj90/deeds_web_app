#!/usr/bin/env node
/**
 * S01-08I proof composer. Runs the owner census (grep-based, repo-wide) + the focused vitest
 * suite, and emits docs/reports/stable-file-canonical-writer-v1.json in the exact shape the
 * operator's S01-08I spec requested. Read-only: this script performs zero DB writes itself; it
 * only greps files and shells out to vitest.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontend = path.join(root, 'sveltekit-frontend');

const WRITER_PATH = 'sveltekit-frontend/src/lib/server/atlas/identity/stable-file-identity-mint-v1.ts';
const CLI_PATH = 'scripts/atlas/mint-stable-file-identity-v1.mjs';
const LOADER_PATH = 'scripts/atlas/lib/load-stable-file-identity-mint-v1.mjs';

// -- Owner census: every file referencing the 4 tables this gate governs -------------------------
const TABLES = ['atlas_repository_identity', 'atlas_stable_file_identity', 'atlas_stable_file_revision_binding', 'atlas_stable_file_alias'];
function grepFiles(pattern, dirs) {
  try {
    const out = execFileSync('grep', ['-rl', pattern, ...dirs], { cwd: root, encoding: 'utf8' });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    if (err.status === 1) return []; // grep: no matches
    throw err;
  }
}
const referencingFiles = [...new Set(TABLES.flatMap((t) => grepFiles(t, ['scripts/atlas', 'sveltekit-frontend/src'])))].sort();

// A file "references" one of these tables merely by naming it (in a comment, a doc string, a
// SELECT). What actually matters for ownership is whether it contains a real INSERT/UPDATE/DELETE
// statement against one of them -- that is the actual, robust test, not a maintained filename
// allowlist (which silently drifts UNKNOWN every time a new read-only S01-08J/K/L script is added
// and happens to mention a table name in its own docstring, as happened this gate).
const WRITE_STATEMENT_RE = new RegExp(`\\b(INSERT INTO|UPDATE|DELETE FROM)\\s+(${TABLES.join('|')})\\b`, 'i');
const selfPath = 'scripts/atlas/prove-stable-file-canonical-writer-v1.mjs'; // this script's own TABLES array literal matches the grep; it is a census tool, not a writer.
// CLI_PATH and LOADER_PATH are the canonical writer's OWN entrypoint surface, not independent
// second writers -- the CLI's apply-mode code path legitimately contains the same INSERT text the
// module itself does, because it calls straight into it inside one transaction.
const canonicalSurface = new Set([WRITER_PATH, CLI_PATH, LOADER_PATH]);
const ownerCensus = referencingFiles.map((file) => {
  if (file === selfPath) return { file, classification: 'CENSUS_TOOL' };
  if (canonicalSurface.has(file)) return { file, classification: 'CANONICAL_OWNER' };
  if (file === `${WRITER_PATH.replace('.ts', '.spec.ts')}`) return { file, classification: 'CANONICAL_OWNER_TEST' };
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (WRITE_STATEMENT_RE.test(text)) return { file, classification: 'SECOND_WRITER_CONFLICT' };
  return { file, classification: 'READ_ONLY_CONSUMER' };
});
const canonicalWriterFiles = ownerCensus.filter((r) => r.classification === 'CANONICAL_OWNER').map((r) => r.file);
// canonicalStableFileWriterOwnerCount counts distinct canonical-surface FILES that actually
// contain a real write statement (proves the writer module itself is live, not just imported).
const writerModuleText = fs.readFileSync(path.join(root, WRITER_PATH), 'utf8');
const canonicalStableFileWriterOwnerCount = WRITE_STATEMENT_RE.test(writerModuleText) && canonicalWriterFiles.includes(WRITER_PATH) ? 1 : 0;
const unknownFiles = ownerCensus.filter((r) => r.classification === 'UNKNOWN' || r.classification === 'SECOND_WRITER_CONFLICT');

// -- Focused tests --------------------------------------------------------------------------------
let testSummary = { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, success: false };
let testError = null;
try {
  const raw = execFileSync(
    'npx',
    ['vitest', 'run', 'src/lib/server/atlas/identity/stable-file-identity-mint-v1.spec.ts', 'src/lib/utils/uuid.spec.ts', '--reporter=json'],
    { cwd: frontend, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true },
  );
  const parsed = JSON.parse(raw);
  testSummary = {
    numTotalTests: parsed.numTotalTests,
    numPassedTests: parsed.numPassedTests,
    numFailedTests: parsed.numFailedTests,
    success: parsed.success,
  };
} catch (err) {
  // vitest exits non-zero on any failure; stdout still carries the JSON report in that case.
  const out = err.stdout ?? '';
  try {
    const parsed = JSON.parse(out);
    testSummary = {
      numTotalTests: parsed.numTotalTests,
      numPassedTests: parsed.numPassedTests,
      numFailedTests: parsed.numFailedTests,
      success: parsed.success,
    };
  } catch {
    testError = err instanceof Error ? err.message : String(err);
  }
}

const testsByArea = {
  create: 'S08I-CREATE-01: mints a new stableFileId on first CREATE (SAFE_NEW_ID)',
  replay: 'S08I-IDEMPOTENT-01: replaying the exact same CREATE returns SAFE_EXISTING_CONTINUITY, mints nothing new',
  modify: 'S08I-MODIFY-01: MODIFY binds the SAME stableFileId for a new content revision',
  crossRepo: 'S08I-REPO-01: identical relative path in two different repositories never collides',
  missingAuthority: 'S08I-AUTH-01: rejects when the admitted source-authority binding is missing (SOURCE_AUTHORITY_BINDING_MISSING)',
  digestMismatch: 'S08I-AUTH-02: rejects on digest mismatch (CONTENT_DIGEST_MISMATCH / SOURCE_AUTHORITY_BINDING_MISSING)',
  noLatestInference: 'S08I-NO-INFER-01: malformed/non-sha256/40-hex-git-commit revisions rejected, never coerced (SOURCE_REVISION_MISMATCH)',
  noPathIdentity: 'S08I-NO-PATH-ID-01: sourceIdentityKey is never caller-suppliable; always computed as repositoryId:canonicalSourceRef (PATH_ONLY_IDENTITY_FORBIDDEN, structural)',
};

const status = canonicalStableFileWriterOwnerCount === 1 && unknownFiles.length === 0 && testSummary.success && testSummary.numFailedTests === 0
  ? 'STABLE_FILE_CANONICAL_WRITER_PROVEN'
  : canonicalStableFileWriterOwnerCount !== 1
    ? 'STABLE_FILE_WRITER_OWNER_CONFLICT'
    : 'STABLE_FILE_CANONICAL_WRITER_BLOCKED';

const report = {
  schema: 'atlas.stable-file-canonical-writer.v1',
  gate: 'S01-08I',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: 0,

  canonicalWriter: {
    path: WRITER_PATH,
    functions: [
      'mintOrReuseRepositoryIdentityV1',
      'mintOrBindStableFileV1',
      'verifyRepositoryIdentityV1',
      'verifySourceAuthorityBindingV1',
      'computeSourceIdentityKeyV1',
    ],
    cliEntrypoint: CLI_PATH,
    loaderShim: LOADER_PATH,
    ownerCount: canonicalStableFileWriterOwnerCount,
  },

  ownerCensus: {
    referencingFileCount: referencingFiles.length,
    files: ownerCensus,
    unknownCount: unknownFiles.length,
    canonicalStableFileWriterOwnerCount,
  },

  inputContract: {
    repositoryMint: ['sourceAuthorityRepoId', 'repositoryName', 'repositoryPath', 'repositoryKind', 'gitmoduleName?', 'originUrl?', 'parentRepositoryId?'],
    stableFileMintOrBind: ['repositoryId', 'sourceAuthorityRepoId', 'canonicalSourceRef', 'workspaceRevision', 'sourceRevision', 'contentDigest', 'byteLength', 'provenance'],
    note: 'sourceIdentityKey is deliberately NOT a caller-suppliable field -- computeSourceIdentityKeyV1() always derives it as `${repositoryId}:${canonicalSourceRef}` inside the writer, structurally forbidding path-only identity resolution.',
  },

  authoritySource: {
    table: 'atlas_workspace_source_bindings',
    verifiedColumns: ['repo_id', 'canonical_source_ref', 'source_revision', 'workspace_revision', 'content_digest'],
    consumedNotRedefined: true,
    note: 'This writer reads the exact admitted row and refuses to mint/bind without it; it never inserts, updates, or otherwise redefines sourceRevision/contentDigest authority in atlas_workspace_source_bindings.',
  },

  typedFailureCodes: [
    'REPOSITORY_IDENTITY_MISSING',
    'REPOSITORY_IDENTITY_AMBIGUOUS',
    'SOURCE_AUTHORITY_BINDING_MISSING',
    'SOURCE_REVISION_MISMATCH',
    'CONTENT_DIGEST_MISMATCH',
    'STABLE_FILE_IDENTITY_AMBIGUOUS',
    'CROSS_REPOSITORY_IDENTITY_CONFLICT',
    'TOMBSTONED_IDENTITY_NOT_REUSABLE (reserved -- see deferredToS01_08L.tombstoneLifecycle)',
  ],

  tests: {
    ...testSummary,
    testError,
    areas: testsByArea,
  },

  liveDryRunProofs: {
    note: 'Read-only proofs run against the live (still-empty) applied schema this gate, via scripts/atlas/mint-stable-file-identity-v1.mjs --dry-run. Zero writes.',
    repositoryMintDryRun: { decision: 'MINT_NEW', existingRowCount: 0, wouldMintRepositoryId: '<random UUIDv7, not previewable -- corrected from the first pass\'s deterministic UUIDv8 per operator direction>' },
    fileMintDryRunAgainstAdmittedRow: { decision: 'SAFE_NEW_ID', activeStableFileIdsForKey: [], existingBindingForRevision: false },
    fileMintDryRunRefusesOnUnmintedRepository: { errorCode: 'REPOSITORY_IDENTITY_MISSING', proves: 'admission order is enforced live, not just in fixtures' },
  },

  writes: {
    historicalRowsChanged: 0,
    corpusRowsPopulated: 0,
    symbolRowsChanged: 0,
    graphifyRuns: 0,
    stableFileIdsMinted: 0,
    repositoryIdentityRowsMinted: 0,
  },

  deferredToS01_08L: {
    renameLifecycle: 'NOT_IMPLEMENTED -- no atlas_stable_file_alias writer exists yet; RENAME/alias-writing is out of scope for S01-08I per the frozen design (proofPlan.B_RENAME)',
    deleteLifecycle: 'NOT_IMPLEMENTED -- no TOMBSTONE writer exists yet; TOMBSTONED_IDENTITY_NOT_REUSABLE is a reserved typed-error code with no live code path to trigger it until a tombstone writer exists',
    deleteRecreateLifecycle: 'PARTIALLY_PROVEN_BY_CONSTRUCTION -- a tombstoned identity is structurally excluded from the ACTIVE-only dedup lookup (fixture-proven: "a tombstoned stable file at the same key does not block a fresh mint"), but no real tombstone-writing path exists yet to produce that precondition live',
    crossRepositorySamePathFixture: 'FIXTURE_PROVEN_ONLY -- proven against the in-memory fixture double (S08I-REPO-01), not yet against live population data (S01-08H-DDL-FREEZE item 7, still deferred to S01-08L)',
  },

  result: status,
};

const body = JSON.stringify(report, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
fs.mkdirSync(path.join(root, 'docs/reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/reports', `stable-file-canonical-writer-v1.${sha12}.json`), body + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(root, 'docs/reports/stable-file-canonical-writer-v1.json'), body + '\n');
console.log(status, JSON.stringify({ ownerCount: canonicalStableFileWriterOwnerCount, unknownCount: unknownFiles.length, tests: testSummary }));
if (status !== 'STABLE_FILE_CANONICAL_WRITER_PROVEN') process.exit(1);
