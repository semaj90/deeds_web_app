#!/usr/bin/env node
// CURRENT-SOURCE-COMPLETED-BOUND-OWNER-01: closes the gap found in
// parent-atlas-retrieval-lineage-dag-convergence/tasks.md -- open->bind->complete
// (graphify-daily-lifecycle-{open,complete}-v1.mjs) writes graphify_runs.workspace_revision but
// never populates graphify_files, so select-current-source-evidence-authority-v1.mts's own
// "Bound" definition (file_row_count > 0 via a LEFT JOIN on graphify_files.last_seen_run_id) is
// never satisfied by that lifecycle alone. This script calls the writer that actually populates
// graphify_files (writeGraphifySourceInventoryV2, existing, never previously invoked from any
// script per a repo-wide grep), then completes the resulting run. Identity/revision-only writes
// (source_ref, code_source_revision, content_hash, byte_length) -- no chunking, AST, embedding,
// Qdrant, or Neo4j work performed here.
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');

const CANONICAL_WORKSPACE_ID = '625743d2-092b-4fa8-abe0-9dc094920c80';
const CANONICAL_REPOSITORY_ID = 'deeds-web-app';
const PARSER_CONTRACT_VERSION = 'graphify.daily-fanout.v1';
const EXTRACTION_CONTRACT_VERSION = 'graphify.source-inventory.daily-fanout.v1';
const RECEIPT_PATH = path.resolve(ROOT, 'docs/reports/graphify-daily-lifecycle-file-inventory-v1.json');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();
  const t0 = performance.now();
  try {
    const { writeGraphifySourceInventoryV2, completeGraphifyRunV2 } = await import(
      'file:///' + path.resolve(FRONTEND, 'src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts').replace(/\\/g, '/')
    );
    const { materializeWorkspaceRevisionOriginV1 } = await import(
      'file:///' + path.resolve(FRONTEND, 'src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.ts').replace(/\\/g, '/')
    );

    const wrappedClient = { query: (text, values) => client.query(text, values) };

    const tMat0 = performance.now();
    const materialized = materializeWorkspaceRevisionOriginV1({
      workspaceRoot: ROOT,
      repositoryId: CANONICAL_REPOSITORY_ID,
      producerRevision: PARSER_CONTRACT_VERSION,
    });
    const tMat1 = performance.now();
    console.log(JSON.stringify({
      step: 'materialized',
      workspaceRevision: materialized.record.workspaceRevision,
      sourceCount: materialized.record.sourceCount,
      bindingsCount: materialized.bindings.length,
      materializeMs: Math.round(tMat1 - tMat0),
    }));

    const tWrite0 = performance.now();
    const receipt = await writeGraphifySourceInventoryV2({
      client: wrappedClient,
      workspaceId: CANONICAL_WORKSPACE_ID,
      record: materialized.record,
      bindings: materialized.bindings,
      parserContractVersion: PARSER_CONTRACT_VERSION,
      extractionContractVersion: EXTRACTION_CONTRACT_VERSION,
      configuration: { wrapper: 'scripts/atlas/graphify-daily-lifecycle-file-inventory-v1.mjs' },
    });
    const tWrite1 = performance.now();
    console.log(JSON.stringify({
      step: 'file-inventory-written',
      runId: receipt.runId,
      writtenSourceCount: receipt.writtenSourceCount,
      readbackVerified: receipt.readbackVerified,
      writeMs: Math.round(tWrite1 - tWrite0),
    }));

    const completed = await completeGraphifyRunV2({
      client: wrappedClient,
      runId: receipt.runId,
      workspaceId: CANONICAL_WORKSPACE_ID,
    });
    console.log(JSON.stringify({ step: 'completed', runId: completed.runId, status: completed.status, completedAt: completed.completedAt }));

    const t1 = performance.now();
    const out = {
      schema: 'atlas.graphify-daily-lifecycle-file-inventory.v1',
      runId: receipt.runId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      workspaceRevision: materialized.record.workspaceRevision,
      sourceCount: materialized.record.sourceCount,
      writtenSourceCount: receipt.writtenSourceCount,
      readbackVerified: receipt.readbackVerified,
      status: completed.status,
      completedAt: completed.completedAt,
      timingMs: { materialize: Math.round(tMat1 - tMat0), write: Math.round(tWrite1 - tWrite0), total: Math.round(t1 - t0) },
      writesPerformed: { postgres: true, qdrant: false, neo4j: false, valkey: false, chunking: false, ast: false, embedding: false },
    };
    writeFileSync(RECEIPT_PATH, JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'FILE_INVENTORY_LIFECYCLE_COMPLETE', ...out.timingMs, receiptPath: RECEIPT_PATH }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`GRAPHIFY_DAILY_LIFECYCLE_FILE_INVENTORY_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
