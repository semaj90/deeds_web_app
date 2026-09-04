import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const plannerPath = 'packages/parent-atlas/src/core/kernel-bound-dag-planner-v1.ts';
const planner = readFileSync(resolve(root, plannerPath), 'utf8');
const genericRequestBinding = /boundArguments:\s*input\.request\.boundArguments/.test(planner);
const scopedArgumentsSupported = /operatorArgumentsByOperatorId/.test(planner);
const artifactBuilderPresent = /buildParameterArtifactV1/.test(planner);
const body = {
  schema: 'atlas.dag-parameter-scope.v1',
  gate: 'DAG-PARAMETER-SCOPE-AUDIT-01',
  scope: 'read-only planner source audit; no runtime, database, cache, or artifact-store writes',
  plannerPath,
  artifactBuilderPresent,
  genericRequestBinding,
  scopedArgumentsSupported,
  classification: scopedArgumentsSupported && genericRequestBinding
    ? 'SCOPED_ARGUMENTS_SUPPORTED_LEGACY_FALLBACK_OPEN'
    : scopedArgumentsSupported ? 'PER_OPERATOR_ARGUMENT_SCOPE_SUPPORTED' : 'OPEN_GENERIC_REQUEST_ARGUMENTS',
  finding: scopedArgumentsSupported && genericRequestBinding
    ? 'planner accepts prevalidated operator-scoped arguments, but retains a request-wide compatibility fallback; schema-driven projection remains unproven'
    : genericRequestBinding
    ? 'each planned action currently materializes the full request boundArguments object; per-operator schema projection remains unproven'
    : 'planner does not contain the audited scoped-argument binding pattern',
  canonicalAuthority: false,
  writesPerformed: false,
};
const reportChecksum = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
writeFileSync(resolve(root, 'docs/reports/dag-parameter-scope-v1.json'), `${JSON.stringify({ ...body, reportChecksum: `sha256:${reportChecksum}` }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/dag-parameter-scope-v1.json', classification: body.classification }, null, 2));
