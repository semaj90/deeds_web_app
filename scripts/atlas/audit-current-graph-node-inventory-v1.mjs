#!/usr/bin/env node

/**
 * Read-only GraphNodeInventoryV1 audit over the current derived structural plan.
 * This does not create graph revisions or write graph/registry/projection rows.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INPUT = resolve(ROOT, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const REPORT = resolve(ROOT, 'docs/reports/current-graph-node-inventory-v1.json');
const digest = (value) => `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());

const plan = JSON.parse(readFileSync(INPUT, 'utf8'));
const rawNodes = Array.isArray(plan.nodes) ? plan.nodes : [];
const nodes = rawNodes
  .map((node) => ({
    graphNodeKey: node.graphNodeKey ?? null,
    nodeKind: node.nodeKind ?? node.kind ?? null,
    packetKey: node.packetKey ?? null,
    symbolVersionId: node.symbolVersionId ?? null,
    chunkId: node.chunkId ?? null,
    sourceRef: node.sourceRef ?? null,
    sourceRevision: node.sourceRevision ?? null,
    workspaceRevision: node.workspaceRevision ?? plan.workspaceRevision ?? null,
    producerRevision: node.producerRevision ?? plan.producerRevision ?? null,
    upstreamNodeId: node.upstreamNodeId ?? node.treeNodeId ?? null,
    byteStart: Number.isInteger(node.byteStart) ? node.byteStart : null,
    byteEnd: Number.isInteger(node.byteEnd) ? node.byteEnd : null,
  }))
  .sort((a, b) => `${a.graphNodeKey ?? ''}\0${a.sourceRef ?? ''}`.localeCompare(`${b.graphNodeKey ?? ''}\0${b.sourceRef ?? ''}`));

const unique = (values) => [...new Set(values.filter((value) => value != null && value !== ''))].sort();
const nodeKeys = nodes.map((node) => node.graphNodeKey).filter(Boolean);
const duplicateNodeKeys = nodeKeys.filter((key, index) => nodeKeys.indexOf(key) !== index);
const missingRequired = nodes.filter((node) => !node.graphNodeKey || !node.sourceRef || !node.sourceRevision || !node.workspaceRevision || !node.producerRevision);
const sourceRefs = unique(nodes.map((node) => node.sourceRef));
const sourceRevisions = unique(nodes.map((node) => node.sourceRevision));
const workspaceRevisions = unique(nodes.map((node) => node.workspaceRevision));
const producerRevisions = unique(nodes.map((node) => node.producerRevision));
const nodeSetChecksum = digest(nodes.map((node) => stable(node)).join('\n'));
const sourceSetChecksum = digest(sourceRefs.join('\n'));
const report = {
  schema: 'atlas.graph-node-inventory.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_DERIVED_PLAN_AUDIT',
  readOnly: true,
  canonicalAuthority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphRevision: false },
  input: 'docs/reports/current-structural-edge-artifact-plan-v2.json',
  workspaceRevision: plan.workspaceRevision ?? null,
  sourceSetChecksum,
  sourceCount: sourceRefs.length,
  nodeCount: nodes.length,
  nodeSetChecksum,
  distinctSourceRevisions: sourceRevisions,
  distinctWorkspaceRevisions: workspaceRevisions,
  distinctProducerRevisions: producerRevisions,
  duplicateGraphNodeKeyCount: duplicateNodeKeys.length,
  missingRequiredFieldCount: missingRequired.length,
  requiredFields: ['graphNodeKey', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'producerRevision'],
  graphRevision: null,
  graphRevisionStatus: 'NOT_ASSIGNED_DERIVED_INVENTORY_ONLY',
  edgeAdmission: {
    allowed: false,
    reason: 'Node inventory completeness does not establish an authoritative edge producer or graph snapshot owner.',
  },
  nodes,
  missingRequired,
  status: duplicateNodeKeys.length || missingRequired.length ? 'GRAPH_NODE_INVENTORY_INCOMPLETE' : 'GRAPH_NODE_INVENTORY_COMPLETE_NON_AUTHORITATIVE',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  nodeCount: report.nodeCount,
  sourceCount: report.sourceCount,
  duplicateGraphNodeKeyCount: report.duplicateGraphNodeKeyCount,
  missingRequiredFieldCount: report.missingRequiredFieldCount,
  workspaceRevision: report.workspaceRevision,
  graphRevision: null,
  report: REPORT,
}, null, 2));
