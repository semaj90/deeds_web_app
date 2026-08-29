#!/usr/bin/env node

/**
 * Read-only plan for a current structural edge artifact.
 *
 * Only native sidecar edges marked resolved=true and resolvable to a current
 * packet/native chunk identity are admitted. Syntax-only or unresolved targets
 * remain diagnostic evidence and never become graph edges.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { deriveGraphNodeKeyV1 } from '../../packages/parent-atlas/dist/index.js';

const root = REPO_ROOT;
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.join(root, 'docs/reports/current-structural-edge-artifact-plan-v1.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

function languageFor(sourceRef) {
  if (/\.(tsx?|mts|cts)$/.test(sourceRef)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(sourceRef)) return 'javascript';
  if (/\.rs$/.test(sourceRef)) return 'rust';
  return null;
}

function nativeChunkKey(sourceRef, sourceRevision, chunk) {
  const startByte = Number(chunk.start_byte);
  const endByte = Number(chunk.end_byte);
  const upstreamNodeId = String(chunk.upstream_node_id ?? '').trim();
  if (!upstreamNodeId || !Number.isInteger(startByte) || !Number.isInteger(endByte) || endByte < startByte) return null;
  return deriveGraphNodeKeyV1({ sourceRef, sourceRevision, upstreamNodeId, byteStart: startByte, byteEnd: endByte });
}

function endpointResolver({ packetKey, fileId, chunks }) {
  const byNativeId = new Map();
  for (const chunk of chunks) {
    const graphNodeKey = nativeChunkKey(chunk.sourceRef, chunk.sourceRevision, chunk);
    if (!graphNodeKey) continue;
    for (const id of [chunk.upstream_node_id, chunk.upstream_chunk_id, chunk.upstream_symbol_id]) {
      if (id) byNativeId.set(String(id), graphNodeKey);
    }
  }
  const packetNodeKey = packetKey ? `packet:${packetKey}` : null;
  return (evidenceKey) => {
    if (!evidenceKey) return null;
    if (fileId && String(evidenceKey) === String(fileId)) return packetNodeKey;
    return byNativeId.get(String(evidenceKey)) ?? null;
  };
}

async function main() {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const candidates = (map.candidates ?? []).filter((row) => row.sourceRef && row.sourceRevision && row.workspaceRevision === map.workspaceRevision);
  const codeOnly = process.env.ATLAS_STRUCTURAL_CODE_ONLY !== '0';
  const selected = codeOnly ? candidates.filter((row) => languageFor(row.sourceRef)) : candidates;
  const edges = [];
  const nodes = new Map();
  const unresolved = [];
  const errors = [];

  for (const candidate of selected) {
    const language = languageFor(candidate.sourceRef);
    if (!language) continue;
    const sourcePath = path.join(root, candidate.sourceRef.replaceAll('/', path.sep));
    const source = fs.readFileSync(sourcePath, 'utf8');
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
    const chunks = (evidence.chunks ?? []).map((chunk) => ({ ...chunk, sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision }));
    if (candidate.packetKey) {
      const packetNodeKey = `packet:${candidate.packetKey}`;
      nodes.set(packetNodeKey, { graphNodeKey: packetNodeKey, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision, nodeKind: 'packet', startByte: null, endByte: null, canonicalAuthority: false });
    }
    for (const chunk of chunks) {
      const graphNodeKey = nativeChunkKey(candidate.sourceRef, candidate.sourceRevision, chunk);
      if (graphNodeKey) nodes.set(graphNodeKey, { graphNodeKey, packetKey: candidate.packetKey ?? null, sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision, nodeKind: chunk.node_type ?? chunk.kind ?? 'unknown', startByte: Number(chunk.start_byte), endByte: Number(chunk.end_byte), canonicalAuthority: false });
    }
    const resolveEndpoint = endpointResolver({ packetKey: candidate.packetKey, fileId: chunks[0]?.upstream_file_id, chunks });
    for (const edge of Array.isArray(evidence.edges) ? evidence.edges : []) {
      const fromNodeKey = resolveEndpoint(edge.from_evidence_key);
      const toNodeKey = resolveEndpoint(edge.to_evidence_key);
      if (edge.resolved !== true || !fromNodeKey || !toNodeKey) {
        unresolved.push({ sourceRef: candidate.sourceRef, type: edge.type ?? 'UNKNOWN', fromEvidenceKey: edge.from_evidence_key ?? null, toEvidenceKey: edge.to_evidence_key ?? null, resolved: edge.resolved === true, resolution: edge.resolution ?? null });
        continue;
      }
      edges.push({ sourceNodeKey: fromNodeKey, targetNodeKey: toNodeKey, edgeType: String(edge.type ?? 'UNKNOWN'), sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision, evidenceRefs: [`ast:${candidate.sourceRef}:${edge.from_evidence_key}:${edge.to_evidence_key}`], canonicalAuthority: false });
    }
  }

  const canonicalNodes = [...nodes.values()].sort((a, b) => a.graphNodeKey.localeCompare(b.graphNodeKey));
  const canonicalEdges = [...new Map(edges.map((edge) => [`${edge.sourceNodeKey}|${edge.targetNodeKey}|${edge.edgeType}|${edge.sourceRevision}`, edge])).values()].sort((a, b) => `${a.sourceNodeKey}|${a.edgeType}|${a.targetNodeKey}`.localeCompare(`${b.sourceNodeKey}|${b.edgeType}|${b.targetNodeKey}`));
  const body = {
    schema: 'atlas.current-structural-edge-artifact-plan.v1',
    mode: 'READ_ONLY_PLAN',
    candidateSnapshotRevision: map.candidateSnapshotRevision ?? null,
    ordinalMapChecksum: map.ordinalMapChecksum ?? null,
    workspaceRevision: map.workspaceRevision ?? null,
    sidecar: { url: sidecarUrl, endpoint: '/ast/chunk' },
    selectedSourceCount: selected.length,
    nodeCount: canonicalNodes.length,
    edgeCount: canonicalEdges.length,
    nodes: canonicalNodes,
    edges: canonicalEdges,
    unresolvedEdgeCount: unresolved.length,
    unresolvedEdges: unresolved,
    errors,
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphArtifacts: false },
    canonicalAuthority: false,
    status: errors.length === 0 && canonicalEdges.length > 0 ? 'CURRENT_STRUCTURAL_EDGE_PLAN_READY' : 'CURRENT_STRUCTURAL_EDGE_PLAN_INCOMPLETE',
    nextGate: canonicalEdges.length > 0 ? 'NON_PRODUCTION_GRAPH_ORDINAL_ARTIFACT_BUILD_AND_CPU_GPU_PARITY' : 'STRUCTURAL_EDGE_RESOLUTION_REQUIRED',
  };
  const report = { ...body, reportChecksum: `sha256:${sha256(JSON.stringify(body))}` };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, nodeCount: report.nodeCount, edgeCount: report.edgeCount, unresolvedEdgeCount: report.unresolvedEdgeCount, reportPath: path.relative(root, reportPath) }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
