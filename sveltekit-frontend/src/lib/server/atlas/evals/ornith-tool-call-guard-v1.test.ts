import { describe, expect, it } from 'vitest';
import { validateOrnithToolCallsV1 } from './ornith-tool-call-guard-v1.js';
import { buildContextManifestV2 } from '../graph/context-manifest-v2.js';

describe('ornith-tool-call-guard-v1', () => {
	const sampleManifest = buildContextManifestV2({
		schema: 'atlas.context-manifest.v1',
		requestId: 'request-001',
		snapshotId: 'snapshot-001',
		graphRevision: 'graph:1',
		query: 'inspect the feature',
		candidateBucket: 1,
		candidateCount: 1,
		tokenBudget: 256,
		selectedNodeKeys: ['cand-001'],
		evidenceRefs: ['file:///src/feature.ts#line10'],
		producerRevision: 'producer:1',
	}, {
		selectedOrdinalSetChecksum: 'selected:1',
		evidenceRevisions: {
			sourceRevision: 'source:1',
			representationRevision: 'representation:1',
			featureRevision: 'feature:1',
			ontologyRevision: 'ontology:1',
			modelRevision: 'model:1',
			promptTemplateRevision: 'prompt:1',
		},
		ordinalMapChecksum: 'ordinal-map:1',
		retrievalPolicyRevision: 'retrieval:1',
		acePlaybookRevision: 'ace:1',
	});

	it('validates a registered tool call with valid schema and allowed manifest ref', () => {
		const rawCalls = [
			{
				id: 'call-1',
				type: 'function',
				function: {
					name: 'read_evidence',
					arguments: JSON.stringify({
						evidenceRef: 'file:///src/feature.ts#line10',
						maxLines: 50,
					}),
				},
			},
		];

		const validated = validateOrnithToolCallsV1(rawCalls, sampleManifest);
		expect(validated).toHaveLength(1);
		expect(validated[0].name).toBe('read_evidence');
		expect(validated[0].parsedArguments.evidenceRef).toBe('file:///src/feature.ts#line10');
		expect(validated[0].validatedAgainstManifest).toBe(true);
	});

	it('rejects unregistered tool calls fail-closed', () => {
		const rawCalls = [
			{
				id: 'call-2',
				type: 'function',
				function: {
					name: 'drop_database_table',
					arguments: JSON.stringify({ table: 'users' }),
				},
			},
		];

		expect(() => validateOrnithToolCallsV1(rawCalls, sampleManifest)).toThrow(
			"UNREGISTERED_TOOL_CALL: 'drop_database_table'",
		);
	});

	it('rejects evidence refs outside the supplied ContextManifest allowlist', () => {
		const rawCalls = [
			{
				id: 'call-3',
				type: 'function',
				function: {
					name: 'read_evidence',
					arguments: JSON.stringify({
						evidenceRef: 'file:///src/secret/passwords.ts',
					}),
				},
			},
		];

		expect(() => validateOrnithToolCallsV1(rawCalls, sampleManifest)).toThrow(
			'TOOL_CALL_EVIDENCE_REF_OUTSIDE_MANIFEST',
		);
	});

	it('rejects any evidence reference when the manifest allowlist is empty', () => {
		const emptyManifest = buildContextManifestV2({
			schema: 'atlas.context-manifest.v1',
			requestId: 'request-empty',
			snapshotId: 'snapshot-empty',
			query: 'empty evidence fixture',
			candidateBucket: 1,
			candidateCount: 0,
			tokenBudget: 256,
			selectedNodeKeys: [],
			evidenceRefs: [],
			producerRevision: 'producer:1',
		}, {
			selectedOrdinalSetChecksum: 'selected:empty',
			evidenceRevisions: {
				sourceRevision: null,
				representationRevision: null,
				featureRevision: null,
				ontologyRevision: null,
				modelRevision: null,
				promptTemplateRevision: null,
			},
			ordinalMapChecksum: 'ordinal-map:empty',
			retrievalPolicyRevision: 'retrieval:1',
			acePlaybookRevision: 'ace:1',
		});
		const rawCalls = [{
			id: 'call-empty',
			type: 'function',
			function: {
				name: 'read_evidence',
				arguments: JSON.stringify({ evidenceRef: 'file:///src/secret.ts' }),
			},
		}];

		expect(() => validateOrnithToolCallsV1(rawCalls, emptyManifest)).toThrow(
			'TOOL_CALL_EVIDENCE_REF_OUTSIDE_MANIFEST',
		);
	});

	it('rejects a tampered ContextManifest checksum before tool validation', () => {
		const tampered = { ...sampleManifest, identityChecksum: '0'.repeat(64) };

		expect(() => validateOrnithToolCallsV1([], tampered)).toThrow(
			'CONTEXT_MANIFEST_IDENTITY_CHECKSUM_MISMATCH',
		);
	});

	it('enforces maximum call budget per turn', () => {
		const rawCalls = Array.from({ length: 6 }, (_, i) => ({
			id: `call-${i}`,
			type: 'function',
			function: {
				name: 'read_evidence',
				arguments: JSON.stringify({ evidenceRef: 'file:///src/feature.ts#line10' }),
			},
		}));

		expect(() =>
			validateOrnithToolCallsV1(rawCalls, sampleManifest, { maxToolCalls: 5 }),
		).toThrow('TOOL_CALL_COUNT_BUDGET_EXCEEDED');
	});

	it('enforces RLM recursion depth bounds (ENG-ML-OPT-22)', () => {
		const rawCalls = [
			{
				id: 'call-1',
				type: 'function',
				function: {
					name: 'read_evidence',
					arguments: JSON.stringify({ evidenceRef: 'file:///src/feature.ts#line10' }),
				},
			},
		];

		expect(() =>
			validateOrnithToolCallsV1(rawCalls, sampleManifest, {
				currentDepth: 4,
				maxRecursionDepth: 3,
			}),
		).toThrow('RLM_RECURSION_DEPTH_EXCEEDED');
	});
});
