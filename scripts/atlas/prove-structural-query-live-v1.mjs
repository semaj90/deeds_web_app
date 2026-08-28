#!/usr/bin/env node

/** Read-only live proof: :8095 Tree-sitter evidence -> structural query result. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptTreeSitterEvidence } from './lib/treesitter-structural-observation-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL || 'http://127.0.0.1:8095';
const sourceRef = process.env.ATLAS_STRUCTURAL_QUERY_SOURCE || 'sveltekit-frontend/src/lib/server/ai/trace-reranker.ts';
const queryText = process.env.ATLAS_STRUCTURAL_QUERY || 'which function calls CandidateOrdinal?';
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

async function main() {
  const reportPath = path.join(root, 'docs/reports/treesitter-structural-observation-v1.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const source = fs.readFileSync(path.join(root, sourceRef.replaceAll('/', path.sep)), 'utf8');
  const sourceRevision = report.results?.find((row) => row.sourceRef === sourceRef)?.sourceRevision;
  if (!sourceRevision) throw new Error('STRUCTURAL_QUERY_SOURCE_REVISION_MISSING');
  const response = await fetch(`${sidecarUrl}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, language: 'typescript', filePath: sourceRef, sourceRevision }),
  });
  if (!response.ok) throw new Error(`STRUCTURAL_SIDECAR_HTTP_${response.status}`);
  const adapted = adaptTreeSitterEvidence({ sourceRef, sourceRevision, response: await response.json() });
  const observations = adapted.chunks.map((chunk) => ({
    schema: 'atlas.ast-grep-observation.v1',
    observation_id: chunk.evidenceKey,
    rule_id: `treesitter:${chunk.nodeType}`,
    source_ref: sourceRef,
    source_revision: sourceRevision,
    byte_start: chunk.startByte,
    byte_end: Math.max(chunk.endByte, chunk.startByte + 1),
    upstream_node_id: chunk.upstreamNodeId ?? undefined,
    upstream_chunk_id: chunk.upstreamChunkId ?? undefined,
    matched_text_hash: sha256(source.slice(chunk.startByte, chunk.endByte)),
    captures: {
      name: chunk.name ?? '',
      calls: chunk.calls.join(','),
      imports: chunk.imports.join(','),
      exports: chunk.exports.join(','),
    },
    observation_kind: chunk.nodeType,
    confidence: 1,
    extractor_revision: adapted.extractor,
    canonical_authority: false,
  }));
  const { classifyStructuralQueryV1, executeStructuralQueryV1 } = await import('../../packages/parent-atlas/dist/index.js');
  const result = executeStructuralQueryV1({ plan: classifyStructuralQueryV1(queryText), observations });
  const receipt = {
    schema: 'atlas.structural-query-live-proof.v1',
    mode: 'READ_ONLY_LIVE_SIDECAR',
    sidecar: { url: sidecarUrl, endpoint: '/ast/chunk' },
    sourceRef,
    sourceRevision,
    sourceDigest: `sha256:${sha256(source)}`,
    query: queryText,
    observationCount: observations.length,
    matchCount: result.matches.length,
    resultChecksum: result.resultChecksum,
    canonicalAuthority: false,
    promotionEligible: false,
    executable: false,
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
    status: 'STRUCTURAL_QUERY_OBSERVATION_ADAPTER_PROVEN',
    nextGate: 'STRUCT-11_ATLAS_IDENTITY_RESOLUTION',
  };
  const outputPath = path.join(root, 'docs/reports/structural-query-live-proof-v1.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ status: receipt.status, observationCount: receipt.observationCount, matchCount: receipt.matchCount, reportPath: 'docs/reports/structural-query-live-proof-v1.json' }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
