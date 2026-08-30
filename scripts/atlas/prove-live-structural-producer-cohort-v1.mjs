#!/usr/bin/env node

/** Read-only live :8095 replay across the current Graphify nomination cohort. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sidecarUrl = String(process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const nominationsPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const reportPath = path.resolve(root, 'docs/reports/live-structural-producer-cohort-v1.json');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonicalPath = (value) => String(value ?? '').replaceAll('\\', '/');
const nominations = (await fs.readFile(nominationsPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const groups = new Map();
for (const nomination of nominations) {
  const key = canonicalPath(nomination.source_ref);
  const list = groups.get(key) ?? [];
  list.push(nomination);
  groups.set(key, list);
}

const results = [];
async function replay([sourceRef, rows]) {
  const sourcePath = path.resolve(root, sourceRef);
  const result = { sourceRef, nominationCount: rows.length, status: 'INCOMPLETE', exactSpanMatches: 0, exactNodeMatches: 0, failures: [] };
  try {
    const source = await fs.readFile(sourcePath);
    const sourceHash = digest(source);
    const expectedHashes = [...new Set(rows.map((row) => `sha256:${row.source_content_hash}`))];
    result.sourceSha256 = sourceHash;
    result.expectedSourceHashes = expectedHashes;
    if (expectedHashes.length !== 1 || sourceHash !== expectedHashes[0]) {
      result.failures.push({ reason: 'SOURCE_HASH_MISMATCH' });
      results.push(result);
      return;
    }
    const revisions = [...new Set(rows.map((row) => String(row.source_revision ?? '')))].filter(Boolean);
    if (revisions.length !== 1) {
      result.failures.push({ reason: 'SOURCE_REVISION_AMBIGUOUS' });
      results.push(result);
      return;
    }
    const response = await fetch(`${sidecarUrl}/ast/chunk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: source.toString('utf8'), language: rows[0].language, filePath: sourceRef, sourceRevision: revisions[0] }),
      signal: AbortSignal.timeout(20_000),
    });
    result.httpStatus = response.status;
    const body = await response.json();
    if (!response.ok) {
      result.failures.push({ reason: 'SIDECAR_REQUEST_FAILED', status: response.status });
      results.push(result);
      return;
    }
    const bySpan = new Map();
    for (const chunk of Array.isArray(body.chunks) ? body.chunks : []) {
      const key = `${Number(chunk.start_byte)}:${Number(chunk.end_byte)}`;
      const list = bySpan.get(key) ?? [];
      list.push(chunk);
      bySpan.set(key, list);
    }
    for (const row of rows) {
      const matches = bySpan.get(`${row.byte_start}:${row.byte_end}`) ?? [];
      if (matches.length !== 1) {
        result.failures.push({ nominationId: row.nomination_id, reason: matches.length ? 'AMBIGUOUS_LIVE_SPAN' : 'LIVE_SPAN_NOT_FOUND' });
        continue;
      }
      result.exactSpanMatches += 1;
      if (String(matches[0].upstream_node_id ?? '') === String(row.upstream_node_id ?? '')) result.exactNodeMatches += 1;
      else result.failures.push({ nominationId: row.nomination_id, reason: 'LIVE_UPSTREAM_NODE_MISMATCH' });
    }
    result.liveChunkCount = Array.isArray(body.chunks) ? body.chunks.length : 0;
    result.liveEdgeCount = Array.isArray(body.edges) ? body.edges.length : 0;
    result.diagnosticCount = Array.isArray(body.diagnostics) ? body.diagnostics.length : 0;
    result.status = result.failures.length === 0 && result.exactSpanMatches === rows.length && result.exactNodeMatches === rows.length ? 'PROVEN' : 'INCOMPLETE';
  } catch (error) {
    result.failures.push({ reason: 'REPLAY_ERROR', message: error.message });
  }
  results.push(result);
}

const entries = [...groups.entries()];
let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const index = cursor++;
    await replay(entries[index]);
  }
}
await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
results.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
const totals = results.reduce((acc, row) => {
  acc.nominationCount += row.nominationCount;
  acc.exactSpanMatches += row.exactSpanMatches;
  acc.exactNodeMatches += row.exactNodeMatches;
  acc.failures += row.failures.length;
  if (row.status === 'PROVEN') acc.sourcesProven += 1;
  else acc.sourcesIncomplete += 1;
  return acc;
}, { nominationCount: 0, exactSpanMatches: 0, exactNodeMatches: 0, failures: 0, sourcesProven: 0, sourcesIncomplete: 0 });
const payload = { schema: 'atlas.live-structural-producer-cohort.v1', gate: 'GRAPH-RESOLVE-06B.4', sidecarUrl, sourceCount: results.length, totals, results, canonicalWrites: 0, structuralEdgeWrites: 0, databaseWrites: false };
const report = { ...payload, replayChecksum: digest(JSON.stringify(payload)), status: totals.nominationCount === nominations.length && totals.exactSpanMatches === nominations.length && totals.exactNodeMatches === nominations.length && totals.failures === 0 ? 'LIVE_STRUCTURAL_PRODUCER_COHORT_PROVEN' : 'LIVE_STRUCTURAL_PRODUCER_COHORT_INCOMPLETE', readOnly: true, nextGate: 'GRAPH-RESOLVE-06B.4_SECOND_REPLAY_AND_SEPARATE_EDGE_ADMISSION' };
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, sourceCount: report.sourceCount, totals: report.totals, replayChecksum: report.replayChecksum, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
