#!/usr/bin/env node
/**
 * PROMOTION-RECEIPT-COHORT-01
 *
 * Read-only adjudication layer over the existing promotion receipt currentness
 * audit. It selects one revision-qualified promotion cohort without rewriting
 * or promoting historical receipts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CURRENTNESS = 'docs/reports/promotion-gate-receipt-currentness-v1.json';
const DEFAULT_ORDINAL = 'docs/reports/candidate-ordinal-admission-v1.json';
const DEFAULT_GRAPH = 'docs/reports/current-graph-artifact-readiness-v1.json';
const DEFAULT_OUT = 'docs/reports/promotion-receipt-cohort-v1.json';

const CLASSIFICATIONS = new Set([
  'CURRENT_MATCH',
  'HISTORICAL_VALID',
  'STALE_WORKSPACE',
  'STALE_CANDIDATE_SNAPSHOT',
  'MISSING_REVISION_EVIDENCE',
  'INCOMPATIBLE_GRAPH_REVISION',
]);

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function readJson(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return { exists: false, relativePath, value: null };
  try {
    return {
      exists: true,
      relativePath,
      value: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
    };
  } catch (error) {
    return {
      exists: true,
      relativePath,
      value: null,
      parseError: String(error?.message ?? error),
    };
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function firstDeepString(value, keys) {
  const wanted = new Set(keys);
  const seen = new Set();
  const queue = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, nested] of Object.entries(current)) {
      if (wanted.has(key) && typeof nested === 'string' && nested.trim()) return nested.trim();
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return null;
}

function normalizeGraphAnchor(graphReport, selectedWorkspaceRevision) {
  if (!graphReport || typeof graphReport !== 'object') return null;
  const candidates = [];
  const walk = (value, parent = null) => {
    if (!value || typeof value !== 'object') return;
    const graphRevision = firstDeepString(value, ['graphRevision', 'graph_revision', 'relationshipGraphRevision']);
    const workspaceRevision = firstDeepString(value, ['workspaceRevision', 'workspace_revision']);
    if (graphRevision && workspaceRevision) {
      candidates.push({ graphRevision, workspaceRevision, value: parent ?? value });
    }
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === 'object') walk(nested, value);
    }
  };
  walk(graphReport);

  const exact = candidates.find((candidate) => candidate.workspaceRevision === selectedWorkspaceRevision);
  if (!exact) return null;

  const reviewOnly = exact.value?.reviewOnly === true;
  const explicitMismatch = exact.value?.workspaceRevisionMatch === false;
  if (reviewOnly || explicitMismatch) return null;
  return exact.graphRevision;
}

export function classifyReceipt(receipt, anchors) {
  const raw = receipt.raw ?? {};
  const workspaceRevision = firstDeepString(raw, ['workspaceRevision', 'workspace_revision'])
    ?? receipt.workspaceRevision
    ?? null;
  const candidateSnapshotRevision = firstDeepString(raw, ['candidateSnapshotRevision', 'candidate_snapshot_revision']);
  const ordinalMapChecksum = firstDeepString(raw, ['ordinalMapChecksum', 'ordinal_map_checksum']);
  const graphRevision = firstDeepString(raw, ['graphRevision', 'graph_revision', 'relationshipGraphRevision']);

  let classification = 'CURRENT_MATCH';
  let reason = 'Receipt does not contradict the selected cohort on the revision fields it exposes.';

  if (!receipt.exists || receipt.invalid) {
    classification = 'MISSING_REVISION_EVIDENCE';
    reason = receipt.invalid ? 'Receipt is invalid JSON.' : 'Receipt is missing.';
  } else if (!workspaceRevision) {
    classification = 'MISSING_REVISION_EVIDENCE';
    reason = 'Receipt does not bind itself to a workspace revision.';
  } else if (workspaceRevision !== anchors.workspaceRevision) {
    classification = 'STALE_WORKSPACE';
    reason = `Receipt workspace ${workspaceRevision} does not match ${anchors.workspaceRevision}.`;
  } else if (candidateSnapshotRevision && anchors.candidateSnapshotRevision
    && candidateSnapshotRevision !== anchors.candidateSnapshotRevision) {
    classification = 'STALE_CANDIDATE_SNAPSHOT';
    reason = `Receipt candidate snapshot ${candidateSnapshotRevision} does not match ${anchors.candidateSnapshotRevision}.`;
  } else if (ordinalMapChecksum && anchors.ordinalMapChecksum
    && ordinalMapChecksum !== anchors.ordinalMapChecksum) {
    classification = 'STALE_CANDIDATE_SNAPSHOT';
    reason = `Receipt ordinal map ${ordinalMapChecksum} does not match ${anchors.ordinalMapChecksum}.`;
  } else if (graphRevision && anchors.graphRevision && graphRevision !== anchors.graphRevision) {
    classification = 'INCOMPATIBLE_GRAPH_REVISION';
    reason = `Receipt graph revision ${graphRevision} does not match ${anchors.graphRevision}.`;
  }

  if (!CLASSIFICATIONS.has(classification)) throw new Error(`Unexpected classification: ${classification}`);

  return {
    receiptRef: receipt.receiptRef,
    receiptChecksum: receipt.receiptChecksum ?? null,
    workspaceRevision,
    candidateSnapshotRevision,
    ordinalMapChecksum,
    graphRevision,
    classification,
    reason,
  };
}

export function evaluatePromotionReceiptCohort({ currentness, ordinalAdmission, ordinalMap, graphReport, rawReceipts }) {
  const workspaceRevision = currentness?.selection?.selectedWorkspaceRevision
    ?? currentness?.admittedWorkspaceRevision
    ?? null;
  const candidateSnapshotRevision = ordinalAdmission?.candidateSnapshotRevision ?? null;
  const ordinalMapChecksum = ordinalAdmission?.ordinalMapChecksum ?? null;
  const ordinalWorkspaceRevision = firstDeepString(ordinalAdmission, ['workspaceRevision', 'workspace_revision'])
    ?? firstDeepString(ordinalMap, ['workspaceRevision', 'workspace_revision']);
  const graphRevision = normalizeGraphAnchor(graphReport, workspaceRevision);

  const anchors = { workspaceRevision, candidateSnapshotRevision, ordinalMapChecksum, graphRevision };
  const excludedReceipts = [];
  const currentReceiptRefs = [];
  const receiptDetails = [];

  for (const meta of currentness?.receipts ?? []) {
    const rawEntry = rawReceipts.get(meta.receiptPath);
    const detail = classifyReceipt({
      receiptRef: meta.receiptPath,
      receiptChecksum: meta.receiptChecksum,
      workspaceRevision: meta.workspaceRevision,
      exists: meta.exists !== false && rawEntry?.exists !== false,
      invalid: Boolean(rawEntry?.parseError),
      raw: rawEntry?.value ?? {},
    }, anchors);
    receiptDetails.push(detail);
    if (detail.classification === 'CURRENT_MATCH') currentReceiptRefs.push(detail.receiptRef);
    else excludedReceipts.push({
      receiptRef: detail.receiptRef,
      classification: detail.classification,
      reason: detail.reason,
    });
  }

  const blockers = [];
  if (!workspaceRevision) blockers.push('CURRENT_WORKSPACE_REVISION_MISSING');
  if (!candidateSnapshotRevision) blockers.push('CANDIDATE_SNAPSHOT_REVISION_MISSING');
  if (!ordinalMapChecksum) blockers.push('ORDINAL_MAP_CHECKSUM_MISSING');
  if (!ordinalWorkspaceRevision) blockers.push('ORDINAL_MAP_WORKSPACE_BINDING_MISSING');
  else if (workspaceRevision && ordinalWorkspaceRevision !== workspaceRevision) blockers.push('ORDINAL_MAP_WORKSPACE_MISMATCH');
  if (!graphRevision) blockers.push('CURRENT_GRAPH_REVISION_NOT_PROVEN_FOR_SELECTED_WORKSPACE');

  const selectedDetails = receiptDetails.filter((receipt) => receipt.classification === 'CURRENT_MATCH');
  const selectedCandidateRevisions = [...new Set(selectedDetails.map((receipt) => receipt.candidateSnapshotRevision).filter(Boolean))];
  const selectedOrdinalChecksums = [...new Set(selectedDetails.map((receipt) => receipt.ordinalMapChecksum).filter(Boolean))];
  const selectedGraphRevisions = [...new Set(selectedDetails.map((receipt) => receipt.graphRevision).filter(Boolean))];
  if (selectedCandidateRevisions.some((value) => value !== candidateSnapshotRevision)) blockers.push('SELECTED_RECEIPTS_MIX_CANDIDATE_SNAPSHOTS');
  if (selectedOrdinalChecksums.some((value) => value !== ordinalMapChecksum)) blockers.push('SELECTED_RECEIPTS_MIX_ORDINAL_MAPS');
  if (graphRevision && selectedGraphRevisions.some((value) => value !== graphRevision)) blockers.push('SELECTED_RECEIPTS_MIX_GRAPH_REVISIONS');

  const status = blockers.length === 0
    ? 'PROMOTION_RECEIPT_COHORT_PROVEN'
    : 'PROMOTION_RECEIPT_COHORT_BLOCKED';

  const reportBase = {
    schemaVersion: 'atlas.promotion-receipt-cohort.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_RECONCILIATION',
    status,
    workspaceRevision,
    candidateSnapshotRevision,
    graphRevision,
    ordinalMapChecksum,
    ordinalWorkspaceRevision,
    currentReceiptRefs: currentReceiptRefs.sort(),
    excludedReceipts: excludedReceipts.sort((a, b) => a.receiptRef.localeCompare(b.receiptRef)),
    receiptDetails: receiptDetails.sort((a, b) => a.receiptRef.localeCompare(b.receiptRef)),
    checks: {
      oneWorkspaceRevision: Boolean(workspaceRevision),
      oneCandidateSnapshotRevision: Boolean(candidateSnapshotRevision),
      oneOrdinalMapChecksum: Boolean(ordinalMapChecksum),
      ordinalMapBoundToWorkspace: Boolean(workspaceRevision && ordinalWorkspaceRevision === workspaceRevision),
      oneCompatibleGraphRevision: Boolean(graphRevision),
      mixedRevisionAggregation: false,
      missingRevisionEvidenceInSelectedCohort: 0,
    },
    blockers,
    sourceReports: {
      currentness: DEFAULT_CURRENTNESS,
      candidateOrdinalAdmission: DEFAULT_ORDINAL,
      currentGraphArtifactReadiness: DEFAULT_GRAPH,
    },
    authority: false,
    writesPerformed: false,
    nextGate: status === 'PROMOTION_RECEIPT_COHORT_PROVEN'
      ? 'SEMANTIC-768-PHYSICAL-OWNER-01'
      : 'REBUILD_REVISION_QUALIFIED_RECEIPTS_FOR_SELECTED_COHORT',
  };

  return {
    ...reportBase,
    checksum: sha256(canonicalJson(reportBase)),
  };
}

async function main() {
  const currentnessPath = argValue('currentness', DEFAULT_CURRENTNESS);
  const ordinalPath = argValue('ordinal', DEFAULT_ORDINAL);
  const graphPath = argValue('graph', DEFAULT_GRAPH);
  const outputPath = argValue('out', DEFAULT_OUT);
  const noReport = process.argv.includes('--no-report');

  const currentnessFile = readJson(currentnessPath);
  const ordinalFile = readJson(ordinalPath);
  const graphFile = readJson(graphPath);
  if (!currentnessFile.value) throw new Error(`CURRENTNESS_REPORT_REQUIRED:${currentnessPath}`);
  if (!ordinalFile.value) throw new Error(`CANDIDATE_ORDINAL_ADMISSION_REQUIRED:${ordinalPath}`);
  if (!graphFile.value) throw new Error(`GRAPH_READINESS_REPORT_REQUIRED:${graphPath}`);

  let ordinalMap = null;
  if (typeof ordinalFile.value.sourceMap === 'string') ordinalMap = readJson(ordinalFile.value.sourceMap).value;

  const rawReceipts = new Map();
  for (const receipt of currentnessFile.value.receipts ?? []) {
    rawReceipts.set(receipt.receiptPath, readJson(receipt.receiptPath));
  }

  const report = evaluatePromotionReceiptCohort({
    currentness: currentnessFile.value,
    ordinalAdmission: ordinalFile.value,
    ordinalMap,
    graphReport: graphFile.value,
    rawReceipts,
  });

  if (!noReport) {
    const absoluteOut = path.resolve(ROOT, outputPath);
    fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
    fs.writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    status: report.status,
    workspaceRevision: report.workspaceRevision,
    candidateSnapshotRevision: report.candidateSnapshotRevision,
    ordinalMapChecksum: report.ordinalMapChecksum,
    graphRevision: report.graphRevision,
    currentReceiptCount: report.currentReceiptRefs.length,
    excludedReceiptCount: report.excludedReceipts.length,
    blockers: report.blockers,
    reportPath: noReport ? null : outputPath,
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
