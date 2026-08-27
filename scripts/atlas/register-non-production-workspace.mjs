import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const APPLY = process.argv.includes('--apply');
const confirmation = process.argv.find((value) => value.startsWith('--confirm='))?.slice('--confirm='.length) ?? '';
const title = process.argv.find((value) => value.startsWith('--title='))?.slice('--title='.length)
  ?? 'deeds-web-app non-production Graphify canary';
const reportPath = path.resolve(REPO_ROOT, 'docs/reports/workspace-registration-v1.json');
const confirmationPhrase = 'I_UNDERSTAND_NON_PRODUCTION_WORKSPACE_REGISTRATION';

if (!title.trim()) throw new Error('WORKSPACE_TITLE_REQUIRED');
if (APPLY && confirmation !== confirmationPhrase) {
  throw new Error(`WORKSPACE_REGISTRATION_CONFIRMATION_REQUIRED:${confirmationPhrase}`);
}
if (APPLY && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') {
  throw new Error('WORKSPACE_REGISTRATION_NON_PRODUCTION_DATABASE_REQUIRED');
}

const proposedId = randomUUID();
const report = {
  schema: 'atlas.workspace-registration.v1',
  mode: APPLY ? 'apply' : 'dry-run',
  canonicalAuthority: 'postgresql',
  table: 'public.workspaces',
  proposedWorkspaceId: proposedId,
  title: title.trim(),
  description: 'Explicitly registered non-production workspace for bounded Graphify lineage proof.',
  canonicalWriteAttempted: false,
};

if (APPLY) {
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
  });
  try {
    const result = await pool.query(
      `INSERT INTO public.workspaces (id, title, description)
       VALUES ($1::uuid, $2, $3)
       RETURNING id::text AS id, title, description, created_at, updated_at`,
      [proposedId, title.trim(), report.description],
    );
    report.canonicalWriteAttempted = true;
    report.status = 'APPLIED';
    report.workspace = result.rows[0];
  } finally {
    await pool.end();
  }
} else {
  report.status = 'DRY_RUN_READY_FOR_REVIEW';
  report.nextStep = `Re-run with --apply --confirm=${confirmationPhrase} and ATLAS_NON_PRODUCTION_DATABASE=1`;
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
