import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildContextManifestV2, ContextManifestV2Schema } from '../graph/context-manifest-v2.js';
import {
	buildDspyRepairRequestV1,
	parseDspyRepairOutputV1,
	parseDspyRepairRequestV1,
	serializeDspyRepairRequestV1,
} from './dspy-repair-output-v1.js';

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

describe('buildDspyRepairRequestV1', () => {
	it('serializes the manifest checksum and exact allowlists as proposal-only input', () => {
		const request = buildDspyRepairRequestV1(manifest, { diagnosisContext: 'Fixture diagnostic.' });
		const decoded = parseDspyRepairRequestV1(serializeDspyRepairRequestV1(request));
		expect(decoded.schema).toBe('atlas.dspy-repair-request.v1');
		expect(decoded.contextManifestChecksum).toBe(`sha256:${manifest.identityChecksum}`);
		expect(decoded.allowedTargetCandidateIds).toEqual(manifest.v1.selectedNodeKeys);
		expect(decoded.allowedEvidenceRefs).toEqual(manifest.v1.evidenceRefs);
		expect(decoded.diagnosisContext).toBe('Fixture diagnostic.');
		expect(decoded.authority).toBe('PROPOSAL_ONLY');
	});

	it('rejects a tampered manifest and oversized diagnosis context', () => {
		const tampered = { ...manifest, identityInput: { ...manifest.identityInput, retrievalPolicyRevision: 'changed' } };
		expect(() => buildDspyRepairRequestV1(tampered, {})).toThrow('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_INVALID');
		expect(() => buildDspyRepairRequestV1(manifest, { diagnosisContext: 'x'.repeat(32_001) })).toThrow();
	});

	it('rejects malformed serialized requests and duplicate evidence references', () => {
		expect(() => parseDspyRepairRequestV1('{')).toThrow('DSPY_REPAIR_REQUEST_INVALID_JSON');
		const duplicated = buildContextManifestV2({
			...manifest.v1,
			evidenceRefs: ['source:one', 'source:one'],
		}, manifest.identityInput);
		expect(() => buildDspyRepairRequestV1(duplicated, {})).toThrow('CONTEXT_MANIFEST_EVIDENCE_ALLOWLIST_INVALID');
	});

	it('serializes an absent diagnosis context as explicit null for cross-language parity', () => {
		const request = buildDspyRepairRequestV1(manifest, {});
		expect(parseDspyRepairRequestV1(serializeDspyRepairRequestV1(request)).diagnosisContext).toBeNull();
	});

	it('rejects duplicate allowlist identities', () => {
		const duplicated = buildContextManifestV2({
			...manifest.v1,
			selectedNodeKeys: ['symbol:one', 'symbol:one'],
		}, manifest.identityInput);
		expect(() => buildDspyRepairRequestV1(duplicated, {})).toThrow('CONTEXT_MANIFEST_TARGET_ALLOWLIST_INVALID');
	});
});

describe('P20 fixture handoff', () => {
	it('validates tool arguments, exact source span, proposal allowlists, and manifest readback', () => {
		const toolSchema = z.object({ query: z.string().trim().min(1), limit: z.number().int().min(1).max(50) }).strict();
		const toolArguments = toolSchema.parse({ query: 'repair type mismatch', limit: 3 });
		const sourceBytes = Buffer.from('export function requiresEvidence(value: string) { return value; }', 'utf8');
		const sourceRef = 'src/fixture.ts';
		const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
		const workspaceRevision = `sha256:${'a'.repeat(64)}`;
		const tokenBytes = Buffer.from('requiresEvidence', 'utf8');
		const startByte = sourceBytes.indexOf(tokenBytes);
		const endByte = startByte + tokenBytes.length;
		const observedSpan = sourceBytes.subarray(startByte, endByte);
		expect(observedSpan.toString('utf8')).toBe('requiresEvidence');
		expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(sourceRevision.slice(7));
		const spanRef = `source:${sourceRef}:${sourceRevision}:${workspaceRevision}:${startByte}-${endByte}:${createHash('sha256').update(observedSpan).digest('hex')}`;
		const fixtureManifest = buildContextManifestV2({
			schema: 'atlas.context-manifest.v1',
			requestId: 'p20-fixture-request',
			snapshotId: 'p20-fixture-snapshot',
			graphRevision: 'fixture-graph-r1',
			query: toolArguments.query,
			candidateBucket: 8,
			candidateCount: 1,
			tokenBudget: 512,
			selectedNodeKeys: ['symbol:requiresEvidence'],
			evidenceRefs: [spanRef],
			producerRevision: 'fixture-only',
		}, {
			selectedOrdinalSetChecksum: 'fixture-ordinal-set',
			evidenceRevisions: {
				sourceRevision,
				representationRevision: null,
				featureRevision: null,
				ontologyRevision: null,
				modelRevision: null,
				promptTemplateRevision: 'fixture-prompt-r1',
			},
			ordinalMapChecksum: 'fixture-ordinal-map',
			retrievalPolicyRevision: 'fixture-retrieval-r1',
			acePlaybookRevision: 'fixture-playbook-r1',
		});
		const request = buildDspyRepairRequestV1(fixtureManifest, { diagnosisContext: `workspace=${workspaceRevision}` });
		const proposal = parseDspyRepairOutputV1({
			schema: 'atlas.dspy-repair-output.v1',
			contextManifestChecksum: request.contextManifestChecksum,
			diagnosis: 'The function parameter is too broad.',
			targetCandidates: request.allowedTargetCandidateIds,
			patchPlan: 'Narrow the parameter type after checking callers.',
			validationPlan: 'Run the fixture typecheck and focused tests.',
			evidenceRefs: request.allowedEvidenceRefs,
		}, fixtureManifest);
		expect(proposal.evidenceRefs).toEqual([spanRef]);
		expect(proposal.targetCandidates).toEqual(['symbol:requiresEvidence']);
		const readback = ContextManifestV2Schema.parse(JSON.parse(JSON.stringify(fixtureManifest)));
		expect(buildContextManifestV2(readback.v1, readback.identityInput).identityChecksum).toBe(readback.identityChecksum);
		expect(request.authority).toBe('PROPOSAL_ONLY');
	});
});
