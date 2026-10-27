import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { parse } from 'yaml';

const root = process.cwd();
const outputArg = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? null;
const outputPath = outputArg ? resolve(root, outputArg) : null;
const atlasTmp = resolve(root, '.tmp/atlas');
if (outputPath) {
  const outputRelative = relative(atlasTmp, outputPath);
  if (outputRelative.startsWith('..') || isAbsolute(outputRelative)) throw new Error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS');
}
const readYaml = (path) => parse(readFileSync(resolve(root, path), 'utf8'));
const schema = readYaml('docs/.okf/schema.yaml');
const index = readYaml('.okf/indexes/code-capability-knowledge-v1.yaml');
const manifest = readYaml('.okf/manifest.yaml');
const expectedKinds = [
  'SymbolKnowledgeCard',
  'ModuleKnowledgeCard',
  'PackageKnowledgeCard',
  'LibraryKnowledgeCard',
  'ValidatorKnowledgeCard',
  'GeneratedArtifactBindingCard',
  'AgentCapabilityCard',
];
const expectedBaseKinds = ['Agent', 'Feature', 'Domain', 'Concept', 'Responsibility', 'Directory'];
const expectedEnvelope = [
  'canonical_id', 'packet_key', 'source_ref', 'source_revision', 'workspace_revision',
  'producer_revision', 'content_hash', 'evidence_refs', 'citations', 'capabilities',
  'constraints', 'validators', 'dependencies', 'checksum',
];

assert.deepEqual(schema.root_schema.properties.kind.enum, expectedBaseKinds, 'base kind vocabulary changed');
assert.deepEqual(schema.root_schema.properties.spec.properties.card_kind.enum, expectedKinds, 'card discriminator drift');
assert.deepEqual(schema.capability_card_contract.kinds, expectedKinds, 'schema contract kind list drift');
assert.deepEqual(Object.keys(index.card_kinds), expectedKinds, 'index card kinds drift');
assert.deepEqual(schema.capability_card_contract.envelope.required, expectedEnvelope, 'schema envelope drift');
assert.deepEqual(index.common_envelope.required, expectedEnvelope, 'index envelope drift');
assert.equal(schema.root_schema.properties.spec.properties.capability_card.$ref, '#/capability_card_contract/envelope');
assert.equal(schema.capability_card_contract.canonical_authority, false);
assert.equal(schema.capability_card_contract.design_only, true);
assert.equal(schema.capability_card_contract.runtime_enforced, false);
assert.equal(schema.capability_card_contract.storage_table, null);
assert.equal(index.canonical_authority, false);
assert.equal(index.population_state, 'NOT_ADMITTED');
assert.equal(index.boundaries.creates_tables, false);
assert.equal(index.boundaries.mints_identity, false);
assert.equal(index.boundaries.openwiki_role, 'DERIVED_DOCUMENTATION');
assert.equal(index.boundaries.pydantic_role, 'strict_transport_validation_only');
assert.ok(manifest.registries.indexes.schemas.includes('code-capability-knowledge-v1.yaml'));

const cardTasks = readFileSync(resolve(root, 'openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md'), 'utf8');
const architecture = readFileSync(resolve(root, 'docs/architecture/code-symbol-semantic-retrieval-v1.md'), 'utf8');
const masterToc = readFileSync(resolve(root, 'docs/MASTER-TOC.md'), 'utf8');
for (let number = 1; number <= 18; number += 1) {
  const gateId = `CODE-KNOW-${String(number).padStart(2, '0')}`;
  assert.ok(cardTasks.includes(`\`${gateId}\``), `task ledger missing ${gateId}`);
  assert.ok(architecture.includes(gateId), `architecture entry missing ${gateId}`);
}
assert.ok(masterToc.includes('Code Capability Knowledge and Agentic DAG Retrieval'));
assert.ok(masterToc.includes('CODE-KNOW-01..18'));

const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const indexPath = '.okf/indexes/code-capability-knowledge-v1.yaml';
const schemaPath = 'docs/.okf/schema.yaml';
const validatorPath = 'scripts/atlas/validate-code-capability-okf-contract-v1.mjs';
const receipt = {
  schema: 'atlas.okf-owner-validation-receipt.v1',
  status: 'VALID',
  canonicalAuthority: false,
  writesPerformed: false,
  validatorPath,
  validatorSha256: digest(readFileSync(resolve(root, validatorPath))),
  files: [{
    path: indexPath,
    status: 'PASS',
    valid: true,
    sha256: digest(readFileSync(resolve(root, indexPath))),
    schemaPath,
    schemaSha256: digest(readFileSync(resolve(root, schemaPath))),
    profile: 'code-capability-knowledge-index-v1',
    errors: [],
  }],
};
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
}
process.stdout.write('OKF_CAPABILITY_CONTRACT_VALID: seven typed kinds; base kind unchanged; non-authoritative; 18 gates linked; no persistence.\n');
if (outputPath) process.stdout.write(`${relative(root, outputPath).replaceAll('\\', '/')}\n`);
