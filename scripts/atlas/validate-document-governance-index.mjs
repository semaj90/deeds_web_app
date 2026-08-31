#!/usr/bin/env node
/** Read-only closure/archive gate for the generated document registry. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const registryPath = join(process.cwd(), 'docs', 'reports', 'document-governance-registry-v1.json');
const reportPath = join(process.cwd(), 'docs', 'reports', 'document-governance-validation-v1.json');
const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : null;
const records = registry?.records ?? [];
const failures = [];

if (!registry) failures.push('REGISTRY_MISSING');
if (registry && registry.supersessionPolicy !== 'EXPLICIT_LINK_AND_RECEIPT_ONLY') failures.push('SUPERSESSION_POLICY_MISSING');

for (const record of records) {
  if (record.kind !== 'OPENSPEC' || record.totalTasks == null) continue;
  if (!record.openspecChange) failures.push(`OPENSPEC_BINDING_MISSING:${record.path}`);
  if (record.completedTasks !== record.totalTasks) failures.push(`UNCHECKED_TASKS:${record.path}`);
}

const result = {
  schema: 'atlas.document.governance.validation.v1',
  registryChecksum: registry ? createHash('sha256').update(readFileSync(registryPath)).digest('hex') : null,
  records: records.length,
  status: failures.length ? 'BLOCKED' : 'PROVEN_BOUNDED',
  closureEligible: failures.length === 0,
  archiveEligible: records.filter((record) => record.archiveEligible === true).length,
  failures,
  writes: { documents: 0, archives: 0, registry: 0 },
  generatedAt: new Date().toISOString(),
};

writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(`${result.status} failures=${failures.length} archiveEligible=${result.archiveEligible}`);
console.log(`report=${reportPath}`);
process.exitCode = result.closureEligible ? 0 : 2;
