#!/usr/bin/env node

/**
 * Read-only convergence audit for the AST-symbol and domain-classifier gates.
 *
 * This composes existing receipts. It does not resolve symbols, train models,
 * modify OpenSpec, or write PostgreSQL/Valkey/Qdrant/Graphify state.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.cwd());
const reportPath = path.resolve(root, 'docs/reports/nlp-classification-symbol-blockers-v1.json');

function readJson(relativePath) {
  const absolute = path.resolve(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    return null;
  }
}

function checksum(value) {
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const symbol = readJson('docs/reports/ast-symbol-resolution-v1.json');
const classifierEval = readJson('docs/reports/domain-classifier-eval-baseline-v1.json');
const classifierReadiness = readJson('docs/reports/domain-classifier-training-readiness-v1.json');
const ownership = readJson('docs/reports/symbol-classifier-owner-census-v1.json');

const symbolAligned = Boolean(
  symbol &&
  symbol.freshness?.structuralFreshForPlan === true &&
  symbol.freshness?.registryFreshForStructural === true &&
  symbol.freshness?.registryPlanParity === true
);
const classifierCalibrated = Boolean(
  classifierEval &&
  Number(classifierEval.goldRows ?? 0) > 0 &&
  classifierEval.status !== 'NO_GOLD_LABELS'
);
const sourceAdmitted = Boolean(
  classifierReadiness?.sourceSnapshot?.worktreeFingerprintParity === true &&
  classifierReadiness?.sourceSnapshot?.status === 'CURRENT_SNAPSHOT_PROVEN'
);

const blockers = [
  {
    key: 'AST_SYMBOL_RESOLUTION_COHORT_ALIGNED',
    state: symbolAligned ? 'PROVEN' : 'BLOCKED_UPSTREAM',
    evidence: symbol
      ? {
          status: symbol.status,
          inputDeclarations: symbol.counts?.inputDeclarations ?? null,
          planWorkspaceRevision: symbol.freshness?.planWorkspaceRevisions ?? [],
          structuralFreshForPlan: symbol.freshness?.structuralFreshForPlan ?? null,
          registryFreshForStructural: symbol.freshness?.registryFreshForStructural ?? null,
          nextGate: symbol.nextGate ?? null
        }
      : { missingReport: 'docs/reports/ast-symbol-resolution-v1.json' },
    nextAction: symbolAligned
      ? 'Run the exact aligned resolver census.'
      : 'Regenerate structural, plan, and registry artifacts from one admitted or explicitly frozen frame.'
  },
  {
    key: 'CLASSIFIER_REVIEWED_CALIBRATION_READY',
    state: classifierCalibrated ? 'PROVEN' : 'BLOCKED_REVIEW',
    evidence: classifierEval
      ? {
          status: classifierEval.status,
          rowsConsidered: classifierEval.rowsConsidered ?? null,
          goldRows: classifierEval.goldRows ?? null,
          inputChecksum: classifierEval.inputChecksum ?? null
        }
      : { missingReport: 'docs/reports/domain-classifier-eval-baseline-v1.json' },
    nextAction: classifierCalibrated
      ? 'Evaluate the sklearn baseline and record a confidence floor.'
      : 'Obtain human-reviewed, revision-qualified labels; weak-label agreement is not accuracy.'
  },
  {
    key: 'CURRENT_SOURCE_AUTHORITY_FOR_CLASSIFICATION',
    state: sourceAdmitted ? 'PROVEN' : 'BLOCKED_SOURCE_AUTHORITY',
    evidence: classifierReadiness?.sourceSnapshot ?? {
      missingReport: 'docs/reports/domain-classifier-training-readiness-v1.json'
    },
    nextAction: sourceAdmitted
      ? 'Continue bounded classifier evaluation.'
      : 'Refresh/admit the current source frame or keep outputs noncanonical.'
  }
];

const downstream = {
  fileAnalysis: 'BLOCKED_BY_CLASSIFICATION_AND_SOURCE_AUTHORITY',
  topK: 'BLOCKED_BY_CLASSIFICATION_AND_SOURCE_AUTHORITY',
  kmeans: 'CHALLENGER_ONLY',
  knnFanout: 'BLOCKED_BY_CLASSIFICATION_AND_SOURCE_AUTHORITY',
  documentAnalysis: 'BLOCKED_BY_CLASSIFICATION_AND_SOURCE_AUTHORITY',
  recommendations: 'BLOCKED_BY_CLASSIFICATION_AND_SOURCE_AUTHORITY',
  featureMatrix: 'BLOCKED_BY_SYMBOL_AND_ONTOLOGY_AUTHORITY',
  cacheAdmission: 'BLOCKED_BY_EXACT_IDENTITY_AND_REVIEWED_CLASSIFICATION'
};

const body = {
  schema: 'atlas.nlp-classification-symbol-blockers.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  ownerReports: {
    symbol: 'docs/reports/ast-symbol-resolution-v1.json',
    classifierEvaluation: 'docs/reports/domain-classifier-eval-baseline-v1.json',
    classifierReadiness: 'docs/reports/domain-classifier-training-readiness-v1.json',
    ownership: 'docs/reports/symbol-classifier-owner-census-v1.json'
  },
  duplicateCanonicalOwnersProven: ownership?.summary?.duplicateCanonicalOwnersProven ?? false,
  blockers,
  downstream,
  policy: {
    identityExact: true,
    classifierProbabilistic: true,
    rankersChallengerOnly: true,
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false
  },
  inputChecksum: checksum({
    symbol,
    classifierEval,
    classifierReadiness,
    ownership
  })
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporaryPath = reportPath + '.tmp-' + process.pid;
fs.writeFileSync(temporaryPath, JSON.stringify(body, null, 2) + '\n', 'utf8');
fs.renameSync(temporaryPath, reportPath);
console.log(JSON.stringify({
  schema: body.schema,
  status: blockers.every((item) => item.state === 'PROVEN') ? 'READY_FOR_NEXT_PROOF' : 'BLOCKED',
  duplicateCanonicalOwnersProven: body.duplicateCanonicalOwnersProven,
  writesPerformed: false,
  reportPath
}, null, 2));
