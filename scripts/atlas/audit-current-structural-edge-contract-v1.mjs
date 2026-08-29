#!/usr/bin/env node
/**
 * Read-only contract audit for the current structural edge artifact plan.
 * This classifies missing graph ownership/evidence fields without assigning a
 * graph revision or mutating Postgres, Neo4j, Qdrant, Valkey, or artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const inputPath = path.join(root, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const reportPath = path.join(root, 'docs/reports/current-structural-edge-contract-v1.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const asArray = (value) => Array.isArray(value) ? value : [];
const present = (value) => value !== null && value !== undefined && value !== '';

const plan = readJson(inputPath);
const nodes = asArray(plan.nodes);
const edges = asArray(plan.edges);

const nodeRequired = ['graphNodeKey', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'producerRevision'];
const edgeRequired = [
  'sourceNodeKey',
  'targetNodeKey',
  'edgeType',
  'sourceRef',
  'sourceRevision',
  'workspaceRevision',
  'producerRevision',
  'evidenceRefs',
  'evidenceChecksum',
  'edgeId',
];

const missingCounts = (rows, fields) => Object.fromEntries(fields.map((field) => [
  field,
  rows.filter((row) => !present(row?.[field]) || (field === 'evidenceRefs' && !Array.isArray(row.evidenceRefs))).length,
]));

const nodeKeys = new Set(nodes.map((node) => node.graphNodeKey).filter(present));
const unknownEndpoints = edges.filter((edge) => !nodeKeys.has(edge.sourceNodeKey) || !nodeKeys.has(edge.targetNodeKey));
const duplicateEdgeShapes = edges.length - new Set(edges.map((edge) => [
  edge.sourceNodeKey ?? '',
  edge.targetNodeKey ?? '',
  edge.edgeType ?? '',
  edge.sourceRevision ?? '',
].join('|'))).size;
const edgeInputChecksum = sha256(edges.map((edge) => JSON.stringify({
  sourceNodeKey: edge.sourceNodeKey ?? null,
  targetNodeKey: edge.targetNodeKey ?? null,
  edgeType: edge.edgeType ?? null,
  sourceRef: edge.sourceRef ?? null,
  sourceRevision: edge.sourceRevision ?? null,
  workspaceRevision: edge.workspaceRevision ?? null,
  evidenceRefs: edge.evidenceRefs ?? [],
})).sort().join('\n'));

const report = {
  schema: 'atlas.current-structural-edge-contract.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CONTRACT_AUDIT',
  canonicalAuthority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphRevision: false },
  input: path.relative(root, inputPath).replaceAll('\\', '/'),
  sourcePlanSelectionChecksum: plan.sourcePlanSelectionChecksum ?? null,
  workspaceRevision: plan.workspaceRevision ?? null,
  graphRevision: null,
  graphRevisionStatus: 'NOT_ASSIGNED',
  nodeCount: nodes.length,
  edgeCount: edges.length,
  nodeSetChecksum: plan.nodeSetChecksum ?? null,
  edgeInputChecksum: `sha256:${edgeInputChecksum}`,
  missingNodeFields: missingCounts(nodes, nodeRequired),
  missingEdgeFields: missingCounts(edges, edgeRequired),
  duplicateEdgeShapeCount: duplicateEdgeShapes,
  unknownEndpointCount: unknownEndpoints.length,
  contract: {
    requiredNodeFields: nodeRequired,
    requiredEdgeFields: edgeRequired,
    stableEdgeIdentity: 'edgeId must be derived from revision-bound endpoints/type/evidence',
    evidenceRule: 'evidenceRefs and evidenceChecksum must bind each edge to exact source evidence',
  },
  status: nodes.length > 0 && edges.length > 0 &&
    Object.values(missingCounts(nodes, nodeRequired)).every((count) => count === 0) &&
    Object.values(missingCounts(edges, edgeRequired)).every((count) => count === 0) &&
    duplicateEdgeShapes === 0 && unknownEndpoints.length === 0
    ? 'CONTRACT_READY_FOR_SNAPSHOT_REVIEW'
    : 'CONTRACT_INCOMPLETE',
  admission: {
    graphSnapshotAllowed: false,
    reason: 'This audit does not assign graphRevision; incomplete producer/evidence fields keep snapshot admission closed.',
  },
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  nodeCount: report.nodeCount,
  edgeCount: report.edgeCount,
  missingNodeFields: report.missingNodeFields,
  missingEdgeFields: report.missingEdgeFields,
  duplicateEdgeShapeCount: report.duplicateEdgeShapeCount,
  unknownEndpointCount: report.unknownEndpointCount,
  graphRevision: null,
  report: reportPath,
}, null, 2));
