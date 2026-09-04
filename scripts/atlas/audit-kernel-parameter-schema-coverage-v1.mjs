import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const atlas = await import(pathToFileURL(resolve(root, 'packages/parent-atlas/dist/index.js')).href);
const library = atlas.buildSymbolRepairOperatorLibraryV0();
const operators = library.operators.map((operator) => ({
  operatorId: operator.operatorId,
  kind: operator.kind,
  parameterSchemaRef: operator.parameterSchemaRef,
  operatorRevision: operator.operatorRevision,
  executorClass: operator.executorClass,
}));
const schemaBound = operators.filter((operator) => operator.parameterSchemaRef !== null);
const noParameterSchema = operators.filter((operator) => operator.parameterSchemaRef === null);
const body = {
  schema: 'atlas.kernel-parameter-schema-coverage.v1',
  gate: 'DAG-PARAMETER-SCHEMA-COVERAGE-01',
  scope: 'read-only operator-library audit; no runtime, database, cache, or artifact-store writes',
  libraryRevision: library.libraryRevision,
  operatorCount: operators.length,
  schemaBoundCount: schemaBound.length,
  noParameterSchemaCount: noParameterSchema.length,
  schemaBound,
  noParameterSchema,
  classification: noParameterSchema.length > 0 ? 'PARTIAL_PARAMETER_SCHEMA_COVERAGE' : 'FULL_PARAMETER_SCHEMA_COVERAGE',
  canonicalAuthority: false,
  writesPerformed: false,
};
const reportChecksum = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
writeFileSync(resolve(root, 'docs/reports/kernel-parameter-schema-coverage-v1.json'), `${JSON.stringify({ ...body, reportChecksum: `sha256:${reportChecksum}` }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/kernel-parameter-schema-coverage-v1.json', classification: body.classification, operatorCount: operators.length, schemaBoundCount: schemaBound.length }, null, 2));
