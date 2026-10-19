#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { verifyAndParseVitestExecution } from '../../sveltekit-frontend/src/lib/server/atlas/execution/test-receipt-ingest-v1.ts';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const REPORT_DIR = path.join(REPO_ROOT, '.tmp', 'atlas', 'test-execution');
const VERIFIER_ID = 'vitest-json-independent-verifier-v1';
const VERIFIER_REVISION = `sha256:${createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex')}`;

function parseArgs(argv) {
  let eventPath;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--event' && argv[index + 1]) eventPath = argv[++index];
    else if (argv[index] === '--apply') apply = true;
    else if (argv[index] === '--dry-run') apply = false;
    else throw new Error(`UNKNOWN_ARGUMENT:${argv[index]}`);
  }
  if (!eventPath) throw new Error('EVENT_PATH_REQUIRED');
  const resolved = path.resolve(REPO_ROOT, eventPath);
  if (!resolved.startsWith(`${REPORT_DIR}${path.sep}`)) throw new Error('EVENT_PATH_OUTSIDE_REPORT_DIR');
  if (!fs.existsSync(resolved)) throw new Error('EVENT_FILE_NOT_FOUND');
  return { eventPath: resolved, apply };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function recomputeSourceRevision(sourceFiles) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length === 0) throw new Error('SOURCE_FILE_MANIFEST_MISSING');
  const stable = [...sourceFiles].sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
  for (const source of stable) {
    if (typeof source.sourceRef !== 'string' || typeof source.sha256 !== 'string') throw new Error('SOURCE_FILE_MANIFEST_INVALID');
    const filePath = path.resolve(REPO_ROOT, source.sourceRef);
    if (!filePath.startsWith(`${REPO_ROOT}${path.sep}`) || !fs.existsSync(filePath)) throw new Error('SOURCE_FILE_MISSING');
    if (sha256(fs.readFileSync(filePath)) !== source.sha256) throw new Error(`SOURCE_DIGEST_MISMATCH:${source.sourceRef}`);
  }
  return sha256(stable.map((source) => `${source.sourceRef}\0${source.sha256}`).join('\n'));
}

function verifyArtifact(eventPath) {
  const manifest = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  if (manifest.schema !== 'atlas.vitest-execution-event.v1') throw new Error('EVENT_SCHEMA_INVALID');
  const reportPath = path.resolve(REPO_ROOT, manifest.reportPath);
  if (!reportPath.startsWith(`${REPORT_DIR}${path.sep}`) || !fs.existsSync(reportPath)) throw new Error('REPORT_PATH_INVALID_OR_MISSING');
  const rawStdout = fs.readFileSync(reportPath, 'utf8');
  const digest = `sha256:${sha256(rawStdout)}`;
  if (digest !== manifest.stdoutHash) throw new Error('REPORT_DIGEST_MISMATCH');
  const sourceRevision = `sha256:${recomputeSourceRevision(manifest.sourceFiles)}`;
  if (sourceRevision !== manifest.sourceRevision) throw new Error('SOURCE_REVISION_MISMATCH');
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (git.status !== 0) throw new Error('GIT_HEAD_UNAVAILABLE');
  const workspaceRevision = `sha256:${sha256(`${git.stdout.trim()}\0${sourceRevision.slice(7)}`)}`;
  if (workspaceRevision !== manifest.workspaceRevision) throw new Error('WORKSPACE_REVISION_MISMATCH');
  const event = { ...manifest, rawStdout };
  const outcome = verifyAndParseVitestExecution(event, {
    expectedWorkspaceRevision: workspaceRevision,
    expectedCommand: manifest.command,
  });
  return { manifest, reportPath, rawStdout, digest, outcome };
}

async function persistIndependentVerdicts(verified) {
  if (verified.outcome.receipts.length === 0) return 0;
  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()) });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = verified.outcome.receipts.map((receipt) => receipt.executionReceiptId);
    const stored = await client.query(`
      SELECT execution_receipt_id, run_revision, test_key, status, report_checksum, source_revision
      FROM atlas_test_execution_receipts
      WHERE execution_receipt_id = ANY($1::text[])
      FOR SHARE
    `, [ids]);
    const byId = new Map(stored.rows.map((row) => [row.execution_receipt_id, row]));
    for (const receipt of verified.outcome.receipts) {
      const row = byId.get(receipt.executionReceiptId);
      if (!row || row.run_revision !== verified.manifest.toolEventId
        || row.test_key !== receipt.testKey || row.status !== receipt.status
        || row.report_checksum !== verified.digest.slice(7)
        || row.source_revision !== receipt.sourceRevision) {
        throw new Error(`CANONICAL_RECEIPT_READBACK_MISMATCH:${receipt.executionReceiptId}`);
      }
    }
    const status = ['VERIFIED_PASS', 'VERIFIED_FAIL', 'FABRICATED'].includes(verified.outcome.verificationStatus)
      ? verified.outcome.verificationStatus
      : 'UNVERIFIED';
    let inserted = 0;
    for (const receipt of verified.outcome.receipts) {
      const result = await client.query(`
        INSERT INTO atlas_receipt_verifier_results_v1 (
          execution_receipt_id, verifier_id, verifier_revision,
          verification_status, evidence_resolved, computed_digest,
          command_identity, workspace_revision, source_revision, canonical
        ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, false)
        ON CONFLICT (execution_receipt_id, verifier_id, verifier_revision) DO NOTHING
      `, [receipt.executionReceiptId, VERIFIER_ID, VERIFIER_REVISION, status,
        verified.digest, verified.manifest.command, verified.manifest.workspaceRevision,
        verified.manifest.sourceRevision]);
      inserted += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const verified = verifyArtifact(args.eventPath);
  const summary = {
    schema: 'atlas.independent-test-receipt-verification.v1',
    eventPath: path.relative(REPO_ROOT, args.eventPath).split(path.sep).join('/'),
    reportDigest: verified.digest,
    verificationStatus: args.apply ? verified.outcome.verificationStatus : 'PENDING_CANONICAL_READBACK',
    artifactVerificationStatus: verified.outcome.verificationStatus,
    qualified: false,
    isTrainable: false,
    rejectionReason: verified.outcome.rejectionReason ?? null,
    receiptCount: verified.outcome.receipts.length,
    canonicalReadback: false,
    databaseWrites: false,
  };
  if (args.apply) {
    summary.persistedVerdictCount = await persistIndependentVerdicts(verified);
    summary.databaseWrites = summary.persistedVerdictCount > 0;
    summary.canonicalReadback = verified.outcome.receipts.length > 0;
    summary.qualified = verified.outcome.qualified && summary.canonicalReadback;
    summary.isTrainable = verified.outcome.isTrainable && summary.canonicalReadback;
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!verified.outcome.qualified) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
