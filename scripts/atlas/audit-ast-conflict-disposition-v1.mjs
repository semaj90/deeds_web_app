#!/usr/bin/env node

/**
 * AST_BF_18C disposition gate.
 *
 * This is deliberately read-only. It converts the authoritative backfill
 * classification into an explicit disposition receipt so structural-key
 * observations cannot be mistaken for supersession authorization.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const backfillPath = path.join(ROOT, 'docs/reports/atlas-ast-backfill-idempotency-proof-v1.json');
const readinessPath = path.join(ROOT, 'docs/reports/ast-canary-readiness-v1.json');
const outputPath = path.join(ROOT, 'docs/reports/ast-conflict-disposition-v1.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rel = (filePath) => path.relative(ROOT, filePath).replaceAll('\\', '/');

const backfill = readJson(backfillPath);
const readiness = readJson(readinessPath);
const classification = backfill.steps?.AST_BF_18C_STRUCTURAL_CONFLICT_CLASSIFICATION;
if (!classification) throw new Error('Missing AST_BF_18C_STRUCTURAL_CONFLICT_CLASSIFICATION');

const byClass = classification.byClass ?? {};
const conflictCount = Number(classification.conflicts ?? 0);
const onlyIdentityAlgorithmChange = conflictCount > 0 &&
  Object.keys(byClass).length === 1 &&
  Number(byClass.IDENTITY_ALGORITHM_CHANGE ?? 0) === conflictCount;
const supersessionAllowed = Number(classification.supersessionProposalsAllowed ?? 0);
const readinessBlockers = Array.isArray(readiness.blockers) ? [...readiness.blockers].sort() : [];

const input = {
  backfillReport: rel(backfillPath),
  readinessReport: rel(readinessPath),
  backfillStatus: backfill.status ?? null,
  candidatesInput: backfill.candidatesInput ?? null,
  netNew: backfill.steps?.AST_BF_17_NET_NEW?.netNew ?? backfill.steps?.AST_BF_17_NET_NEW?.eligibleHandoff?.rows ?? null,
  conflictCount,
  byClass,
  supersessionProposalsAllowed: supersessionAllowed,
};

const disposition = onlyIdentityAlgorithmChange && supersessionAllowed === 0
  ? 'REVIEW_REQUIRED_IDENTITY_ALGORITHM_CHANGE'
  : 'REVIEW_REQUIRED_UNRESOLVED_CLASSIFICATION';

const receipt = {
  schema: 'atlas.ast-conflict-disposition.v1',
  generatedAt: new Date().toISOString(),
  gate: 'AST_BF_18C_STRUCTURAL_CONFLICT_DISPOSITION',
  input,
  disposition,
  rules: {
    structuralKeyObservationIsNotSupersession: true,
    newerGeneratorAloneIsNotEvidence: true,
    supersessionRequiresStrongRevisionEvidence: true,
    persistentApplyRequiresSeparateAuthorityGate: true,
  },
  assertions: {
    classificationPresent: true,
    allConflictsClassifiedAsIdentityAlgorithmChange: onlyIdentityAlgorithmChange,
    supersessionProposalsAllowed: supersessionAllowed,
    supersessionProposalsApproved: false,
    currentCanaryReadiness: readiness.status ?? 'UNKNOWN',
    currentCanaryBlockers: readinessBlockers,
  },
  status: disposition,
  canonicalAuthority: false,
  writesPerformed: false,
};
receipt.checksum = sha256(JSON.stringify({
  gate: receipt.gate,
  input: receipt.input,
  disposition: receipt.disposition,
  rules: receipt.rules,
  assertions: receipt.assertions,
  canonicalAuthority: receipt.canonicalAuthority,
  writesPerformed: receipt.writesPerformed,
}));
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: outputPath,
  status: receipt.status,
  conflictCount,
  supersessionProposalsApproved: false,
  blockers: readinessBlockers,
  writesPerformed: false,
}, null, 2));
