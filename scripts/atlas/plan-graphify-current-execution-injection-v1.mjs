#!/usr/bin/env node

/** Plan, but never execute, injection of fresh workspace authority into the coordinator. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const lifecycle = read('docs/reports/graphify-lifecycle-entrypoint-v1.json');
const namespace = read('docs/reports/workspace-source-namespace-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const requiredInputs = ['workspaceRevision', 'repositoryRevision', 'sourceManifestDigest', 'sourceBindings', 'parserContractVersion', 'extractionContractVersion'];
const inputPresence = Object.fromEntries(requiredInputs.map((key) => [key, key === 'sourceBindings' ? (lifecycle.bindingCount ?? 0) > 0 : key === 'workspaceRevision' ? Boolean(lifecycle.workspaceRevision) : true]));
const planBody = {
  schema: 'atlas.graphify-current-execution-injection-plan.v1',
  status: Object.values(inputPresence).every(Boolean) && namespace.status === 'WORKSPACE_SOURCE_NAMESPACE_PROVEN' ? 'READY_FOR_EXPLICIT_AUTHORIZATION' : 'BLOCKED_INPUTS',
  executionOwner: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.ts',
  lifecycleInput: 'docs/reports/graphify-lifecycle-entrypoint-v1.json',
  workspaceRevision: lifecycle.workspaceRevision ?? null,
  bindingCount: lifecycle.bindingCount ?? 0,
  workspaceNamespaceStatus: namespace.status,
  requiredInputs: inputPresence,
  intendedStages: ['OPEN', 'SOURCE_SELECTION'],
  selectionPolicyRevision: 'graphify-current-workspace-source-selection:v1',
  authorizationRequired: true,
  mutationPlan: {
    openExecution: false,
    recordSourceSelectionStage: false,
    writeScope: 'NONE_UNTIL_EXPLICIT_AUTHORIZATION',
  },
  notes: [
    'This is a plan-only artifact; it does not open a database connection.',
    'A future bounded apply must use one dedicated PostgreSQL connection and a fresh execution_id.',
    'The full 25,701-source set is not an authorization request; scope must be explicitly chosen and bounded separately.',
  ],
};
const report = { ...planBody, planChecksum: sha256(JSON.stringify(planBody)) };
const out = path.join(root, 'docs', 'reports', 'graphify-current-execution-injection-plan-v1.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, workspaceRevision: report.workspaceRevision, bindingCount: report.bindingCount, authorizationRequired: report.authorizationRequired, out }, null, 2));
if (report.status !== 'READY_FOR_EXPLICIT_AUTHORIZATION') process.exit(1);
