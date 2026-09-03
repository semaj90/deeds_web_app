#!/usr/bin/env node
// GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01 (2026-09-03): opens a real graphify_runs row for the live
// npm run graphify:daily entrypoint (scripts/startup/run-graphify-daily-startup.mjs), then binds
// a real, materialized WorkspaceRevisionRecordV1 to it. This is the first half of the real
// open->bind->complete lifecycle; scripts/atlas/graphify-daily-lifecycle-complete-v1.mjs is the
// second half, invoked after the daily chain succeeds.
//
// Uses the proven primitives from graphify-source-inventory-writer-v2.ts
// (openGraphifyRunV1 / bindWorkspaceRevisionV1) exactly as they were already live-proved in
// scripts/atlas/prove-graphify-open-bind-complete-lifecycle-v1.mjs -- no new SQL, no new
// primitive. Must be invoked via `npx tsx` (the writer module is .ts with no build step); a plain
// `node` invocation cannot dynamic-import it on this repo's Node/toolchain setup (confirmed:
// plain `node --eval "import('...graphify-source-inventory-writer-v2.ts')"` fails with
// `Unknown file extension ".ts"`).
//
// Non-fatal by design at the call site (run-graphify-daily-startup.mjs wraps this in try/catch
// and continues the real indexing chain on failure) -- lifecycle bookkeeping must never block the
// actual daily indexing work it is trying to observe.
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');

const CANONICAL_WORKSPACE_ID = '625743d2-092b-4fa8-abe0-9dc094920c80'; // scripts/atlas/daily-graphify-config.json workspace_uuid
const CANONICAL_REPOSITORY_ID = 'deeds-web-app'; // scripts/atlas/daily-graphify-config.json repository_key
const PARSER_CONTRACT_VERSION = 'graphify.daily-fanout.v1';
const EXTRACTION_CONTRACT_VERSION = 'graphify.source-inventory.daily-fanout.v1';
const RECEIPT_PATH = path.resolve(ROOT, 'docs/reports/graphify-daily-lifecycle-v1.json');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();
  try {
    const { openGraphifyRunV1, bindWorkspaceRevisionV1 } = await import(
      'file:///' + path.resolve(FRONTEND, 'src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts').replace(/\\/g, '/')
    );
    const { materializeWorkspaceRevisionOriginV1 } = await import(
      'file:///' + path.resolve(FRONTEND, 'src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.ts').replace(/\\/g, '/')
    );

    const wrappedClient = { query: (text, values) => client.query(text, values) };
    const repositoryRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

    const opened = await openGraphifyRunV1({
      client: wrappedClient,
      workspaceId: CANONICAL_WORKSPACE_ID,
      repositoryRevision,
      parserContractVersion: PARSER_CONTRACT_VERSION,
      extractionContractVersion: EXTRACTION_CONTRACT_VERSION,
      dryRun: false,
      configuration: { wrapper: 'scripts/startup/run-graphify-daily-startup.mjs' },
    });
    console.log(JSON.stringify({ step: 'opened', runId: opened.runId, workspaceId: opened.workspaceId, repositoryRevision: opened.repositoryRevision }));

    const openedAt = new Date().toISOString();
    const materialized = materializeWorkspaceRevisionOriginV1({
      workspaceRoot: ROOT,
      repositoryId: CANONICAL_REPOSITORY_ID,
      producerRevision: PARSER_CONTRACT_VERSION,
    });
    console.log(JSON.stringify({
      step: 'materialized',
      workspaceRevision: materialized.record.workspaceRevision,
      sourceCount: materialized.record.sourceCount,
      bindingsCount: materialized.bindings.length,
      skippedCount: materialized.skipped.length,
      dirty: materialized.record.dirty,
    }));

    const bound = await bindWorkspaceRevisionV1({
      client: wrappedClient,
      runId: opened.runId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      record: materialized.record,
    });
    console.log(JSON.stringify({ step: 'bound', runId: bound.runId, workspaceRevision: bound.workspaceRevision, sourceManifestSourceCount: bound.sourceManifestSourceCount }));

    mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
    writeFileSync(RECEIPT_PATH, JSON.stringify({
      schema: 'atlas.graphify-daily-lifecycle.v1',
      runId: opened.runId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      repositoryRevision,
      workspaceRevision: materialized.record.workspaceRevision,
      sourceManifestDigest: materialized.record.sourceManifestDigest,
      sourceCount: materialized.record.sourceCount,
      bindingsCount: materialized.bindings.length,
      skippedCount: materialized.skipped.length,
      dirty: materialized.record.dirty,
      status: 'RUNNING',
      openedAt,
      boundAt: new Date().toISOString(),
      completedAt: null,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'OPEN_BIND_COMPLETE', runId: opened.runId, receiptPath: RECEIPT_PATH }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`GRAPHIFY_DAILY_LIFECYCLE_OPEN_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
