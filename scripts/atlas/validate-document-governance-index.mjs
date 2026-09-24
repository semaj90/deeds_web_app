#!/usr/bin/env node
/** Read-only closure/archive gate for the generated document registry. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getOpenSpecClosureBlockersV1,
  validateDocumentGovernanceOpenSpecBindingsV1,
} from './document-governance-openspec-binding-v1.mjs';
import { auditDocumentArchiveCandidatesV1 } from './document-governance-archive-gate-v1.mjs';

const registryPath = join(process.cwd(), 'docs', 'reports', 'document-governance-registry-v1.json');
const outputFlag = process.argv.indexOf('--output');
const reportPath = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? join(process.cwd(), process.argv[outputFlag + 1])
  : join(process.cwd(), 'docs', 'reports', 'document-governance-validation-v1.json');
const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : null;
const records = registry?.records ?? [];
const failures = [];
const openSpecBindings = validateDocumentGovernanceOpenSpecBindingsV1(records);
const closureBlockers = getOpenSpecClosureBlockersV1(openSpecBindings);
const archiveReview = auditDocumentArchiveCandidatesV1(records);

if (!registry) failures.push('REGISTRY_MISSING');
if (registry && registry.supersessionPolicy !== 'EXPLICIT_LINK_AND_RECEIPT_ONLY') failures.push('SUPERSESSION_POLICY_MISSING');

failures.push(...openSpecBindings.failures);

const result = {
  schema: 'atlas.document.governance.validation.v1',
  registryChecksum: registry ? createHash('sha256').update(readFileSync(registryPath)).digest('hex') : null,
  records: records.length,
  openSpecBindings,
  status: failures.length || closureBlockers.length ? 'BLOCKED' : 'PROVEN_BOUNDED',
  closureEligible: failures.length === 0 && closureBlockers.length === 0,
  closureBlockers,
  archiveReview,
  archiveEligible: records.filter((record) => record.archiveEligible === true).length,
  failures,
  writes: { documents: 0, archives: 0, registry: 0 },
  generatedAt: new Date().toISOString(),
};

writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(`${result.status} failures=${failures.length} archiveEligible=${result.archiveEligible}`);
console.log(`report=${reportPath}`);
process.exitCode = result.closureEligible ? 0 : 2;
