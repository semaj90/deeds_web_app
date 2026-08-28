#!/usr/bin/env node

/** Read-only proof of the :8095 treesitter-chunker structural API. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptTreeSitterEvidence } from './lib/treesitter-structural-observation-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL || 'http://127.0.0.1:8095';
const approval = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/feature-ontology-explicit-alias-approval-v1.json'), 'utf8'));
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-source-binding-observation.json'), 'utf8'));
const reportPath = path.join(root, 'docs/reports/treesitter-structural-observation-v1.json');
const text = (value) => { const result = String(value ?? '').trim(); return result || null; };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const revisionByRef = new Map((observation.bindings ?? []).map((row) => [text(row.sourceRef), text(row.sourceRevision)]));
  const refs = (approval.approvedPairs ?? []).map((pair) => text(pair.canonicalSourceRef)).filter(Boolean).sort();
  const results = [];
  const failures = [];
  for (const sourceRef of refs) {
    try {
      const file = path.join(root, sourceRef.replaceAll('/', path.sep));
      const source = fs.readFileSync(file, 'utf8');
      const response = await fetch(`${sidecarUrl}/ast/chunk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source, language: 'typescript', filePath: sourceRef, sourceRevision: revisionByRef.get(sourceRef) }) });
      if (!response.ok) throw new Error(`SIDECAR_HTTP_${response.status}`);
      const raw = await response.json();
      const adapted = adaptTreeSitterEvidence({ sourceRef, sourceRevision: revisionByRef.get(sourceRef), response: raw });
      results.push({ sourceRef, sourceDigest: hash(source), sourceRevision: adapted.sourceRevision, extractor: adapted.extractor, syntaxStatus: adapted.syntaxStatus, chunkCount: adapted.chunks.length, edgeCount: adapted.edges.length, unresolvedEdgeCount: adapted.edges.filter((edge) => !edge.resolved).length, observationChecksum: adapted.observationChecksum });
    } catch (error) { failures.push({ sourceRef, error: String(error?.message ?? error) }); }
  }
  const report = { schema: 'atlas.treesitter-structural-observation.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_AUDIT', postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, sidecar: { url: sidecarUrl, endpoint: '/ast/chunk', engine: 'treesitter-chunker' }, selectionChecksum: text(approval.selectionChecksum), workspaceRevision: text(observation.record?.workspaceRevision), sourceCount: refs.length, extractedCount: results.length, failures, results, canonicalAuthority: false, status: failures.length === 0 ? 'STRUCTURAL_OBSERVATIONS_PROVEN' : 'STRUCTURAL_OBSERVATIONS_INCOMPLETE', nextGate: 'AST_IDENTITY_ADAPTER_AND_LSP_RESOLUTION' };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, sourceCount: refs.length, extractedCount: results.length, failures: failures.length, chunks: results.reduce((sum, row) => sum + row.chunkCount, 0), edges: results.reduce((sum, row) => sum + row.edgeCount, 0), reportPath: 'docs/reports/treesitter-structural-observation-v1.json' }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
