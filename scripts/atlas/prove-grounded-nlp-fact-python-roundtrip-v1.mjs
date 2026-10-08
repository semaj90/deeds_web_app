#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const existingOaKPython = resolve(root, '.venv/Scripts/python.exe');
const dataclassPython = process.env.ATLAS_GROUNDED_NLP_PYTHON ?? 'python';
const pydanticPython = process.env.ATLAS_OAK_AGENT_PYTHON
  ?? (existsSync(existingOaKPython) ? existingOaKPython : dataclassPython);
const pythonEnv = {
  ...process.env,
  PYTHONPATH: [resolve(root, 'python'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
};
const { tsImport } = await import('tsx/esm/api');
const { groundNlpFeatureV1 } = await tsImport(
  '../../sveltekit-frontend/src/lib/server/nlp/nlp-observation-lineage-v1.ts',
  import.meta.url,
);
const sourceBytes = Buffer.from('const x = 1;', 'utf8');
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const canonicalJson = (value) => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const fact = groundNlpFeatureV1({
  feature: {
    kind: 'identifier',
    name: 'x',
    description: 'fixture grounded identifier',
    source: 'langextract',
    byteStart: 6,
    byteEnd: 11,
    rawText: 'x = 1',
    confidence: 0.8,
  },
  context: {
    sourceRef: 'src/fixture.ts',
    sourceRevision: sha256(sourceBytes),
    workspaceRevision: 'workspace:fixture-v1',
    providerRevision: 'langextract:fixture-v1',
    producerRevision: 'atlas:nlp-extractor:fixture-v1',
  },
  sourceBytes,
  taskRef: 'openspec/changes/example/tasks.md#L5',
  canonicalTaskRef: 'openspec-task:example/EX-01',
  taskRevision: sha256(Buffer.from('task block', 'utf8')),
  evidenceCardChecksum: sha256(Buffer.from('evidence card', 'utf8')),
});

assert.equal(fact.canonicalAuthority, false);
assert.equal(fact.ontologyPromotionAllowed, false);
assert.notEqual(fact.sourceRevision, fact.taskRevision);
const dataclassRun = spawnSync(dataclassPython, [resolve(root, 'python/atlas_grounded_nlp_fact_v1.py')], {
  cwd: root,
  encoding: 'utf8',
  input: JSON.stringify(fact),
  timeout: 30000,
  maxBuffer: 1024 * 1024,
  env: pythonEnv,
});
if (dataclassRun.error || dataclassRun.status !== 0) {
  throw new Error(`PYTHON_GROUNDED_FACT_DATACLASS_FAILED:${dataclassRun.error?.message ?? dataclassRun.stderr ?? dataclassRun.status}`);
}
const dataclassReadback = JSON.parse(dataclassRun.stdout);
assert.deepEqual(dataclassReadback, fact);
const pydanticRun = spawnSync(pydanticPython, [resolve(root, 'python/oak_agent/grounded_nlp_fact_v1.py')], {
  cwd: root,
  encoding: 'utf8',
  input: JSON.stringify(fact),
  timeout: 30000,
  maxBuffer: 1024 * 1024,
  env: pythonEnv,
});
if (pydanticRun.error || pydanticRun.status !== 0) {
  throw new Error(`PYTHON_GROUNDED_FACT_PYDANTIC_FAILED:${pydanticRun.error?.message ?? pydanticRun.stderr ?? pydanticRun.status}`);
}
const pydanticReadback = JSON.parse(pydanticRun.stdout);
assert.deepEqual(pydanticReadback, fact);
assert.deepEqual(pydanticReadback, dataclassReadback);
const schemaRun = spawnSync(pydanticPython, [resolve(root, 'python/oak_agent/grounded_nlp_fact_v1.py'), '--schema'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
  maxBuffer: 1024 * 1024,
  env: pythonEnv,
});
if (schemaRun.error || schemaRun.status !== 0) {
  throw new Error(`PYDANTIC_SCHEMA_EXPORT_FAILED:${schemaRun.error?.message ?? schemaRun.stderr ?? schemaRun.status}`);
}
const schema = JSON.parse(schemaRun.stdout);
const factFields = Object.keys(fact).sort();
assert.deepEqual([...schema.required].sort(), factFields);
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.canonicalAuthority.const, false);
assert.equal(schema.properties.ontologyPromotionAllowed.const, false);
const schemaPath = resolve(root, '.tmp/atlas/schema/grounded-nlp-fact-v1.schema.json');
mkdirSync(resolve(root, '.tmp/atlas/schema'), { recursive: true });
writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
const receiptBody = {
  schema: 'atlas.grounded-nlp-cross-runtime-parity-receipt.v1',
  status: 'FIXTURE_PARITY_PROVEN',
  factId: fact.factId,
  sourceRef: fact.sourceRef,
  sourceRevision: fact.sourceRevision,
  workspaceRevision: fact.workspaceRevision,
  taskRef: fact.taskRef,
  taskRevision: fact.taskRevision,
  evidenceCardChecksum: fact.evidenceCardChecksum,
  evidenceSpan: fact.evidenceSpan,
  inputChecksum: sha256(Buffer.from(canonicalJson(fact), 'utf8')),
  dataclassReadbackChecksum: sha256(Buffer.from(canonicalJson(dataclassReadback), 'utf8')),
  pydanticReadbackChecksum: sha256(Buffer.from(canonicalJson(pydanticReadback), 'utf8')),
  pydanticSchemaChecksum: sha256(Buffer.from(canonicalJson(schema), 'utf8')),
  parity: true,
  canonicalAuthority: false,
  writesPerformed: false,
  aceCanonicalPayload: null,
  aceUnavailableReason: 'NO_ADMITTED_PARENT_ATLAS_COHORT',
  topologyCoordinates: null,
  topologyUnavailableReason: 'NO_ADMITTED_TOPOLOGY_REPRESENTATION',
  evidenceRefs: [
    'sveltekit-frontend/src/lib/server/nlp/nlp-observation-lineage-v1.ts',
    'python/atlas_grounded_nlp_fact_v1.py',
    'python/oak_agent/grounded_nlp_fact_v1.py',
  ],
};
const receipt = {
  ...receiptBody,
  receiptChecksum: sha256(Buffer.from(canonicalJson(receiptBody), 'utf8')),
};
const receiptPath = resolve(root, '.tmp/atlas/grounded-nlp-dataclass-pydantic-parity-v1.json');
mkdirSync(resolve(root, '.tmp/atlas'), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
const receiptReadback = JSON.parse(readFileSync(receiptPath, 'utf8'));
const { receiptChecksum: readbackChecksum, ...readbackBody } = receiptReadback;
assert.deepEqual(receiptReadback, receipt);
assert.equal(readbackChecksum, sha256(Buffer.from(canonicalJson(readbackBody), 'utf8')));
console.log(JSON.stringify({
  status: 'GROUNDED_NLP_DATACLASS_PYDANTIC_PARITY_PROVEN',
  factId: fact.factId,
  sourceRevision: fact.sourceRevision,
  taskRevision: fact.taskRevision,
  inputChecksum: sha256(Buffer.from(canonicalJson(fact), 'utf8')),
  dataclassReadbackChecksum: sha256(Buffer.from(canonicalJson(dataclassReadback), 'utf8')),
  pydanticReadbackChecksum: sha256(Buffer.from(canonicalJson(pydanticReadback), 'utf8')),
  parity: true,
  pydanticSchemaChecksum: sha256(Buffer.from(canonicalJson(schema), 'utf8')),
  pydanticSchemaOutput: '.tmp/atlas/schema/grounded-nlp-fact-v1.schema.json',
  receiptPath: '.tmp/atlas/grounded-nlp-dataclass-pydantic-parity-v1.json',
  receiptChecksum: receipt.receiptChecksum,
  independentReadback: 'MATCH',
  canonicalAuthority: false,
  writesPerformed: false,
}, null, 2));
