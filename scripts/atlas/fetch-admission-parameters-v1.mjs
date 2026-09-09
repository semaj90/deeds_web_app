#!/usr/bin/env node

/**
 * Parent Atlas AdmissionParametersV1.
 *
 * Read-only receipt assembler. It consumes existing audit receipts rather than
 * becoming a second source, graph, vector, or projection authority.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/admission-parameters-v1.json');

const sources = {
  sourceOwner: 'docs/reports/current-source-owner-reconciliation-v1.json',
  graphAuthority: 'docs/reports/current-graphify-snapshot-authority-v1.json',
  semanticManifest: 'docs/reports/current-semantic768-corpus-manifest-plan-v1.json',
  qdrantProvenance: 'docs/reports/qdrant-768-provenance-census.json',
  leidenCanary: 'docs/reports/lineage-qdrant-semantic-canary-v1.json',
};

function readJson(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  try {
    return { path: relativePath, present: true, value: JSON.parse(fs.readFileSync(absolutePath, 'utf8')) };
  } catch (error) {
    return { path: relativePath, present: false, value: null, error: error.code ?? error.message };
  }
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function first(value, fallback = null) {
  return value === undefined ? fallback : value;
}

const receipts = Object.fromEntries(Object.entries(sources).map(([key, relativePath]) => [key, readJson(relativePath)]));
const source = receipts.sourceOwner.value ?? {};
const graph = receipts.graphAuthority.value ?? {};
const semantic = receipts.semanticManifest.value ?? {};
const qdrant = receipts.qdrantProvenance.value ?? {};
const leiden = receipts.leidenCanary.value ?? {};

const sourceAuthority = source.admission?.status === 'CURRENT_SOURCE_AUTHORITY_PROVEN'
  || source.sourceAuthority?.status === 'CURRENT_SNAPSHOT_PROVEN';
const graphAuthority = graph.status === 'CURRENT_SNAPSHOT_PROVEN';
const semanticConfigured = semantic.embeddingDimension === 768
  && semantic.qdrantCollectionRoles?.configuredCanonical === 'codebase_chunks_768_v2';
const semanticCurrent = semantic.canonicalAuthority === true && semantic.importAllowed === true;
const qdrantV2 = (qdrant.collections ?? []).find((item) => item.collection === 'codebase_chunks_768_v2');
const contentVector = Array.isArray(qdrantV2?.vectors)
  ? qdrantV2.vectors.find((vector) => vector.vector_name === 'content')
  : qdrantV2?.vectors?.content;
const qdrantContract = contentVector?.size === 768;
const qdrantLineage = leiden.status === 'CANARY_QDRANT_IDENTITY_PROVEN';

const blockers = [];
if (!sourceAuthority) blockers.push('CURRENT_SOURCE_AUTHORITY_NOT_PROVEN');
if (!graphAuthority) blockers.push('CURRENT_GRAPH_SNAPSHOT_NOT_PROVEN');
if (!semanticConfigured) blockers.push('SEMANTIC_768_CONFIGURATION_NOT_PROVEN');
if (!semanticCurrent) blockers.push('SEMANTIC_768_CURRENT_MANIFEST_NOT_ADMITTED');
if (!qdrantContract) blockers.push('QDRANT_V2_768_CONTENT_CONTRACT_NOT_PROVEN');
if (!qdrantLineage) blockers.push('QDRANT_V2_IDENTITY_LINEAGE_NOT_PROVEN');
if (semantic.judgmentSetHash === 'pending' || !semantic.judgmentSetHash) blockers.push('JUDGMENT_SET_NOT_REVIEWED');

const parameters = {
  schema: 'atlas.admission-parameters.v1',
  status: blockers.length === 0 ? 'PARAMETERS_COMPLETE' : 'PARAMETERS_BLOCKED',
  canonicalAuthority: false,
  workspace: {
    workspaceId: first(source.workspace?.workspaceId, first(source.currentExecutionCandidates?.[0]?.workspace_id)),
    workspaceRevision: first(
      graph.sourceSnapshot?.workspaceRevision,
      first(source.sourceAuthority?.sourceSnapshot?.workspaceRevision,
        first(source.currentExecutionCandidates?.[0]?.workspace_revision)),
    ),
    sourceSelectionExecutionId: first(
      source.sourceAuthority?.executionId,
      first(source.currentExecutionCandidates?.[0]?.execution_id),
    ),
    sourceCount: first(source.workspace?.sourceCount, source.sourceCount),
    sourceAuthorityStatus: first(source.admission?.status, source.status),
  },
  graph: {
    graphRevision: first(graph.graphRevision, graph.projectionRevision),
    projectionName: first(graph.projectionName, graph.graphName),
    nodeCount: first(graph.nodeCount, null),
    edgeCount: first(graph.edgeCount, null),
    authorityStatus: graph.status ?? null,
  },
  semantic: {
    representationId: 'semantic_768',
    dimension: semantic.embeddingDimension ?? null,
    embeddingModel: semantic.embeddingModel ?? null,
    representationRevision: semantic.embeddingModelVersion ?? null,
    canonicalCollection: semantic.qdrantCollectionRoles?.configuredCanonical ?? null,
    sourceCollection: semantic.qdrantCollectionRoles?.configuredSourceLane ?? null,
    corpusVersion: semantic.corpusVersion ?? null,
    sourceCohortChecksum: semantic.querySetHash ?? null,
    judgmentSetHash: semantic.judgmentSetHash ?? null,
    currentManifestAdmitted: semanticCurrent,
  },
  qdrant: {
    canonicalCollection: 'codebase_chunks_768_v2',
    sourceCollection: 'codebase_chunks_768',
    vectorName: 'content',
    dimension: contentVector?.size ?? null,
    distance: contentVector?.distance ?? null,
    pointCount: qdrantV2?.point_count ?? qdrantV2?.points_count ?? null,
    provenanceStatus: qdrant.payload_cohorts?.find((item) => item.collection === 'codebase_chunks_768_v2')?.status ?? null,
    lineageStatus: leiden.status ?? null,
  },
  leiden: {
    status: leiden.status ?? null,
    candidateCount: leiden.candidateCount ?? null,
    exactMatches: leiden.exactMatches ?? null,
    mismatches: leiden.mismatches?.length ?? null,
    missing: leiden.missingPacketKeys?.length ?? null,
    duplicateMatches: leiden.duplicatePacketKeys?.length ?? null,
  },
  blockers,
  sourceReceipts: Object.fromEntries(Object.entries(receipts).map(([key, receipt]) => [key, {
    path: receipt.path,
    present: receipt.present,
    checksum: receipt.present ? digest(JSON.stringify(receipt.value)) : null,
  }])),
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(parameters, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: parameters.status,
  blockers: parameters.blockers,
  workspaceRevision: parameters.workspace.workspaceRevision,
  canonicalCollection: parameters.qdrant.canonicalCollection,
  writesPerformed: false,
  reportPath,
}, null, 2));
