#!/usr/bin/env node

/** Read-only live :8095 structural producer replay for GRAPH-RESOLVE-06B.4. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateReplayAdmission } from './lib/ast-replay-admission-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sidecarUrl = String(process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const sourceRef = 'sveltekit-frontend/src/lib/server/ace/llm-context-cache.ts';
const sourcePath = path.resolve(root, sourceRef);
const nominationsPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const reportPath = path.resolve(root, 'docs/reports/live-structural-producer-replay-v1.json');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const nominations = (await fs.readFile(nominationsPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse)
  .filter((row) => row.source_ref === sourceRef);
const source = await fs.readFile(sourcePath);
const sourceText = source.toString('utf8');
const sourceHash = digest(source);
const expectedHashes = [...new Set(nominations.map((row) => `sha256:${row.source_content_hash}`))];
const sourceRevision = nominations[0]?.source_revision ?? null;
const request = { source: sourceText, language: 'typescript', filePath: sourceRef, sourceRevision };

// Transport outcome is captured, not thrown, so a refused run still writes a diagnostic report.
let httpOk = false;
let timedOut = false;
let errorMessage = null;
let body = null;
try {
  const response = await fetch(`${sidecarUrl}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20_000),
  });
  httpOk = response.ok;
  body = await response.json().catch(() => null);
} catch (error) {
  timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  errorMessage = timedOut ? null : String(error?.message ?? error);
}

const admission = evaluateReplayAdmission({
  httpOk,
  timedOut,
  errorMessage,
  body,
  nominations,
  preconditionsOk: Boolean(sourceRevision) && sourceHash === expectedHashes[0],
});
const liveChunks = Array.isArray(body?.chunks) ? body.chunks : [];
const payload = {
  schema: 'atlas.live-structural-producer-replay.v1',
  gate: 'GRAPH-RESOLVE-06B.4',
  sidecarUrl,
  sourceRef,
  sourceRevision,
  sourceSha256: sourceHash,
  nominationSourceHashes: expectedHashes,
  engine: body?.engine ?? null,
  engineVersion: body?.engine_version ?? null,
  nominationCount: nominations.length,
  liveChunkCount: liveChunks.length,
  liveEdgeCount: Array.isArray(body?.edges) ? body.edges.length : 0,
  diagnosticCount: Array.isArray(body?.diagnostics) ? body.diagnostics.length : 0,
  // Diagnostic only: the raw receipt is kept so a refused run can be explained. It is never admission evidence.
  scanCompleteness: body?.scan_completeness ?? 'MISSING_RECEIPT',
  scanFailure: body?.scan_failure ?? null,
  admission: admission.admission,
  admissionReason: admission.reason,
  astScanCompleteness: admission.astScanCompleteness,
  nlpStatus: admission.nlpStatus,
  exactSpanMatches: admission.exactSpanMatches,
  exactNodeMatches: admission.exactNodeMatches,
  ambiguousSpans: admission.ambiguousSpans,
  failures: admission.failures,
  revisionQualifiedWrites: admission.revisionQualifiedWrites,
  graphifyProjectionWrites: admission.graphifyProjectionWrites,
  aceAdmissionWrites: admission.aceAdmissionWrites,
  canonicalWrites: 0,
  structuralEdgeWrites: 0,
  databaseWrites: false,
};
const report = {
  ...payload,
  replayChecksum: digest(JSON.stringify(payload)),
  status: admission.admission === 'ALLOWED' ? 'LIVE_STRUCTURAL_PRODUCER_REPLAY_PROVEN' : 'LIVE_STRUCTURAL_PRODUCER_REPLAY_INCOMPLETE',
  readOnly: true,
  nextGate: 'GRAPH-RESOLVE-06B.4_SECOND_REPLAY_AND_SEPARATE_EDGE_ADMISSION',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
