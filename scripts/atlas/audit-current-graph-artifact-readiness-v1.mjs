#!/usr/bin/env node

/**
 * Read-only audit for the bounded current-workspace graph artifact gate.
 *
 * Structural projection rows are observations. They do not become graph edges
 * unless an explicit, revision-qualified edge producer supplies both endpoints.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const projectionPath = resolve(root, 'docs/reports/structural-projection-plan-v1.json');
const relationshipPath = resolve(root, 'docs/reports/current-feature-ontology-graph-revision-v1.json');
const reportPath = resolve(root, 'docs/reports/current-graph-artifact-readiness-v1.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const projection = readJson(projectionPath);
const relationship = readJson(relationshipPath);
const rows = Array.isArray(projection.rows) ? projection.rows : [];
const nodeKeys = [...new Set(rows.map((row) => row.graphNodeKey).filter(Boolean))].sort();
const packetKeys = [...new Set(rows.map((row) => row.packetKey).filter(Boolean))].sort();
const sourceRefs = [...new Set(rows.map((row) => row.sourceRef).filter(Boolean))].sort();

const explicitEdgeFields = ['edges', 'relations', 'targets', 'targetGraphNodeKey', 'calleeGraphNodeKey']
  .filter((field) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, field)));

const workspaceRevision = projection.workspaceRevision ?? null;
const relationshipWorkspaceRevision = relationship.workspaceRevision ?? null;
const workspaceRevisionMatch = workspaceRevision !== null && workspaceRevision === relationshipWorkspaceRevision;

const observationDigest = sha256(rows.map((row) => [
  row.packetKey ?? '',
  row.sourceRef ?? '',
  row.sourceRevision ?? '',
  row.workspaceRevision ?? '',
  row.byteStart ?? '',
  row.byteEnd ?? '',
  row.graphNodeKey ?? '',
].join('|')).join('\n'));

const report = {
  schema: 'atlas.current-graph-artifact-readiness.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_AUDIT',
  inputProjection: {
    path: 'docs/reports/structural-projection-plan-v1.json',
    schema: projection.schema ?? null,
    status: projection.status ?? null,
    candidateSnapshotRevision: projection.candidateSnapshotRevision ?? null,
    ordinalMapChecksum: projection.ordinalMapChecksum ?? null,
    workspaceRevision,
    selectedSourceCount: projection.selectedSourceCount ?? null,
    observedSourceCount: projection.observedSourceCount ?? sourceRefs.length,
    observationCount: rows.length,
    uniqueGraphNodeKeyCount: nodeKeys.length,
    uniquePacketKeyCount: packetKeys.length,
    observationDigest: `sha256:${observationDigest}`,
  },
  currentRelationshipRevision: {
    path: 'docs/reports/current-feature-ontology-graph-revision-v1.json',
    status: relationship.status ?? null,
    workspaceRevision: relationshipWorkspaceRevision,
    relationshipGraphRevision: relationship.relationshipGraphRevision ?? null,
    kernelCount: relationship.kernelCount ?? null,
    workspaceRevisionMatch,
    reviewOnly: relationship.mode === 'READ_ONLY_DRY_RUN_DERIVATION',
  },
  edgeEvidence: {
    explicitEdgeFields,
    explicitRevisionQualifiedEdges: 0,
    structuralObservationCallsPresent: rows.filter((row) => Array.isArray(row.calls) && row.calls.length > 0).length,
    structuralObservationImportsPresent: rows.filter((row) => Array.isArray(row.imports) && row.imports.length > 0).length,
    structuralObservationExportsPresent: rows.filter((row) => Array.isArray(row.exports) && row.exports.length > 0).length,
    callsImportsExportsAreNotEdges: true,
  },
  gate: {
    currentObservationPlan: rows.length > 0 ? 'PROVEN_BOUNDED' : 'NOT_PROVEN',
    currentNodeIdentityObservation: nodeKeys.length > 0 ? 'PROVEN_BOUNDED' : 'NOT_PROVEN',
    currentRevisionQualifiedEdgeArtifact: 'NOT_PROVEN',
    graphOrdinalMap: 'NOT_PROVEN_FOR_CURRENT_ARTIFACT',
    cpuGpuParity: 'PROVEN_FIXTURE_ONLY',
    historicalGraphReuseAllowed: false,
  },
  status: 'CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_EDGE_PRODUCER',
  nextGate: 'CURRENT_REVISION_QUALIFIED_EDGE_MATERIALIZATION_READ_ONLY_PLAN',
  writes: {
    postgres: false,
    qdrant: false,
    neo4j: false,
    valkey: false,
    graphArtifacts: false,
  },
  canonicalAuthority: false,
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  observationCount: rows.length,
  uniqueGraphNodeKeyCount: nodeKeys.length,
  explicitRevisionQualifiedEdges: report.edgeEvidence.explicitRevisionQualifiedEdges,
  reportPath: 'docs/reports/current-graph-artifact-readiness-v1.json',
}, null, 2));
