#!/usr/bin/env node

/**
 * Read-only current-source structural edge plan.
 *
 * Consumes the current Graphify source batch, not the historical 15-candidate
 * packet map. Native sidecar edges remain non-authoritative until both
 * endpoints and the source/workspace revisions are explicit.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { deriveGraphNodeKeyV1 } from '../../packages/parent-atlas/dist/index.js';

const root = REPO_ROOT;
const sourcePlanPath = path.resolve(process.env.ATLAS_SOURCE_GRAPHIFY_PLAN ?? path.join(root, 'docs/reports/current-source-graphify-batch-plan-v1.json'));
const reportPath = path.join(root, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const PRODUCER_REVISION = 'atlas.structural-edge-planner.v2';

function deriveEdgeIdentity({ sourceNodeKey, targetNodeKey, edgeType, sourceRef, sourceRevision, workspaceRevision, evidenceRefs }) {
  const evidenceChecksum = `sha256:${sha256(JSON.stringify({ sourceRef, sourceRevision, workspaceRevision, evidenceRefs }))}`;
  const edgeId = `edge:${sha256(JSON.stringify({ sourceNodeKey, targetNodeKey, edgeType, sourceRevision, evidenceChecksum }))}`;
  return { edgeId, evidenceChecksum };
}

function languageFor(sourceRef) {
  if (/\.(tsx?|mts|cts)$/.test(sourceRef)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(sourceRef)) return 'javascript';
  if (/\.rs$/.test(sourceRef)) return 'rust';
  return null;
}

function graphNodeKey(sourceRef, sourceRevision, chunk) {
  const startByte = Number(chunk.start_byte);
  const endByte = Number(chunk.end_byte);
  const upstreamNodeId = String(chunk.upstream_node_id ?? '').trim();
  if (!upstreamNodeId || !Number.isInteger(startByte) || !Number.isInteger(endByte) || endByte < startByte) return null;
  return deriveGraphNodeKeyV1({ sourceRef, sourceRevision, upstreamNodeId, byteStart: startByte, byteEnd: endByte });
}

function fileGraphNodeKey(sourceRef, sourceRevision, upstreamFileId, byteLength) {
  const id = String(upstreamFileId ?? '').trim();
  if (!id) return null;
  return deriveGraphNodeKeyV1({ sourceRef, sourceRevision, upstreamNodeId: id, byteStart: 0, byteEnd: Math.max(1, Number(byteLength) || 1) });
}

async function main() {
  const sourcePlan = JSON.parse(fs.readFileSync(sourcePlanPath, 'utf8'));
  const records = Array.isArray(sourcePlan.records) ? sourcePlan.records : [];
  const selected = records.filter((row) => row.classification === 'CURRENT_GRAPHIFY_EXACT' && row.sourceRef && row.sourceRevision && row.workspaceRevision);
  const nodes = new Map();
  const edges = [];
  const unresolved = [];
  const errors = [];
  const unsupportedSourceRefs = [];
  let sourceCount = 0;
  let chunkCount = 0;

  for (const source of selected) {
    const language = languageFor(source.sourceRef);
    if (!language) {
      unsupportedSourceRefs.push({ sourceRef: source.sourceRef, reason: 'STRUCTURAL_LANGUAGE_ADAPTER_NOT_CONFIGURED' });
      continue;
    }
    const sourcePath = path.join(root, source.sourceRef.replaceAll('/', path.sep));
    if (!fs.existsSync(sourcePath)) {
      errors.push({ sourceRef: source.sourceRef, error: 'SOURCE_FILE_NOT_FOUND' });
      continue;
    }
    sourceCount += 1;
    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    let response;
    try {
      response = await fetch(`${sidecarUrl}/ast/chunk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: sourceText, language, filePath: source.sourceRef, sourceRevision: source.sourceRevision }),
      });
    } catch (error) {
      errors.push({ sourceRef: source.sourceRef, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!response.ok) {
      errors.push({ sourceRef: source.sourceRef, error: `SIDECAR_HTTP_${response.status}` });
      continue;
    }
    const evidence = await response.json();
    const chunks = (evidence.chunks ?? []).map((chunk) => ({ ...chunk, sourceRef: source.sourceRef, sourceRevision: source.sourceRevision }));
    chunkCount += chunks.length;
    const byNativeId = new Map();
    const upstreamFileId = chunks.map((chunk) => chunk.upstream_file_id).find(Boolean);
    const fileKey = fileGraphNodeKey(source.sourceRef, source.sourceRevision, upstreamFileId, source.byteLength || Buffer.byteLength(sourceText, 'utf8'));
    if (fileKey) {
      nodes.set(fileKey, { graphNodeKey: fileKey, sourceRef: source.sourceRef, sourceRevision: source.sourceRevision, workspaceRevision: source.workspaceRevision, producerRevision: PRODUCER_REVISION, nodeKind: 'file', startByte: 0, endByte: Math.max(1, Number(source.byteLength) || Buffer.byteLength(sourceText, 'utf8')), upstreamFileId: String(upstreamFileId), canonicalAuthority: false });
      byNativeId.set(String(upstreamFileId), fileKey);
    }
    for (const chunk of chunks) {
      const key = graphNodeKey(source.sourceRef, source.sourceRevision, chunk);
      if (!key) continue;
      nodes.set(key, { graphNodeKey: key, sourceRef: source.sourceRef, sourceRevision: source.sourceRevision, workspaceRevision: source.workspaceRevision, producerRevision: PRODUCER_REVISION, nodeKind: chunk.node_type ?? chunk.kind ?? 'unknown', startByte: Number(chunk.start_byte), endByte: Number(chunk.end_byte), upstreamNodeId: String(chunk.upstream_node_id), canonicalAuthority: false });
      for (const id of [chunk.upstream_node_id, chunk.upstream_chunk_id, chunk.upstream_symbol_id]) if (id) byNativeId.set(String(id), key);
    }
    for (const edge of Array.isArray(evidence.edges) ? evidence.edges : []) {
      const fromNodeKey = byNativeId.get(String(edge.from_evidence_key ?? '')) ?? null;
      const toNodeKey = byNativeId.get(String(edge.to_evidence_key ?? '')) ?? null;
      if (edge.resolved !== true || !fromNodeKey || !toNodeKey) {
        // evidence_start_line/column are 1-indexed (sidecar convention, verified against real
        // source 2026-08-29); CSGR-2's resolver converts to 0-indexed LSP position at call time —
        // kept 1-indexed here so this report matches the sidecar's own raw contract, not a
        // downstream consumer's.
        const occurrencePositions = Array.isArray(edge.occurrence_positions)
          ? edge.occurrence_positions
          : Array.isArray(edge.occurrencePositions)
            ? edge.occurrencePositions
            : [];
        unresolved.push({
          sourceRef: source.sourceRef, sourceRevision: source.sourceRevision, type: edge.type ?? 'UNKNOWN',
          fromEvidenceKey: edge.from_evidence_key ?? null, toEvidenceKey: edge.to_evidence_key ?? null,
          resolved: edge.resolved === true, resolution: edge.resolution ?? null,
          evidenceStartLine: edge.evidence_start_line ?? null, evidenceStartColumn: edge.evidence_start_column ?? null,
          evidenceEndLine: edge.evidence_end_line ?? null, evidenceEndColumn: edge.evidence_end_column ?? null,
          occurrencePositions,
          positionSource: occurrencePositions.length > 0 ? 'PER_OCCURRENCE' : 'LEGACY_EDGE_POSITION',
        });
        continue;
      }
      const evidenceRefs = [`ast:${source.sourceRef}:${edge.from_evidence_key}:${edge.to_evidence_key}`];
      const identity = deriveEdgeIdentity({
        sourceNodeKey: fromNodeKey,
        targetNodeKey: toNodeKey,
        edgeType: String(edge.type ?? 'UNKNOWN'),
        sourceRef: source.sourceRef,
        sourceRevision: source.sourceRevision,
        workspaceRevision: source.workspaceRevision,
        evidenceRefs,
      });
      edges.push({ sourceNodeKey: fromNodeKey, targetNodeKey: toNodeKey, edgeType: String(edge.type ?? 'UNKNOWN'), sourceRef: source.sourceRef, sourceRevision: source.sourceRevision, workspaceRevision: source.workspaceRevision, producerRevision: PRODUCER_REVISION, evidenceRefs, evidenceChecksum: identity.evidenceChecksum, edgeId: identity.edgeId, canonicalAuthority: false });
    }
  }

  const canonicalNodes = [...nodes.values()].sort((a, b) => a.graphNodeKey.localeCompare(b.graphNodeKey));
  const canonicalEdges = [...new Map(edges.map((edge) => [`${edge.sourceNodeKey}|${edge.targetNodeKey}|${edge.edgeType}|${edge.sourceRevision}`, edge])).values()].sort((a, b) => `${a.sourceNodeKey}|${a.edgeType}|${a.targetNodeKey}`.localeCompare(`${b.sourceNodeKey}|${b.edgeType}|${b.targetNodeKey}`));
  const body = {
    schema: 'atlas.current-structural-edge-artifact-plan.v2',
    mode: 'READ_ONLY_PLAN',
    sourcePlan: path.relative(root, sourcePlanPath),
    sourcePlanSelectionChecksum: sourcePlan.selectionChecksum ?? null,
    workspaceRevision: sourcePlan.workspaceRevision ?? null,
    sidecar: { url: sidecarUrl, endpoint: '/ast/chunk' },
    selectedSourceCount: selected.length,
    sourceCount,
    chunkCount,
    nodeCount: canonicalNodes.length,
    edgeCount: canonicalEdges.length,
    unresolvedEdgeCount: unresolved.length,
    occurrencePositionedUnresolvedEdgeCount: unresolved.filter((edge) => edge.positionSource === 'PER_OCCURRENCE').length,
    legacyOnlyUnresolvedEdgeCount: unresolved.filter((edge) => edge.positionSource === 'LEGACY_EDGE_POSITION').length,
    nodes: canonicalNodes,
    edges: canonicalEdges,
    unresolvedEdges: unresolved,
    unsupportedSourceRefs,
    unsupportedSourceCount: unsupportedSourceRefs.length,
    errors,
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphArtifacts: false },
    canonicalAuthority: false,
    status: errors.length === 0 && canonicalEdges.length > 0 ? 'CURRENT_STRUCTURAL_EDGE_PLAN_READY' : 'CURRENT_STRUCTURAL_EDGE_PLAN_INCOMPLETE',
    nextGate: canonicalEdges.length > 0 ? 'NON_PRODUCTION_CURRENT_GRAPH_ARTIFACT_BUILD_AND_CPU_GPU_PARITY' : 'CURRENT_STRUCTURAL_EDGE_PRODUCER_OR_RESOLUTION_REQUIRED',
  };
  const report = { ...body, reportChecksum: `sha256:${sha256(JSON.stringify(body))}` };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, selectedSourceCount: report.selectedSourceCount, sourceCount: report.sourceCount, chunkCount: report.chunkCount, nodeCount: report.nodeCount, edgeCount: report.edgeCount, unresolvedEdgeCount: report.unresolvedEdgeCount, reportPath: path.relative(root, reportPath) }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
