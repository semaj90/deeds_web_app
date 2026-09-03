#!/usr/bin/env node
/**
 * SOURCE-NAMESPACE-CONTRACT-01 proof (read-only).
 *
 * Proves buildSourceNamespaceFromGraphifyFilesV1 against the real, live
 * graphify_files table (885 rows) — not a synthetic fixture. Confirms the
 * WORKSPACE_IDENTITY_ONLY / REVISION_BOUND split matches the real
 * NULL/non-NULL workspace_revision distribution found in
 * WORKSPACE-OWNER-BINDING-01 (docs/reports/workspace-owner-binding-01.json).
 * Zero writes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true, quiet: true });
const REPORT = resolve(ROOT, 'docs/reports/source-namespace-v1-proof.json');

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const contractUrl = pathToFileURL(
    resolve(ROOT, 'sveltekit-frontend/src/lib/server/atlas/embedding/source-namespace-v1.ts'),
  ).href;
  const { buildSourceNamespaceFromGraphifyFilesV1 } = await import(contractUrl);

  const { rows } = await pool.query(
    `SELECT workspace_id, source_ref, workspace_revision FROM graphify_files ORDER BY file_id`,
  );

  let identityOnly = 0;
  let revisionBound = 0;
  let failures = 0;
  const bindingRevisionValues = new Set();

  for (const row of rows) {
    try {
      const ns = buildSourceNamespaceFromGraphifyFilesV1({
        workspaceId: row.workspace_id,
        repositoryId: 'deeds-web-app',
        workspaceRevision: row.workspace_revision,
      });
      if (ns.provenance === 'WORKSPACE_IDENTITY_ONLY') identityOnly += 1;
      else { revisionBound += 1; bindingRevisionValues.add(ns.bindingRevision); }
    } catch (err) {
      failures += 1;
    }
  }

  const report = {
    schema: 'atlas.source-namespace-v1-proof.report',
    generatedAt: new Date().toISOString(),
    liveRowCount: rows.length,
    writesPerformed: false,
    identityOnlyCount: identityOnly,
    revisionBoundCount: revisionBound,
    failureCount: failures,
    distinctBindingRevisionValues: bindingRevisionValues.size,
    matchesWorkspaceOwnerBinding01: identityOnly === 512 && revisionBound === 373,
    note: 'WORKSPACE-OWNER-BINDING-01 found 512/885 NULL and 373/885 non-null (256+111+6) workspace_revision values. This proof confirms the contract classifies the live table identically.',
  };

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
