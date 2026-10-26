#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshotBoundProposalGraphV1 } from './lib/snapshot-bound-proposal-graph-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const separator = arg.indexOf('=');
  return separator > 0 ? [arg.slice(0, separator), arg.slice(separator + 1)] : [arg, true];
}));
const planArg = args.get('--plan');
const outputArg = args.get('--output');
const toolArtifactArg = args.get('--tool-artifact');
const dbArtifactArg = args.get('--db-artifact');
const qdrantArtifactArg = args.get('--qdrant-artifact');
const symbolCensusArg = args.get('--symbol-census');
const baseGraphArg = args.get('--base-graph');
const sourceBindingReceiptArg = args.get('--source-binding-receipt');
if (typeof planArg !== 'string' || typeof outputArg !== 'string') {
  throw new Error('USAGE: node scripts/atlas/compose-snapshot-bound-proposal-graph-v1.mjs --plan=.tmp/atlas/<plan.json> --output=.tmp/atlas/<graph.json> [--db-artifact=.tmp/atlas/<db.ndjson>] [--qdrant-artifact=.tmp/atlas/<qdrant.ndjson>] [--tool-artifact=.tmp/atlas/<tool.ndjson>] [--symbol-census=.tmp/atlas/<census.json> --base-graph=.tmp/atlas/<graph.json> --source-binding-receipt=.tmp/atlas/<receipt.json>]');
}

const planPath = path.resolve(root, planArg);
const allowedRoot = path.resolve(root, '.tmp/atlas') + path.sep;
if (!planPath.startsWith(allowedRoot)) throw new Error('CALLS_PLAN_OUTSIDE_TMP_ATLAS');
const planBytes = readFileSync(planPath);
const plan = JSON.parse(planBytes.toString('utf8'));
if (plan.schema !== 'atlas.calls-edge-population-dryrun-plan.v1'
  || plan.canonicalAuthority !== false
  || plan.dbWritesPerformed !== false
  || plan.projectionWritesPerformed !== false) throw new Error('CALLS_PLAN_NOT_PROPOSAL_ONLY');
const artifactPath = path.resolve(root, plan.proposalArtifact?.path ?? '');
const artifactBytes = readFileSync(artifactPath);
const artifactDigest = `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`;
if (artifactDigest !== plan.proposalArtifact.sha256) throw new Error('CALLS_ARTIFACT_DIGEST_MISMATCH');
if (artifactBytes.byteLength !== plan.proposalArtifact.byteLength) throw new Error('CALLS_ARTIFACT_LENGTH_MISMATCH');
const proposals = artifactBytes.toString('utf8').trimEnd().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (proposals.length !== plan.proposalArtifact.proposalCount) throw new Error('CALLS_ARTIFACT_COUNT_MISMATCH');
const inputArtifacts = [{
  kind: 'CALLS_PLAN',
  path: path.relative(root, planPath).replace(/\\/g, '/'),
  sha256: `sha256:${createHash('sha256').update(planBytes).digest('hex')}`,
  byteLength: planBytes.byteLength,
  targetWorkspaceRevision: plan.targetWorkspaceRevision,
  proposalArtifactSha256: plan.proposalArtifact.sha256,
}, {
  kind: 'CALLS',
  path: path.relative(root, artifactPath).replace(/\\/g, '/'),
  sha256: artifactDigest,
  byteLength: artifactBytes.byteLength,
  proposalCount: proposals.length,
}];

for (const [kind, artifactArg] of [['DB', dbArtifactArg], ['QDRANT', qdrantArtifactArg], ['TOOL', toolArtifactArg]]) {
  if (typeof artifactArg !== 'string') continue;
  const extraArtifactPath = path.resolve(root, artifactArg);
  const allowedRoot = path.resolve(root, '.tmp/atlas') + path.sep;
  if (!extraArtifactPath.startsWith(allowedRoot)) throw new Error(`${kind}_ARTIFACT_OUTSIDE_TMP_ATLAS`);
  const extraBytes = readFileSync(extraArtifactPath);
  const extraDigest = `sha256:${createHash('sha256').update(extraBytes).digest('hex')}`;
  const extraRows = extraBytes.toString('utf8').trimEnd().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (extraRows.length === 0 || extraRows.some((row) => row?.proposal?.schema !== 'atlas.graph-edge-proposal.v1')) {
    throw new Error(`${kind}_ARTIFACT_PROPOSAL_SCHEMA_INVALID`);
  }
  if (extraRows.some((row) => row.source_file && row.source_file.replace(/\\/g, '/') !== row.proposal.source_locator)) {
    throw new Error(`${kind}_ARTIFACT_SOURCE_REF_MISMATCH`);
  }
  proposals.push(...extraRows.map((row) => row.proposal));
  inputArtifacts.push({
    kind,
    path: path.relative(root, extraArtifactPath).replace(/\\/g, '/'),
    sha256: extraDigest,
    byteLength: extraBytes.byteLength,
    proposalCount: extraRows.length,
  });
}

let symbolCandidatesByTarget = {};
if (typeof symbolCensusArg === 'string' || typeof baseGraphArg === 'string') {
  if (typeof symbolCensusArg !== 'string' || typeof baseGraphArg !== 'string' || typeof sourceBindingReceiptArg !== 'string') {
    throw new Error('SYMBOL_CENSUS_BASE_GRAPH_AND_SOURCE_BINDING_RECEIPT_REQUIRED');
  }
  const symbolCensusPath = path.resolve(root, symbolCensusArg);
  const baseGraphPath = path.resolve(root, baseGraphArg);
  if (!symbolCensusPath.startsWith(allowedRoot) || !baseGraphPath.startsWith(allowedRoot)) throw new Error('SYMBOL_CENSUS_INPUT_OUTSIDE_TMP_ATLAS');
  const censusBytes = readFileSync(symbolCensusPath);
  const census = JSON.parse(censusBytes.toString('utf8'));
  const baseGraphBytes = readFileSync(baseGraphPath);
  const baseGraph = JSON.parse(baseGraphBytes.toString('utf8'));
  const { receiptSha256, ...censusBody } = census;
  const expectedCensusReceipt = `sha256:${createHash('sha256').update(JSON.stringify(censusBody)).digest('hex')}`;
  if (census.schema !== 'atlas.calls-target-symbol-census.v1'
    || census.canonicalAuthority !== false
    || census.writesPerformed !== false
    || receiptSha256 !== expectedCensusReceipt
    || census.workspaceRevision !== plan.targetWorkspaceRevision
    || census.graphDigest !== baseGraph.receipt?.graphDigest
    || baseGraph.workspaceRevision !== plan.targetWorkspaceRevision) throw new Error('SYMBOL_CENSUS_LINEAGE_MISMATCH');
  for (const match of census.matches ?? []) {
    const target = match.targetText;
    if (typeof target !== 'string' || typeof match.stableSymbolId !== 'string') throw new Error('SYMBOL_CENSUS_MATCH_INVALID');
    const current = symbolCandidatesByTarget[target] ?? [];
    const existing = current.find((candidate) => candidate.stableSymbolId === match.stableSymbolId);
    if (existing) {
      if (!existing.matchBases.includes(match.matchBasis)) existing.matchBases.push(match.matchBasis);
      existing.workspaceVersionCount = Math.max(existing.workspaceVersionCount, Number(match.workspaceVersionCount) || 0);
    } else {
      current.push({
        stableSymbolId: match.stableSymbolId,
        canonicalName: match.canonicalName,
        canonicalQualifiedName: match.canonicalQualifiedName,
        matchBases: [match.matchBasis],
        workspaceVersionCount: Number(match.workspaceVersionCount) || 0,
      });
    }
    symbolCandidatesByTarget[target] = current;
  }
  for (const candidates of Object.values(symbolCandidatesByTarget)) {
    candidates.sort((left, right) => left.stableSymbolId.localeCompare(right.stableSymbolId));
    for (const candidate of candidates) candidate.matchBases.sort();
  }
  inputArtifacts.push({
    kind: 'SYMBOL_CANDIDATE_CENSUS',
    path: path.relative(root, symbolCensusPath).replace(/\\/g, '/'),
    sha256: `sha256:${createHash('sha256').update(censusBytes).digest('hex')}`,
    byteLength: censusBytes.byteLength,
    targetCount: census.targetCount,
    candidateSymbolPairCount: census.candidateSymbolPairCount,
    revisionQualifiedPairCount: census.revisionQualifiedPairCount,
  });
  inputArtifacts.push({
    kind: 'SYMBOL_CANDIDATE_BASE_GRAPH',
    path: path.relative(root, baseGraphPath).replace(/\\/g, '/'),
    sha256: `sha256:${createHash('sha256').update(baseGraphBytes).digest('hex')}`,
    byteLength: baseGraphBytes.byteLength,
    graphDigest: baseGraph.receipt.graphDigest,
  });

  const sourceBindingReceiptPath = path.resolve(root, sourceBindingReceiptArg);
  if (!sourceBindingReceiptPath.startsWith(allowedRoot)) throw new Error('SOURCE_BINDING_RECEIPT_OUTSIDE_TMP_ATLAS');
  const sourceBindingReceiptBytes = readFileSync(sourceBindingReceiptPath);
  const sourceBindingReceipt = JSON.parse(sourceBindingReceiptBytes.toString('utf8'));
  if (sourceBindingReceipt.schema !== 'atlas.workspace-source-binding-root-24253-receipt.v1'
    || sourceBindingReceipt.status !== 'COMMITTED_AND_READBACK_VERIFIED'
    || sourceBindingReceipt.workspaceRevision !== plan.targetWorkspaceRevision
    || sourceBindingReceipt.expectedRows !== sourceBindingReceipt.committedRows
    || sourceBindingReceipt.missingRows !== 0
    || sourceBindingReceipt.checksumMismatches !== 0) throw new Error('SOURCE_BINDING_RECEIPT_NOT_QUALIFIED');
  inputArtifacts.push({
    kind: 'ROOT_SOURCE_BINDING_RECEIPT',
    path: path.relative(root, sourceBindingReceiptPath).replace(/\\/g, '/'),
    sha256: `sha256:${createHash('sha256').update(sourceBindingReceiptBytes).digest('hex')}`,
    byteLength: sourceBindingReceiptBytes.byteLength,
    workspaceRevision: sourceBindingReceipt.workspaceRevision,
    committedRows: sourceBindingReceipt.committedRows,
  });
}

const graph = buildSnapshotBoundProposalGraphV1({
  proposals,
  workspaceRevision: plan.targetWorkspaceRevision,
  inputArtifactDigest: `sha256:${createHash('sha256').update(JSON.stringify(inputArtifacts)).digest('hex')}`,
  inputArtifacts,
  symbolCandidatesByTarget,
});
const outputPath = path.resolve(root, outputArg);
if (!outputPath.startsWith(allowedRoot)) throw new Error('OUTPUT_PATH_OUTSIDE_TMP_ATLAS');
writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ outputPath: path.relative(root, outputPath), receipt: graph.receipt }, null, 2));
