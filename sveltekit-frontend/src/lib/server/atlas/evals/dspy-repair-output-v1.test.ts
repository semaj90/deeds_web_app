import { describe, expect, it } from 'vitest';
import { buildContextManifestV2 } from '../graph/context-manifest-v2.js';
import { parseDspyRepairOutputV1 } from './dspy-repair-output-v1.js';

const manifest = buildContextManifestV2({
	schema: 'atlas.context-manifest.v1',
	requestId: 'request-1',
	snapshotId: 'snapshot-1',
	graphRevision: 'graph-r1',
	query: 'repair a failed typecheck',
	candidateBucket: 32,
	candidateCount: 2,
	tokenBudget: 1024,
	selectedNodeKeys: ['symbol:one', 'file:two'],
	evidenceRefs: ['source:one', 'diagnostic:two'],
	producerRevision: 'fixture-r1',
}, {
	selectedOrdinalSetChecksum: 'ordinals-r1',
	evidenceRevisions: {
		sourceRevision: 'source-r1',
		representationRevision: 'representation-r1',
		featureRevision: 'feature-r1',
		ontologyRevision: null,
		modelRevision: 'model-r1',
		promptTemplateRevision: 'prompt-r1',
	},
	ordinalMapChecksum: 'ordinal-map-r1',
	retrievalPolicyRevision: 'retrieval-r1',
	acePlaybookRevision: 'playbook-r1',
});

const validOutput = () => ({
	schema: 'atlas.dspy-repair-output.v1',
	contextManifestChecksum: `sha256:${manifest.identityChecksum}`,
	diagnosis: 'Type mismatch at the call site.',
	targetCandidates: ['symbol:one', 'file:two'],
	patchPlan: 'Narrow the parameter type.',
	validationPlan: 'Run the focused typecheck and test.',
	evidenceRefs: ['diagnostic:two', 'source:one'],
});

describe('parseDspyRepairOutputV1', () => {
	it('admits exact manifest-bound refs and preserves target ranking', () => {
		const parsed = parseDspyRepairOutputV1(JSON.stringify(validOutput()), manifest);
		expect(parsed.targetCandidates).toEqual(['symbol:one', 'file:two']);
		expect(parsed.evidenceRefs).toEqual(['diagnostic:two', 'source:one']);
	});

	it('rejects malformed JSON, checksum drift, extra fields, and empty text', () => {
		expect(() => parseDspyRepairOutputV1('{', manifest)).toThrow('DSPY_REPAIR_OUTPUT_INVALID_JSON');
		expect(() => parseDspyRepairOutputV1({ ...validOutput(), contextManifestChecksum: `sha256:${'0'.repeat(64)}` }, manifest))
			.toThrow('CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
		expect(() => parseDspyRepairOutputV1({ ...validOutput(), unexpected: true }, manifest)).toThrow();
			expect(() => parseDspyRepairOutputV1({ ...validOutput(), diagnosis: '  ' }, manifest)).toThrow();
	});

	it('rejects a manifest whose identity checksum does not match its contents', () => {
		const tampered = { ...manifest, identityInput: { ...manifest.identityInput, retrievalPolicyRevision: 'other-policy' } };
		expect(() => parseDspyRepairOutputV1(validOutput(), tampered)).toThrow('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_INVALID');
	});

	it('rejects fabricated refs, duplicate refs, and duplicate target IDs', () => {
		expect(() => parseDspyRepairOutputV1({ ...validOutput(), evidenceRefs: ['source:invented'] }, manifest))
			.toThrow('UNAUTHORIZED_EVIDENCE_REF:source:invented');
		expect(() => parseDspyRepairOutputV1({ ...validOutput(), targetCandidates: ['file:invented'] }, manifest))
			.toThrow('UNAUTHORIZED_TARGET_ID:file:invented');
		expect(() => parseDspyRepairOutputV1({ ...validOutput(), evidenceRefs: ['source:one', 'source:one'] }, manifest))
			.toThrow('DUPLICATE_EVIDENCE_REF');
		expect(() => parseDspyRepairOutputV1({ ...validOutput(), targetCandidates: ['symbol:one', 'symbol:one'] }, manifest))
			.toThrow('DUPLICATE_TARGET_ID');
	});
});
