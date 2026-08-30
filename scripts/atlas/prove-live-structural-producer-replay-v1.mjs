#!/usr/bin/env node

/** Read-only live :8095 structural producer replay for GRAPH-RESOLVE-06B.4. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
const response = await fetch(`${sidecarUrl}/ast/chunk`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(request),
  signal: AbortSignal.timeout(20_000),
});
const body = await response.json();
if (!response.ok) throw new Error(`SIDECAR_AST_CHUNK_FAILED:${response.status}`);
const liveChunks = Array.isArray(body.chunks) ? body.chunks : [];
const bySpan = new Map();
for (const chunk of liveChunks) {
  const key = `${Number(chunk.start_byte)}:${Number(chunk.end_byte)}`;
  const list = bySpan.get(key) ?? [];
  list.push(chunk);
  bySpan.set(key, list);
}
let exactSpanMatches = 0;
let exactNodeMatches = 0;
let ambiguousSpans = 0;
const failures = [];
for (const nomination of nominations) {
  const matches = bySpan.get(`${nomination.byte_start}:${nomination.byte_end}`) ?? [];
  if (matches.length !== 1) {
    if (matches.length > 1) ambiguousSpans += 1;
    failures.push({ nominationId: nomination.nomination_id, reason: matches.length ? 'AMBIGUOUS_LIVE_SPAN' : 'LIVE_SPAN_NOT_FOUND' });
    continue;
  }
  exactSpanMatches += 1;
  if (String(matches[0].upstream_node_id ?? '') === String(nomination.upstream_node_id ?? '')) exactNodeMatches += 1;
  else failures.push({ nominationId: nomination.nomination_id, reason: 'LIVE_UPSTREAM_NODE_MISMATCH' });
}
const payload = {
  schema: 'atlas.live-structural-producer-replay.v1',
  gate: 'GRAPH-RESOLVE-06B.4',
  sidecarUrl,
  sourceRef,
  sourceRevision,
  sourceSha256: sourceHash,
  nominationSourceHashes: expectedHashes,
  engine: body.engine ?? null,
  engineVersion: body.engine_version ?? null,
  nominationCount: nominations.length,
  liveChunkCount: liveChunks.length,
  liveEdgeCount: Array.isArray(body.edges) ? body.edges.length : 0,
  diagnosticCount: Array.isArray(body.diagnostics) ? body.diagnostics.length : 0,
  exactSpanMatches,
  exactNodeMatches,
  ambiguousSpans,
  failures,
  canonicalWrites: 0,
  structuralEdgeWrites: 0,
  databaseWrites: false,
};
const replayBytes = JSON.stringify(payload);
const report = {
  ...payload,
  replayChecksum: digest(replayBytes),
  status: response.ok && sourceRevision && sourceHash === expectedHashes[0] && nominations.length > 0 && exactSpanMatches === nominations.length && exactNodeMatches === nominations.length && failures.length === 0 ? 'LIVE_STRUCTURAL_PRODUCER_REPLAY_PROVEN' : 'LIVE_STRUCTURAL_PRODUCER_REPLAY_INCOMPLETE',
  readOnly: true,
  nextGate: 'GRAPH-RESOLVE-06B.4_SECOND_REPLAY_AND_SEPARATE_EDGE_ADMISSION',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
