#!/usr/bin/env node
// Ontology-linked-tuple writer observability census (read-only, part of the SYMBOL-PROMOTED-
// UNKNOWN-01 gate per the review that scoped it).
//
// persistOntologyLinkedTuples() (src/lib/server/atlas/ontology-linked-tuple-postgres.ts) is a
// real, wired Postgres writer -- called from taxonomy-topology-packet.ts's
// buildTaxonomyTopologyPacket(), itself invoked by a registered tool in
// src/mcp/trace-mcp-server.ts -- yet atlas_ontology_linked_tuples has 0 live rows (verified
// SESSION-206c). This script determines, from STATIC evidence only (no live invocation
// performed by this script), which of five states best describes why.
//
// Read-only: 1 SELECT against Postgres, static grep against the source tree. No writes anywhere.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'ontology-linked-tuple-writer-observability-v1.json');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function grep(pattern, globs) {
  try {
    const out = execFileSync('git', ['grep', '-F', '-l', pattern, '--', ...globs], { cwd: REPO_ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const { rows } = await pool.query('SELECT count(*) AS n FROM atlas_ontology_linked_tuples');
  await pool.end();
  const liveRowCount = Number(rows[0]?.n ?? 0);

  const writerCallers = grep('persistOntologyLinkedTuples(', ['src/**/*.ts']).filter((f) => !f.endsWith('.spec.ts'));
  const errorPathLogsWarn = readFileSync(
    path.join(REPO_ROOT, 'src', 'lib', 'server', 'atlas', 'taxonomy-topology-packet.ts'), 'utf8',
  ).includes("console.warn('[taxonomy-topology-packet] Postgres tuple persistence failed");

  // Static evidence searched, none found: no persisted receipt/log file records a past
  // invocation's linkedTuples input count, written count, or error detail for this writer.
  const runtimeReceiptsFound = grep('taxonomy-topology-packet:v1', ['docs/reports/**/*.json', 'logs/**/*.log']);

  const classification =
    liveRowCount > 0
      ? 'WRITE_SUCCESS_WITH_ROWS' // not one of the 5 states -- would mean the premise (0 rows) is stale
      : runtimeReceiptsFound.length > 0
        ? 'WRITE_FAILURE_OBSERVED_OR_ZERO_ROWS_SEE_RECEIPTS' // would need receipt content review
        : 'INSUFFICIENT_TELEMETRY';

  const receipt = {
    schema: 'atlas.ontology-linked-tuple-writer-observability.v1',
    generatedAt: new Date().toISOString(),
    liveRowCount,
    writerFunction: 'persistOntologyLinkedTuples (src/lib/server/atlas/ontology-linked-tuple-postgres.ts)',
    registeredCallers: writerCallers,
    registeredCallerCount: writerCallers.length,
    callChainToMcpTool: 'taxonomy-topology-packet.ts::buildTaxonomyTopologyPacket() -> registered tool in src/mcp/trace-mcp-server.ts (verified static import, 2026-09-22)',
    errorPathDoesLogOnException: errorPathLogsWarn,
    errorPathBehavior: errorPathLogsWarn
      ? 'A thrown exception IS logged via console.warn(DEGRADED_PERSISTENCE) before the .catch() ' +
        'fallback returns {written:0, errors:[...]} -- the failure is NOT silently swallowed at ' +
        'the code level, but no PERSISTENT receipt/log file capturing that warning was found by ' +
        'this census (console output is ephemeral unless separately captured).'
      : 'Could not verify error-path logging statically.',
    runtimeInvocationReceiptsFound: runtimeReceiptsFound,
    classification,
    classificationRationale:
      classification === 'INSUFFICIENT_TELEMETRY'
        ? 'The writer is real, wired, and its error path does log on exception -- but no persisted ' +
          'receipt, log file, or other durable evidence of any PAST invocation (successful or ' +
          'failed) was found by static search. This census does not itself invoke the writer, per ' +
          'the read-only mandate, so it cannot distinguish WRITER_NOT_OBSERVED (never called) from ' +
          'UPSTREAM_LINKED_TUPLES_EMPTY (called, but summary.linkedTuples was empty) from ' +
          'WRITE_FAILURE_OBSERVED (called, threw, only logged to now-lost console output) from ' +
          'WRITE_SUCCESS_WITH_ZERO_ROWS (called with an empty tuples array, "succeeded" trivially).'
        : null,
    canonicalAuthority: false,
    writesPerformed: false,
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(`liveRowCount=${liveRowCount}  registeredCallers=${writerCallers.length}  classification=${classification}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
