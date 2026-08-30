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
const currentMode = process.argv.includes('--current');
const text = (value) => { const result = String(value ?? '').trim(); return result || null; };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const REPO_ID = '00000000-0000-0000-0000-000000000000';
const treeNodeId = (sourceRef, language, nodeKind, qualifiedSymbol) => crypto.createHash('sha256')
  .update([REPO_ID, sourceRef, language, nodeKind, qualifiedSymbol ?? '', '', ''].join('\x00'), 'utf8')
  .digest('hex');

async function main() {
  const currentReport = currentMode
    ? JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/current-graphify-source-revision-v1.json'), 'utf8'))
    : null;
  const revisionByRef = currentMode
    ? new Map((currentReport.rows ?? []).map((row) => [text(row.sourceRef), text(row.sourceRevision)]))
    : new Map((observation.bindings ?? []).map((row) => [text(row.sourceRef), text(row.sourceRevision)]));
  const contentHashByRef = currentMode
    ? new Map((currentReport.rows ?? []).map((row) => [text(row.sourceRef), text(row.actualContentHash ?? row.contentHash)]))
    : new Map();
  const providerRevision = (sourceRef) => {
    if (!currentMode) return revisionByRef.get(sourceRef);
    const value = String(contentHashByRef.get(sourceRef) ?? '').replace(/^sha256:/i, '').trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(value) ? `sha256:${value}` : null;
  };
  const refs = currentMode
    ? (currentReport.rows ?? []).map((row) => text(row.sourceRef)).filter(Boolean).sort()
    : (approval.approvedPairs ?? []).map((pair) => text(pair.canonicalSourceRef)).filter(Boolean).sort();
  const languageFor = (sourceRef) => {
    const extension = path.extname(sourceRef).toLowerCase();
    return ({ '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'javascript', '.svelte': 'svelte', '.py': 'python', '.go': 'go', '.rs': 'rust' })[extension] ?? null;
  };
  const results = [];
  const failures = [];
  const snapshotRows = [];
  for (const sourceRef of refs) {
    try {
      const language = languageFor(sourceRef);
      if (!language) {
        results.push({ sourceRef, sourceRevision: revisionByRef.get(sourceRef), extractor: 'treesitter-chunker', syntaxStatus: 'UNSUPPORTED_LANGUAGE', language: null, chunkCount: 0, edgeCount: 0, unresolvedEdgeCount: 0, observationChecksum: null });
        continue;
      }
      const file = path.join(root, sourceRef.replaceAll('/', path.sep));
      const source = fs.readFileSync(file, 'utf8');
      const effectiveSourceRevision = providerRevision(sourceRef);
      if (!effectiveSourceRevision) throw new Error('SOURCE_CONTENT_REVISION_MISSING');
      const response = await fetch(`${sidecarUrl}/ast/chunk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source, language, filePath: sourceRef, sourceRevision: effectiveSourceRevision }) });
      if (!response.ok) throw new Error(`SIDECAR_HTTP_${response.status}`);
      const raw = await response.json();
      const adapted = adaptTreeSitterEvidence({ sourceRef, sourceRevision: effectiveSourceRevision, response: raw });
      const sourceBytes = Buffer.from(source, 'utf8');
      for (const chunk of adapted.chunks) {
        const span = sourceBytes.subarray(chunk.startByte, chunk.endByte);
        snapshotRows.push({
          schema: 'atlas.revision-qualified-ast-node.v1',
          sourceRef,
          graphifySourceRevision: revisionByRef.get(sourceRef) ?? null,
          sourceRevision: effectiveSourceRevision,
          sourceContentHash: `sha256:${hash(source)}`,
          spanContentHash: `sha256:${hash(span)}`,
          treeNodeId: treeNodeId(sourceRef, language, chunk.kind, chunk.name),
          upstreamNodeId: chunk.upstreamNodeId,
          upstreamSymbolId: chunk.upstreamSymbolId,
          nodeKind: chunk.kind,
          qualifiedSymbol: chunk.name,
          startByte: chunk.startByte,
          endByte: chunk.endByte,
          normalizedNodeHash: null,
          parentRoute: chunk.parentRoute,
          extractor: chunk.extractor,
          canonicalAuthority: false,
        });
      }
      results.push({ sourceRef, graphifySourceRevision: revisionByRef.get(sourceRef) ?? null, sourceDigest: hash(source), sourceRevision: adapted.sourceRevision, extractor: adapted.extractor, syntaxStatus: adapted.syntaxStatus, chunkCount: adapted.chunks.length, edgeCount: adapted.edges.length, unresolvedEdgeCount: adapted.edges.filter((edge) => !edge.resolved).length, observationChecksum: adapted.observationChecksum });
    } catch (error) { failures.push({ sourceRef, error: String(error?.message ?? error) }); }
  }
  snapshotRows.sort((a, b) => `${a.sourceRef}|${a.sourceRevision}|${String(a.startByte).padStart(12, '0')}|${String(a.endByte).padStart(12, '0')}|${a.nodeKind}|${a.upstreamNodeId ?? ''}`.localeCompare(`${b.sourceRef}|${b.sourceRevision}|${String(b.startByte).padStart(12, '0')}|${String(b.endByte).padStart(12, '0')}|${b.nodeKind}|${b.upstreamNodeId ?? ''}`));
  const snapshotPath = path.join(root, '.tmp/atlas/current-source-ast-snapshot-v1.ndjson');
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const snapshotText = snapshotRows.map((row) => JSON.stringify(row)).join('\n') + (snapshotRows.length ? '\n' : '');
  fs.writeFileSync(snapshotPath, snapshotText);
  const snapshotChecksum = `sha256:${hash(snapshotText)}`;
  const report = { schema: 'atlas.treesitter-structural-observation.v1', generatedAt: new Date().toISOString(), mode: currentMode ? 'READ_ONLY_CURRENT_GRAPHIFY_COHORT' : 'READ_ONLY_AUDIT', postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, sidecar: { url: sidecarUrl, endpoint: '/ast/chunk', engine: 'treesitter-chunker' }, selectionChecksum: text(approval.selectionChecksum), sourceRevisionReport: currentMode ? 'docs/reports/current-graphify-source-revision-v1.json' : null, providerRevisionRule: currentMode ? 'SHA256_CONTENT_HASH' : 'SOURCE_BINDING_REVISION', workspaceRevision: text(observation.record?.workspaceRevision), sourceCount: refs.length, extractedCount: results.filter((row) => row.syntaxStatus !== 'UNSUPPORTED_LANGUAGE').length, unsupportedCount: results.filter((row) => row.syntaxStatus === 'UNSUPPORTED_LANGUAGE').length, astRowCount: snapshotRows.length, snapshotPath: '.tmp/atlas/current-source-ast-snapshot-v1.ndjson', snapshotChecksum, failures, results, canonicalAuthority: false, status: failures.length === 0 ? 'STRUCTURAL_OBSERVATIONS_PROVEN' : 'STRUCTURAL_OBSERVATIONS_INCOMPLETE', nextGate: 'AST_IDENTITY_ADAPTER_AND_LSP_RESOLUTION' };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, sourceCount: refs.length, extractedCount: report.extractedCount, unsupportedCount: report.unsupportedCount, failures: failures.length, chunks: results.reduce((sum, row) => sum + row.chunkCount, 0), edges: results.reduce((sum, row) => sum + row.edgeCount, 0), astRowCount: report.astRowCount, snapshotChecksum: report.snapshotChecksum, reportPath: 'docs/reports/treesitter-structural-observation-v1.json' }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
