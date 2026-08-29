#!/usr/bin/env node

/** Read-only plan for a revision-qualified structural projection. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { deriveGraphNodeKeyV1 } from '../../packages/parent-atlas/dist/index.js';

const root = REPO_ROOT;
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.join(root, 'docs/reports/structural-projection-plan-v1.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

function languageFor(sourceRef) {
  if (/\.(tsx?|mts|cts)$/.test(sourceRef)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(sourceRef)) return 'javascript';
  if (/\.rs$/.test(sourceRef)) return 'rust';
  return null;
}

async function main() {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const candidates = (map.candidates ?? []).filter((row) => row.sourceRef && row.sourceRevision && row.workspaceRevision === map.workspaceRevision);
  if (candidates.length === 0) throw new Error('STRUCTURAL_PROJECTION_PLAN_MAP_EMPTY');
  const codeOnly = process.env.ATLAS_STRUCTURAL_CODE_ONLY === '1';
  const selectedCandidates = codeOnly
    ? candidates.filter((row) => languageFor(row.sourceRef))
    : candidates;
  const rows = [];
  const errors = [];
  for (const candidate of selectedCandidates) {
    const source = fs.readFileSync(path.join(root, candidate.sourceRef.replaceAll('/', path.sep)), 'utf8');
    const language = languageFor(candidate.sourceRef);
    if (!language) {
      errors.push({ sourceRef: candidate.sourceRef, error: 'LANGUAGE_UNSUPPORTED' });
      continue;
    }
    const response = await fetch(`${sidecarUrl}/ast/chunk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, language, filePath: candidate.sourceRef, sourceRevision: candidate.sourceRevision }),
    });
    if (!response.ok) {
      errors.push({ sourceRef: candidate.sourceRef, error: `SIDECAR_HTTP_${response.status}` });
      continue;
    }
    const evidence = await response.json();
    for (const [index, chunk] of (Array.isArray(evidence.chunks) ? evidence.chunks : []).entries()) {
      const startByte = Number(chunk.start_byte ?? 0);
      const endByte = Math.max(Number(chunk.end_byte ?? startByte), startByte + 1);
      const nodeType = String(chunk.node_type ?? 'unknown');
      rows.push({
        projectionKey: `structural:${sha256(JSON.stringify([candidate.packetKey, candidate.sourceRef, candidate.sourceRevision, startByte, endByte, nodeType])).slice(0, 48)}`,
        candidateOrdinal: candidate.candidateOrdinal,
        packetKey: candidate.packetKey,
        sourceRef: candidate.sourceRef,
        sourceRevision: candidate.sourceRevision,
        workspaceRevision: candidate.workspaceRevision,
        byteStart: startByte,
        byteEnd: endByte,
        nodeKind: nodeType,
        observationOrdinal: index,
        upstreamNodeId: chunk.upstream_node_id ?? null,
        upstreamChunkId: chunk.upstream_chunk_id ?? null,
        graphNodeKey: chunk.upstream_node_id
          ? deriveGraphNodeKeyV1({
              sourceRef: candidate.sourceRef,
              sourceRevision: candidate.sourceRevision,
              upstreamNodeId: String(chunk.upstream_node_id),
              byteStart: startByte,
              byteEnd: endByte,
            })
          : null,
        calls: Array.isArray(chunk.calls) ? chunk.calls : [],
        imports: Array.isArray(chunk.imports) ? chunk.imports : [],
        exports: Array.isArray(chunk.exports) ? chunk.exports : [],
        extractorRevision: `${evidence.engine ?? 'unknown'}:${evidence.engine_version ?? 'unknown'}`,
        canonicalAuthority: false,
      });
    }
  }
  const sourceCount = selectedCandidates.length;
  const reportBase = {
    schema: 'atlas.structural-projection-plan-v1',
    mode: 'READ_ONLY_PLAN',
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    workspaceRevision: map.workspaceRevision,
    sidecar: { url: sidecarUrl, endpoint: '/ast/chunk' },
    selectedSourceCount: sourceCount,
    selectionMode: codeOnly ? 'CODE_ONLY' : 'FULL_COHORT',
    observedSourceCount: new Set(rows.map((row) => row.sourceRef)).size,
    observationCount: rows.length,
    proposedProjectionRows: rows.length,
    rows,
    errors,
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, rrf: false },
    canonicalAuthority: false,
    status: errors.length === 0 && rows.length > 0 ? 'STRUCTURAL_PROJECTION_PLAN_READY' : 'STRUCTURAL_PROJECTION_PLAN_INCOMPLETE',
    nextGate: 'EXPLICIT_NON_PRODUCTION_STRUCTURAL_PROJECTION_APPLY_AND_READBACK',
  };
  const report = { ...reportBase, reportChecksum: `sha256:${sha256(JSON.stringify(reportBase))}` };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, selectedSourceCount: sourceCount, observationCount: rows.length, errors: errors.length, reportPath: path.relative(root, reportPath) }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
