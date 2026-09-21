import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportsDir = path.resolve(root, 'docs/reports');
const controllerPath = path.resolve(reportsDir, 'openspec-execution-controller-v1.json');
const fallbackPath = path.resolve(reportsDir, 'openspec-actionable-lane-audit-v2.json');
const outputPath = path.resolve(reportsDir, 'openspec-authority-text-review-v1.json');

let input;
let source;
try {
  input = JSON.parse(fs.readFileSync(controllerPath, 'utf8'));
  source = 'openspec-execution-controller-v1.json';
} catch {
  input = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  source = 'openspec-actionable-lane-audit-v2.json';
}

const fullTasks = Array.isArray(input.allTasks)
  ? input.allTasks.filter((task) => (task.controller?.state ?? task.executionState) === 'ACTIONABLE')
  : (Array.isArray(input.actionableTasks) ? input.actionableTasks : []);
const suspicious = fullTasks.length > 0
  ? fullTasks
  : (Array.isArray(input.suspiciousActionable) ? input.suspiciousActionable : []);

function classify(text) {
  const value = String(text ?? '').toLowerCase();
  const reasons = [];
  if (/source[-_ ]revision|source authority|canonical source|admitted source|current cohort/.test(value)) {
    reasons.push('CURRENT_SOURCE_AUTHORITY');
  }
  if (/packet[-_ ]revision|packet identity|chunk[-_ ]owner|symbol[-_ ]version|lineage/.test(value)) {
    reasons.push('PACKET_IDENTITY_AUTHORITY');
  }
  if (/live readback|production|canonical|promotion|migration|materiali[sz]e/.test(value)) {
    reasons.push('CANONICAL_AUTHORIZATION');
  }
  if (/candidate population|candidateordinal|semantic snapshot|ann[-_ ]03|qdrant|cuvs/.test(value)) {
    reasons.push('CANDIDATE_POPULATION_FREEZE');
  }
  return [...new Set(reasons)];
}

const reviews = suspicious.map((task) => {
  const recommendedBlockers = classify(task.text);
  return {
    taskKey: task.taskKey,
    stableKey: task.stableKey ?? null,
    logicalTaskKey: task.logicalTaskKey ?? null,
    reviewedTaskRevision: task.blockHash ?? null,
    change: task.change,
    text: task.text,
    observedExecutionState: task.executionState,
    recommendedDisposition: recommendedBlockers.length > 0 ? 'REVIEW_BEFORE_SELECTION' : 'NO_MATCH',
    recommendedBlockers,
    metadataPresent: task.dependencies ?? {},
    retryPolicy: 'Do not retry until the relevant receipt or task metadata changes',
    selectionAuthority: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
});

const counts = Object.fromEntries(
  ['CURRENT_SOURCE_AUTHORITY', 'PACKET_IDENTITY_AUTHORITY', 'CANONICAL_AUTHORIZATION', 'CANDIDATE_POPULATION_FREEZE']
    .map((key) => [key, reviews.filter((task) => task.recommendedBlockers.includes(key)).length]),
);

const report = {
  schema: 'atlas.openspec-authority-text-review.v1',
  source,
  policy: {
    purpose: 'advisory metadata reconciliation only',
    changesExecutionState: false,
    changesTaskLedger: false,
    allowsPromotion: false,
  },
  summary: {
    suspiciousActionableTasks: reviews.length,
    reviewRequired: reviews.filter((task) => task.recommendedDisposition === 'REVIEW_BEFORE_SELECTION').length,
    blockerCounts: counts,
    writesPerformed: false,
  },
  tasks: reviews,
};

const semantic = JSON.stringify(report);
report.semanticChecksum = `sha256:${crypto.createHash('sha256').update(semantic).digest('hex')}`;
const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
fs.renameSync(temporaryPath, outputPath);
console.log(JSON.stringify({ outputPath, summary: report.summary, semanticChecksum: report.semanticChecksum }, null, 2));
