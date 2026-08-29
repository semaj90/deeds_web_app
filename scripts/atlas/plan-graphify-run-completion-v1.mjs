#!/usr/bin/env node
/**
 * Read-only Graphify completion plan.
 *
 * Joins the current canonical run-owner audit with the current structural
 * artifact plan. It never changes graphify_runs, workspaces, or graph data.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const ownerPath = path.join(root, 'docs/reports/current-graphify-run-owner-v1.json');
const sourcePlanPath = path.join(root, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const structuralPath = path.join(root, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const resolutionPath = path.join(root, 'docs/reports/current-structural-edge-resolution-v1.json');
const outputPath = path.join(root, 'docs/reports/graphify-run-completion-plan-v1.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const owner = readJson(ownerPath);
const sourcePlan = readJson(sourcePlanPath);
const structural = readJson(structuralPath);
const resolution = fs.existsSync(resolutionPath) ? readJson(resolutionPath) : null;
const currentRun = owner.runs?.[0] ?? null;
const nodes = Array.isArray(structural.nodes) ? structural.nodes : [];
const edges = Array.isArray(structural.edges) ? structural.edges : [];

const nodeSetChecksum = digest(nodes.map((node) => ({
  graphNodeKey: node.graphNodeKey ?? null,
  sourceRef: node.sourceRef ?? null,
  sourceRevision: node.sourceRevision ?? null,
  workspaceRevision: node.workspaceRevision ?? null,
  producerRevision: node.producerRevision ?? null,
})).sort((a, b) => `${a.graphNodeKey}`.localeCompare(`${b.graphNodeKey}`)));
const edgeSetChecksum = digest(edges.map((edge) => ({
  edgeId: edge.edgeId ?? null,
  sourceNodeKey: edge.sourceNodeKey ?? null,
  targetNodeKey: edge.targetNodeKey ?? null,
  edgeType: edge.edgeType ?? null,
  sourceRevision: edge.sourceRevision ?? null,
  workspaceRevision: edge.workspaceRevision ?? null,
  producerRevision: edge.producerRevision ?? null,
  evidenceChecksum: edge.evidenceChecksum ?? null,
})).sort((a, b) => `${a.edgeId}|${a.sourceNodeKey}`.localeCompare(`${b.edgeId}|${b.sourceNodeKey}`)));

// A completion plan may consume the resolver receipt only when it covers the complete structural
// observation set. A bounded receipt must never accidentally clear the completion blocker.
const terminalResolutionStatuses = new Set([
  'RESOLVED_IN_REPO', 'RESOLVED_WORKSPACE_MODULE', 'EXTERNAL_MODULE', 'EXTERNAL_PACKAGE',
  'NODE_BUILTIN', 'EXTERNAL_RESOURCE', 'UNSUPPORTED_LANGUAGE', 'SOURCE_FILE_NOT_FOUND', 'SOURCE_MISSING',
]);
const resolutionCounts = resolution?.unresolvedTarget?.counts ?? {};
const resolutionComplete = Boolean(
  resolution && resolution.unresolvedTarget?.sampleIsPartial === false
    && resolution.inputWorkspaceRevision === structural.workspaceRevision,
);
const unresolvedTargetUnclassifiedCount = resolutionComplete
  ? Object.entries(resolutionCounts).reduce((total, [status, count]) => (
    terminalResolutionStatuses.has(status) ? total : total + Number(count || 0)
  ), 0)
  : null;
const syntaxUnclassifiedCount = resolutionComplete
  ? Object.entries(resolution.syntaxOnly?.counts ?? {}).reduce((total, [status, count]) => (
    terminalResolutionStatuses.has(status) ? total : total + Number(count || 0)
  ), 0)
  : null;

const checks = {
  ownerAuditAvailable: owner.status === 'GRAPHIFY_RUN_OWNER_BLOCKED' || owner.status === 'GRAPHIFY_RUN_OWNER_COMPLETE',
  runExists: Boolean(currentRun),
  runCompleted: Boolean(currentRun?.status === 'COMPLETED' && currentRun?.completed_at),
  workspaceOwnerPresent: Boolean(currentRun?.workspace_row_present),
  workspaceRevisionMatches: Boolean(currentRun?.workspace_revision && currentRun.workspace_revision === structural.workspaceRevision),
  sourceSelectionComplete: sourcePlan.status === 'CURRENT_GRAPHIFY_BATCH_PLAN_READY'
    && Number(sourcePlan.counts?.currentGraphifyExact ?? 0) === Number(sourcePlan.selectedSourceCount ?? 0)
    && Number(sourcePlan.counts?.missingGraphifySource ?? 0) === 0
    && Number(sourcePlan.counts?.missingWorkspaceObservation ?? 0) === 0
    && Number(sourcePlan.counts?.ambiguousGraphifySource ?? 0) === 0
    && Number(sourcePlan.counts?.graphifyRevisionOrContentMismatch ?? 0) === 0,
  structuralProcessingComplete: Number(structural.sourceCount ?? 0) + Number(structural.unsupportedSourceCount ?? 0)
    === Number(structural.selectedSourceCount ?? 0) && Number(structural.selectedSourceCount ?? 0) > 0,
  structuralPlanReady: structural.status === 'CURRENT_STRUCTURAL_EDGE_PLAN_READY',
  unresolvedEdgesZero: resolutionComplete
    ? unresolvedTargetUnclassifiedCount === 0 && syntaxUnclassifiedCount === 0
    : false,
  resolutionReceiptComplete: resolutionComplete,
  unresolvedTargetUnclassifiedCount,
  syntaxUnclassifiedCount,
  nodeChecksumAvailable: nodes.length > 0,
  edgeChecksumAvailable: edges.length > 0,
  producerRevisionPresent: nodes.every((node) => node.producerRevision) && edges.every((edge) => edge.producerRevision),
  edgeEvidenceComplete: edges.every((edge) => edge.edgeId && edge.evidenceChecksum && Array.isArray(edge.evidenceRefs)),
};

const blockers = [];
if (!checks.runCompleted) blockers.push('CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED');
if (!checks.workspaceOwnerPresent) blockers.push('WORKSPACE_OWNER_ROW_ABSENT');
if (!checks.workspaceRevisionMatches) blockers.push('WORKSPACE_REVISION_NOT_BOUND_TO_STRUCTURAL_PLAN');
if (!checks.sourceSelectionComplete) blockers.push('SOURCE_SELECTION_NOT_COMPLETE');
  if (!checks.structuralProcessingComplete) blockers.push('STRUCTURAL_SOURCE_PROCESSING_INCOMPLETE');
if (!checks.unresolvedEdgesZero) blockers.push(checks.resolutionReceiptComplete
  ? 'UNCLASSIFIED_STRUCTURAL_EDGE_OUTCOMES_PRESENT'
  : 'STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE');
if (!checks.nodeChecksumAvailable || !checks.edgeChecksumAvailable) blockers.push('GRAPH_CHECKSUM_INPUT_MISSING');

const plan = {
  schema: 'atlas.graphify-run-completion-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_COMPLETION_PLAN',
  canonicalAuthority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphRevision: false },
  inputs: {
    ownerAudit: path.relative(root, ownerPath).replaceAll('\\', '/'),
    structuralPlan: path.relative(root, structuralPath).replaceAll('\\', '/'),
    structuralResolution: path.relative(root, resolutionPath).replaceAll('\\', '/'),
  },
  currentRun: currentRun ? {
    runId: currentRun.run_id,
    workspaceId: currentRun.workspace_id,
    workspaceRevision: currentRun.workspace_revision,
    sourceManifestDigest: currentRun.source_manifest_digest,
    sourceManifestSourceCount: currentRun.source_manifest_source_count,
    status: currentRun.status,
    completedAt: currentRun.completed_at,
    workspaceRowPresent: currentRun.workspace_row_present,
  } : null,
  structuralArtifact: {
    workspaceRevision: structural.workspaceRevision ?? null,
    selectedSourceCount: structural.selectedSourceCount ?? 0,
    processedSourceCount: structural.sourceCount ?? 0,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    unresolvedEdgeCount: structural.unresolvedEdgeCount ?? 0,
    producerRevision: nodes[0]?.producerRevision ?? edges[0]?.producerRevision ?? null,
    unsupportedSourceCount: structural.unsupportedSourceCount ?? 0,
    unsupportedSourceRefs: structural.unsupportedSourceRefs ?? [],
    nodeSetChecksum,
    edgeSetChecksum,
    reportChecksum: structural.reportChecksum ?? null,
  },
  sourceSelection: {
    status: sourcePlan.status ?? null,
    selectedSourceCount: sourcePlan.selectedSourceCount ?? 0,
    counts: sourcePlan.counts ?? null,
    selectionChecksum: sourcePlan.selectionChecksum ?? null,
  },
  checks,
  blockers,
  completionReceipt: {
    schema: 'atlas.graphify-run-receipt.v1',
    allowed: blockers.length === 0,
    graphRevision: null,
    reason: blockers.length === 0 ? null : 'Completion receipt cannot be admitted until all blockers are cleared.',
  },
  status: blockers.length === 0 ? 'COMPLETION_PLAN_READY_FOR_EXPLICIT_APPLY' : 'COMPLETION_PLAN_BLOCKED',
};
plan.planChecksum = digest(plan);
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: plan.schema,
  status: plan.status,
  readOnly: true,
  blockers,
  graphRevision: null,
  planChecksum: plan.planChecksum,
  report: outputPath,
}, null, 2));
