#!/usr/bin/env node
/**
 * S01-08I — the ONE canonical CLI entrypoint for minting RepositoryIdentityV1/StableFileIdentityV1
 * rows via sveltekit-frontend/src/lib/server/atlas/identity/stable-file-identity-mint-v1.ts.
 * No other script may INSERT into atlas_repository_identity, atlas_stable_file_identity, or
 * atlas_stable_file_revision_binding -- every other consumer reads/projects only.
 *
 * Modes:
 *   --dry-run               READ-ONLY. Runs the same dedup-check SELECTs the mint functions run,
 *                            reports what WOULD happen, writes nothing. Safe to run anytime.
 *   --apply "<exact token>" Executes one bounded transaction (BEGIN -> mint/bind -> readback ->
 *                            COMMIT; ROLLBACK on any error) via the canonical module functions.
 *                            Refuses without the exact literal token for this gate.
 *
 * Target (repository | file), per-invocation, one row/binding at a time -- this script is the
 * mechanism S01-08K's bounded population apply calls per row inside its own transaction batching;
 * it is not itself a bulk backfill runner.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadStableFileIdentityMintModuleV1 } from './lib/load-stable-file-identity-mint-v1.mjs';

const APPLY_TOKEN = 'apply S01-08I stable file mint';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

const mode = arg('--mode'); // 'repository' | 'file'
if (mode !== 'repository' && mode !== 'file') {
  console.error('Usage: --mode=repository|file [--dry-run | --apply "exact token"] <field flags>');
  process.exit(2);
}

const isDryRun = has('--dry-run');
const applyTokenSupplied = arg('--apply');
if (!isDryRun && applyTokenSupplied !== APPLY_TOKEN) {
  console.error(`Refusing to run: pass --dry-run, or --apply with the exact token. Got ${JSON.stringify(applyTokenSupplied)}`);
  process.exit(2);
}

const mod = await loadStableFileIdentityMintModuleV1();
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

const report = { schema: 'atlas.stable-file-identity-mint-cli.v1', gate: 'S01-08I', generatedAt: new Date().toISOString(), mode, dryRun: isDryRun, databaseWrites: 0, status: 'PENDING' };

try {
  if (mode === 'repository') {
    const request = {
      sourceAuthorityRepoId: arg('--source-authority-repo-id'),
      repositoryName: arg('--repository-name'),
      repositoryPath: arg('--repository-path'),
      repositoryKind: arg('--repository-kind'),
      gitmoduleName: arg('--gitmodule-name') ?? null,
      originUrl: arg('--origin-url') ?? null,
      parentRepositoryId: arg('--parent-repository-id') ?? null,
    };
    if (!request.sourceAuthorityRepoId || !request.repositoryName || !request.repositoryPath || !request.repositoryKind) {
      throw new Error('MISSING_REQUIRED_FIELDS: --source-authority-repo-id --repository-name --repository-path --repository-kind');
    }

    if (isDryRun) {
      const existing = await pool.query(
        `SELECT repository_id, source_authority_repo_id, repository_name, repository_path, repository_kind,
                gitmodule_name, origin_url, parent_repository_id, known_commit_oids, created_at
           FROM atlas_repository_identity WHERE source_authority_repo_id = $1`,
        [request.sourceAuthorityRepoId],
      );
      const decision = mod.decideRepositoryIdentityMintV1(existing.rows);
      const wouldMintId = decision === 'MINT_NEW' ? await mod.deriveRepositoryIdV1(request.sourceAuthorityRepoId) : existing.rows[0]?.repository_id ?? null;
      report.status = 'DRY_RUN_PROVEN';
      report.decision = decision;
      report.existingRowCount = existing.rows.length;
      report.wouldMintRepositoryId = wouldMintId;
    } else {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await mod.mintOrReuseRepositoryIdentityV1(client, request);
        await client.query('COMMIT');
        report.status = 'APPLY_PROVEN';
        report.outcome = result.outcome;
        report.row = result.row;
        report.databaseWrites = result.outcome === 'MINTED_NEW' ? 1 : 0;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  } else {
    const request = {
      repositoryId: arg('--repository-id'),
      sourceAuthorityRepoId: arg('--source-authority-repo-id'),
      canonicalSourceRef: arg('--canonical-source-ref'),
      workspaceRevision: arg('--workspace-revision'),
      sourceRevision: arg('--source-revision'),
      contentDigest: arg('--content-digest'),
      byteLength: Number(arg('--byte-length')),
      provenance: arg('--provenance') ?? 'S01-08I-cli',
    };
    for (const [key, value] of Object.entries(request)) {
      if (value === undefined || value === null || value === '' || (key === 'byteLength' && Number.isNaN(value))) {
        throw new Error(`MISSING_OR_INVALID_FIELD: ${key}`);
      }
    }

    if (isDryRun) {
      // Dry-run runs the SAME admission-verification functions the apply path uses -- not a
      // reimplementation -- so a passing dry-run is real evidence about what apply would do.
      await mod.verifyRepositoryIdentityV1(pool, request.repositoryId, request.sourceAuthorityRepoId);
      await mod.verifySourceAuthorityBindingV1(pool, request);
      const sourceIdentityKey = mod.computeSourceIdentityKeyV1(request.repositoryId, request.canonicalSourceRef);
      const activeRows = await pool.query(
        `SELECT DISTINCT b.stable_file_id
           FROM atlas_stable_file_revision_binding b
           JOIN atlas_stable_file_identity f ON f.stable_file_id = b.stable_file_id
          WHERE b.source_identity_key = $1 AND f.lifecycle_state = 'ACTIVE'`,
        [sourceIdentityKey],
      );
      const activeStableFileIds = activeRows.rows.map((r) => r.stable_file_id);
      let existingBinding = null;
      if (activeStableFileIds.length === 1) {
        const bindingRows = await pool.query(
          `SELECT * FROM atlas_stable_file_revision_binding WHERE stable_file_id = $1 AND workspace_revision = $2`,
          [activeStableFileIds[0], request.workspaceRevision],
        );
        existingBinding = bindingRows.rows[0] ?? null;
      }
      const decision = mod.decideStableFileMintV1(activeStableFileIds, existingBinding);
      report.status = 'DRY_RUN_PROVEN';
      report.decision = decision;
      report.sourceIdentityKey = sourceIdentityKey;
      report.activeStableFileIdsForKey = activeStableFileIds;
      report.existingBindingForRevision = existingBinding !== null;
    } else {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await mod.mintOrBindStableFileV1(client, request);
        await client.query('COMMIT');
        report.status = 'APPLY_PROVEN';
        report.outcome = result.outcome;
        report.stableFileId = result.stableFileId;
        report.binding = result.binding;
        report.databaseWrites = result.outcome === 'SAFE_EXISTING_CONTINUITY' ? 0 : result.outcome === 'SAFE_NEW_ID' ? 2 : 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  }
} catch (err) {
  report.status = 'MINT_ABORTED';
  report.error = err instanceof Error ? err.message : String(err);
} finally {
  await pool.end();
}

const body = JSON.stringify(report, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
fs.mkdirSync(path.join(root, 'docs/reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/reports', `stable-file-identity-mint-v1.${sha12}.json`), body + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(root, 'docs/reports/stable-file-identity-mint-v1.json'), body + '\n');
console.log(report.status, JSON.stringify({ mode: report.mode, decision: report.decision, outcome: report.outcome, error: report.error }));
if (report.status !== 'DRY_RUN_PROVEN' && report.status !== 'APPLY_PROVEN') process.exit(1);
