#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(repoRoot, 'sveltekit-frontend/package.json'));
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020').default;

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const readYaml = (relativePath) => YAML.parse(readText(relativePath));
const fail = (message) => {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
};
const sameStrings = (left, right) =>
	JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const schemaPath = '.okf/schemas/hmm-api-recommendation-procedure-v1.schema.json';
const procedurePath = '.okf/pipelines/hmm-api-recommendation-v1.yaml';
const schema = readJson(schemaPath);
const procedure = readYaml(procedurePath);
const ajv = new Ajv2020({ allErrors: true });

if (!ajv.validate(schema, procedure)) {
	fail(`procedure schema validation: ${JSON.stringify(ajv.errors)}`);
}

const manifest = readYaml('.okf/manifest.yaml');
if (!manifest.registries.schemas.schemas.includes(path.basename(schemaPath))) {
	fail('procedure schema is not registered in .okf/manifest.yaml');
}
if (!manifest.registries.pipelines.schemas.includes(path.basename(procedurePath))) {
	fail('procedure is not registered in .okf/manifest.yaml');
}

const profileFiles = fs
	.readdirSync(path.join(repoRoot, '.okf/languages'))
	.filter((name) => name.endsWith('.yaml'));
const declaredProfiles = procedure.language_profiles.map((entry) => path.basename(entry.profile_ref));
if (!sameStrings(profileFiles, declaredProfiles)) {
	fail('procedure language profile references do not exactly match .okf/languages/*.yaml');
}

const predicateRegistry = readYaml('.okf/predicates/feature-relationships.yaml');
const canonicalPredicates = Object.keys(predicateRegistry.predicates);
if (!sameStrings(canonicalPredicates, procedure.relation_policy.registered_predicates)) {
	fail('procedure canonical predicate list differs from .okf/predicates/feature-relationships.yaml');
}
const candidateRelations = procedure.relation_policy.candidate_relation_kinds;
const predicateOverlap = candidateRelations.filter((candidate) => canonicalPredicates.includes(candidate));
if (procedure.relation_policy.candidate_relation_disposition !== 'PROPOSAL_ONLY') {
	fail('candidate relation kinds must remain explicitly PROPOSAL_ONLY until canonical mapping is reviewed');
}
if (predicateOverlap.length) {
	fail(`candidate relation kinds overlap canonical predicates without an explicit mapping: ${predicateOverlap.join(', ')}`);
}

const labelRegistry = readJson('sveltekit-frontend/src/lib/server/labels/feature-label-registry.shared.json');
const labelKeys = new Set(labelRegistry.map((entry) => entry.key));
const usedLabels = new Set(procedure.language_profiles.flatMap((entry) => entry.feature_labels));
const unknownLabels = [...usedLabels].filter((key) => !labelKeys.has(key));
if (unknownLabels.length) fail(`unknown feature labels: ${unknownLabels.join(', ')}`);

const sourceRefs = [
	...Object.values(procedure.runtime_contracts).map((contract) => contract.source_ref),
	procedure.feature_label_policy.registry_ref,
	procedure.relation_policy.registry_ref,
	procedure.policy_model.state_vocabulary_ref.split('#')[0],
	procedure.policy_model.emission_ref.split('#')[0]
];
const missingSources = sourceRefs.filter((sourceRef) => !fs.existsSync(path.join(repoRoot, sourceRef)));
if (missingSources.length) fail(`referenced source paths missing: ${missingSources.join(', ')}`);

if (
	procedure.authority.canonical_authority !== false ||
	procedure.authority.writes_allowed !== false ||
	procedure.authority.tool_execution_allowed !== false ||
	procedure.authority.task_completion_allowed !== false ||
	procedure.recommendation_policy.hmm_enabled !== false
) {
	fail('authority boundary changed; shadow procedure must remain non-writing and HMM-disabled');
}

const rows = [];
const trainingDirectory = path.join(repoRoot, procedure.policy_model.training_dataset_ref);
for (const name of fs.readdirSync(trainingDirectory).filter((entry) => entry.endsWith('.jsonl'))) {
	const lines = fs.readFileSync(path.join(trainingDirectory, name), 'utf8').split(/\r?\n/).filter(Boolean);
	for (const line of lines) rows.push(JSON.parse(line));
}
const isQualifiedRevision = (value) =>
	typeof value === 'string' && value.trim().length > 0 && !['unknown', 'null', 'undefined'].includes(value.toLowerCase());
const snapshot = {
	row_count: rows.length,
	distinct_states: new Set(rows.map((row) => row.selectedState)).size,
	distinct_actions: new Set(rows.map((row) => row.policyAction)).size,
	distinct_outcomes: new Set(rows.map((row) => row.finalOutcome)).size,
	distinct_source_revision_values: new Set(rows.map((row) => row.revisions?.sourceRevision)).size,
	known_source_revision_rows: rows.filter((row) => isQualifiedRevision(row.revisions?.sourceRevision)).length,
	distinct_feature_revisions: new Set(rows.map((row) => row.policyFeatureRevision ?? row.revisions?.featureRevision)).size,
	all_rows_executed: rows.every((row) => row.executed === true),
	all_rows_have_source_refs: rows.every((row) => Array.isArray(row.sourceRefs) && row.sourceRefs.length > 0)
};
if (JSON.stringify(snapshot) !== JSON.stringify(procedure.policy_model.training_dataset_snapshot)) {
	fail(`training dataset snapshot drift: ${JSON.stringify(snapshot)}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(
	`PASS: schema, manifest, ${profileFiles.length} language profiles, ${canonicalPredicates.length} canonical predicates, ${candidateRelations.length} proposal-only relation kinds, ${usedLabels.size} labels, ${sourceRefs.length} source refs, ${rows.length} policy rows; HMM disabled`
);
