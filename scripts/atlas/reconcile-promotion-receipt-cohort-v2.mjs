#!/usr/bin/env node
/**
 * PROMOTION-RECEIPT-COHORT-01 v2
 *
 * Current canonical-chunk-grain wrapper over the v1 receipt classifier. The v1
 * file is preserved as historical packet-canary evidence. This version binds
 * the cohort to `current-chunk-ordinal-map-v2`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluatePromotionReceiptCohort } from './reconcile-promotion-receipt-cohort-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CURRENTNESS = 'docs/reports/promotion-gate-receipt-currentness-v1.json';
const CANDIDATE_RECEIPT = 'docs/reports/current-chunk-ordinal-map-v2.json';
const CANDIDATE_MAP = '.tmp/atlas/current-chunk-ordinal-map-v2.json';
const GRAPH = 'docs/reports/current-graph-artifact-readiness-v1.json';
const OUT = 'docs/reports/promotion-receipt-cohort-v2.json';

function readJson(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return { exists: false, relativePath, value: null };
  try {
    return { exists: true, relativePath, value: JSON.parse(fs.readFileSync(absolutePath, 'utf8')) };
  } catch (error) {
    return { exists: true, relativePath, value: null, parseError: String(error?.message ?? error) };
  }
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function evaluateCurrentChunkPromotionCohort({ currentness, candidateReceipt, candidateMap, graphReport, rawReceipts }) {
  const base = evaluatePromotionReceiptCohort({
    currentness,
    candidateReceipt,
    candidateMap,
    graphReport,
    rawReceipts,
  });

  const blockers = [...base.blockers];
  if (candidateReceipt?.schema !== 'atlas.current-chunk-ordinal-map.v2') blockers.push('CURRENT_CHUNK_ORDINAL_RECEIPT_SCHEMA_MISMATCH');
  if (candidateReceipt?.identityGrain !== 'CANONICAL_CHUNK') blockers.push('CANDIDATE_IDENTITY_GRAIN_NOT_CANONICAL_CHUNK');
  if (candidateReceipt?.identityOwner !== 'atlas_packet_chunk_lineage') blockers.push('CANDIDATE_IDENTITY_OWNER_MISMATCH');
  if (candidateReceipt?.checks?.provenPacketChunkLineage !== true) blockers.push('PACKET_CHUNK_LINEAGE_NOT_PROVEN');
  if (candidateReceipt?.checks?.exactWorkspaceBinding !== true) blockers.push('WORKSPACE_BINDING_NOT_EXACT');
  if (candidateMap?.rowCount !== candidateReceipt?.candidateCount) blockers.push('CURRENT_CHUNK_MAP_ROW_COUNT_MISMATCH');

  const status = blockers.length === 0
    ? 'PROMOTION_RECEIPT_COHORT_PROVEN'
    : 'PROMOTION_RECEIPT_COHORT_BLOCKED';

  const report = {
    ...base,
    schemaVersion: 'atlas.promotion-receipt-cohort.v2',
    status,
    identityGrain: 'CANONICAL_CHUNK',
    candidateCount: candidateReceipt?.candidateCount ?? base.candidateCount ?? null,
    sourceRevisionSetChecksum: candidateReceipt?.sourceRevisionSetChecksum ?? null,
    blockers: [...new Set(blockers)],
    sourceReports: {
      currentness: CURRENTNESS,
      currentChunkOrdinalReceipt: CANDIDATE_RECEIPT,
      currentChunkOrdinalMap: CANDIDATE_MAP,
      currentGraphArtifactReadiness: GRAPH,
    },
    nextGate: status === 'PROMOTION_RECEIPT_COHORT_PROVEN'
      ? 'SEMANTIC-768-PHYSICAL-OWNER-01'
      : 'CURRENT_CHUNK_OR_GRAPH_REVISION_CLOSURE',
  };
  report.checksum = checksum({ ...report, checksum: undefined });
  return report;
}

async function main() {
  const currentnessFile = readJson(CURRENTNESS);
  const candidateReceiptFile = readJson(CANDIDATE_RECEIPT);
  const candidateMapFile = readJson(CANDIDATE_MAP);
  const graphFile = readJson(GRAPH);

  if (!currentnessFile.value) throw new Error(`CURRENTNESS_REPORT_REQUIRED:${CURRENTNESS}`);
  if (!candidateReceiptFile.value) throw new Error(`CURRENT_CHUNK_ORDINAL_RECEIPT_REQUIRED:${CANDIDATE_RECEIPT}`);
  if (!candidateMapFile.value) throw new Error(`CURRENT_CHUNK_ORDINAL_MAP_REQUIRED:${CANDIDATE_MAP}`);
  if (!graphFile.value) throw new Error(`GRAPH_READINESS_REPORT_REQUIRED:${GRAPH}`);

  const rawReceipts = new Map();
  for (const receipt of currentnessFile.value.receipts ?? []) {
    rawReceipts.set(receipt.receiptPath, readJson(receipt.receiptPath));
  }

  const report = evaluateCurrentChunkPromotionCohort({
    currentness: currentnessFile.value,
    candidateReceipt: candidateReceiptFile.value,
    candidateMap: candidateMapFile.value,
    graphReport: graphFile.value,
    rawReceipts,
  });

  const absoluteOut = path.resolve(ROOT, OUT);
  fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
  fs.writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: report.status,
    identityGrain: report.identityGrain,
    workspaceRevision: report.workspaceRevision,
    candidateSnapshotRevision: report.candidateSnapshotRevision,
    candidateCount: report.candidateCount,
    ordinalMapChecksum: report.ordinalMapChecksum,
    graphRevision: report.graphRevision,
    blockers: report.blockers,
    reportPath: OUT,
    writesPerformed: false,
  }, null, 2));

  if (report.status !== 'PROMOTION_RECEIPT_COHORT_PROVEN') process.exitCode = 2;
}

const invokedAsScript = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invokedAsScript) main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
