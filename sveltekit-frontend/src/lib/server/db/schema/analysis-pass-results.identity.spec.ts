import { describe, expect, it } from 'vitest';
import {
	buildStagedAnalysisPassObservationV1,
	buildStagedAnalysisPassLedgerEntryV1,
	buildAnalysisPassIdempotencyKey,
	buildAnalysisPassIdentityHash,
	buildNlpStagingCohortV1,
	classifyAnalysisPassAdmissionV1,
	resolveExecutionSemantics,
	verifyNlpStagingCohortV1,
	verifyAnalysisPassAdmissionEnvelopeV1,
	type AnalysisPassLedgerInput,
} from './analysis-pass-results.ts';

const baseInput: AnalysisPassLedgerInput = {
	analysisJobId: 'job-a',
	evidenceId: 'evidence-a',
	jobType: 'entity_extraction',
	packetKey: 'packet-a',
	sourceRef: 'src/a.ts',
	sourceRevision: 'source-rev-a',
	family: 'linguistic',
	passName: 'ast_symbols',
	passRevision: 'ast-symbols-v1',
	backend: 'native-ts',
	backendVersion: 'fixture-v1',
	device: 'cpu',
	status: 'succeeded',
	startedAt: '2026-09-27T00:00:00.000Z',
	completedAt: '2026-09-27T00:00:01.000Z',
};

const packetIdentity = {
	suppliedPacketKey: 'packet-a',
	resolvedStoragePacketKey: 'packet-a',
} as const;

const verifiedPacketIdentity = {
	canonicalPacketKey: 'packet:00000000-0000-5000-8000-000000000001',
	storagePacketKey: 'packet:00000000-0000-5000-8000-000000000001',
	resolutionSource: 'V2_DIRECT',
	aliasEvidenceVersion: null,
} as const;

describe('analysis pass identity/execution contract', () => {
	it('separates execution-scoped keys from stable logical pass identity', () => {
		const first = { ...baseInput, inputHash: 'stable-input-v1' };
		const retryFromAnotherJob = {
			...first,
			analysisJobId: 'job-b',
			evidenceId: 'evidence-b',
		};

		expect(buildAnalysisPassIdempotencyKey(first)).not.toBe(
			buildAnalysisPassIdempotencyKey(retryFromAnotherJob),
		);
		expect(buildAnalysisPassIdentityHash(first)).toBe(
			buildAnalysisPassIdentityHash(retryFromAnotherJob),
		);
		expect(buildAnalysisPassIdentityHash(baseInput)).toBeNull();
	});

	it('keeps deterministic, stochastic-history, and observed-event semantics distinct', () => {
		expect(resolveExecutionSemantics('ast_symbols')).toBe('deterministic_idempotent');
		expect(resolveExecutionSemantics('spacy_entities')).toBe('deterministic_idempotent');
		expect(resolveExecutionSemantics('summarization')).toBe('stochastic_history');
		expect(resolveExecutionSemantics('tool_execution')).toBe('observed_event');
		expect(resolveExecutionSemantics('unclassified_pass')).toBe('observed_event');
	});

	it('keeps successful execution separate from candidate-only admission and preserves missing revisions', () => {
		const input = {
			...baseInput,
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
			packetKey: ' packet-a ',
			sourceRevision: null,
			workspaceRevision: null,
			payload: { concepts: ['candidate'] },
		};
		const staged = buildStagedAnalysisPassObservationV1(input, packetIdentity);

		expect(staged).toMatchObject({
			packetKey: packetIdentity.resolvedStoragePacketKey,
			resolvedStoragePacketKey: packetIdentity.resolvedStoragePacketKey,
			packetIdentityResolution: 'DIRECT_STORAGE_ROW',
			sourceRevision: null,
			workspaceRevision: null,
			executionStatus: 'succeeded',
			admissionDisposition: 'CANDIDATE_ONLY',
			declaredInputHash: null,
			canonicalAuthority: false,
			writesCanonicalState: false,
		});
		expect(staged.ledgerInputChecksum).toMatch(/^[a-f0-9]{64}$/);
		expect(staged.outputChecksum).toMatch(/^[a-f0-9]{64}$/);
		expect(buildStagedAnalysisPassObservationV1(input, packetIdentity)).toEqual(staged);
	});

	it('does not fall back from a missing packet key to evidence identity', () => {
		expect(() => buildStagedAnalysisPassObservationV1({
			...baseInput,
			packetKey: null,
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
		}, packetIdentity)).toThrow('STAGED_ANALYSIS_PASS_PACKET_KEY_REQUIRED');
	});

	it('rejects a packet key that does not match its resolved canonical or storage identity', () => {
		expect(() => buildStagedAnalysisPassObservationV1({
			...baseInput,
			packetKey: 'packet-unrelated',
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
		}, packetIdentity)).toThrow('STAGED_ANALYSIS_PASS_PACKET_IDENTITY_MISMATCH');
	});

	it('does not classify skipped or failed executions as staged observations', () => {
		for (const status of ['skipped', 'failed'] as const) {
			expect(() => buildStagedAnalysisPassObservationV1({
				...baseInput,
				producerId: 'nlp-sidecar',
				producerRevision: 'nlp-sidecar-v1',
				status,
			}, packetIdentity)).toThrow('STAGED_ANALYSIS_PASS_EXECUTION_NOT_SUCCEEDED');
		}
	});

	it('requires explicit producer identity before emitting staged observations', () => {
		expect(() => buildStagedAnalysisPassObservationV1(baseInput, packetIdentity)).toThrow(
			'STAGED_ANALYSIS_PASS_PROVENANCE_REQUIRED',
		);
	});

	it('stores candidate-only admission in ledger provenance without changing execution status', () => {
		const row = buildStagedAnalysisPassLedgerEntryV1({
			...baseInput,
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
			sourceRevision: null,
			workspaceRevision: null,
		}, packetIdentity);
		const provenance = row.provenance as Record<string, unknown>;

		expect(row.status).toBe('succeeded');
		expect(row.packetKey).toBe(baseInput.packetKey);
		expect(provenance.stagedObservation).toMatchObject({
			admissionDisposition: 'CANDIDATE_ONLY',
			canonicalAuthority: false,
			writesCanonicalState: false,
			resolvedStoragePacketKey: packetIdentity.resolvedStoragePacketKey,
			sourceRevision: null,
			workspaceRevision: null,
		});
	});

	it('keeps staged input identity stable across job IDs and execution timestamps', () => {
		const first = {
			...baseInput,
			inputHash: 'qualified-nlp-input-v1',
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
			payload: { entities: ['A'] },
		};
		const retry = {
			...first,
			analysisJobId: 'job-retry',
			evidenceId: 'evidence-retry',
			startedAt: '2026-10-03T01:00:00.000Z',
			completedAt: '2026-10-03T01:00:01.000Z',
		};

		expect(buildStagedAnalysisPassObservationV1(first, packetIdentity)).toEqual(
			buildStagedAnalysisPassObservationV1(retry, packetIdentity),
		);
	});
});

describe('analysis pass pure admission envelope', () => {
	const qualifiedInput: AnalysisPassLedgerInput = {
		...baseInput,
		packetKey: verifiedPacketIdentity.canonicalPacketKey,
		sourceRef: 'src/a.ts',
		sourceRevision: 'sha256:source-a',
		workspaceRevision: 'sha256:workspace-a',
		producerRevision: 'sidecar-v1',
		inputHash: 'sha256:input-a',
		outputHash: 'sha256:output-a',
		evidence: [{
			sourceRef: 'src/a.ts',
			sourceRevision: 'sha256:source-a',
			startByte: 0,
			endByte: 4,
			excerpt: 'fact',
		}],
	};

	it('marks successful exact lineage and grounded spans eligible for review only', () => {
		const envelope = classifyAnalysisPassAdmissionV1(qualifiedInput, { packetIdentityResolution: verifiedPacketIdentity });

		expect(envelope.admissionState).toBe('ELIGIBLE_FOR_REVIEW');
		expect(envelope.lineageQualified).toBe(true);
		expect(envelope.evidenceQualified).toBe(true);
		expect(envelope.canonicalAuthority).toBe(false);
		expect(envelope.persistenceAuthorized).toBe(false);
	});

	it('keeps missing packet identity null even when the evidence ID looks like a packet key', () => {
		const envelope = classifyAnalysisPassAdmissionV1({
			...qualifiedInput,
			packetKey: null,
			evidenceId: 'packet:abc',
		});

		expect(envelope.packetKey).toBeNull();
		expect(envelope.admissionState).toBe('OBSERVATION_ONLY');
		expect(envelope.reasons).toContain('MISSING_PACKET_KEY');
	});

	it('keeps a supplied but unverified packet key observation-only', () => {
		const envelope = classifyAnalysisPassAdmissionV1(qualifiedInput);

		expect(envelope.packetKey).toBe(qualifiedInput.packetKey);
		expect(envelope.lineageQualified).toBe(false);
		expect(envelope.reasons).toContain('IDENTITY_FALLBACK_FORBIDDEN');
	});

	it('does not treat a bare ordinal as packet identity', () => {
		const envelope = classifyAnalysisPassAdmissionV1({ ...qualifiedInput, packetKey: '42' });

		expect(envelope.packetKey).toBe('42');
		expect(envelope.admissionState).toBe('OBSERVATION_ONLY');
		expect(envelope.reasons).toContain('INVALID_PACKET_KEY');
	});

	it('rejects a resolver result that does not correspond to the explicit packet key', () => {
		const envelope = classifyAnalysisPassAdmissionV1(qualifiedInput, {
			packetIdentityResolution: {
				...verifiedPacketIdentity,
				canonicalPacketKey: 'packet:00000000-0000-5000-8000-000000000002',
				storagePacketKey: 'packet:00000000-0000-5000-8000-000000000002',
			},
		});

		expect(envelope.packetKey).toBe(qualifiedInput.packetKey);
		expect(envelope.admissionState).toBe('OBSERVATION_ONLY');
		expect(envelope.reasons).toContain('IDENTITY_FALLBACK_FORBIDDEN');
	});

	it('preserves a missing source revision as null and observation-only', () => {
		const envelope = classifyAnalysisPassAdmissionV1({
			...qualifiedInput,
			sourceRevision: null,
		});

		expect(envelope.sourceRevision).toBeNull();
		expect(envelope.admissionState).toBe('OBSERVATION_ONLY');
		expect(envelope.reasons).toContain('MISSING_SOURCE_REVISION');
	});

	it('rejects failed execution even when the rest of the envelope is complete', () => {
		const envelope = classifyAnalysisPassAdmissionV1({ ...qualifiedInput, status: 'failed' }, {
			packetIdentityResolution: verifiedPacketIdentity,
		});

		expect(envelope.admissionState).toBe('REJECTED');
		expect(envelope.reasons).toContain('EXECUTION_NOT_SUCCEEDED');
	});

	it('keeps grounded evidence observation-only when required identity is incomplete', () => {
		const envelope = classifyAnalysisPassAdmissionV1({
			...qualifiedInput,
			workspaceRevision: null,
		}, { packetIdentityResolution: verifiedPacketIdentity });

		expect(envelope.evidenceQualified).toBe(true);
		expect(envelope.admissionState).toBe('OBSERVATION_ONLY');
		expect(envelope.reasons).toContain('MISSING_WORKSPACE_REVISION');
	});

	it('detects envelope tampering', () => {
		const envelope = classifyAnalysisPassAdmissionV1(qualifiedInput, { packetIdentityResolution: verifiedPacketIdentity });

		expect(verifyAnalysisPassAdmissionEnvelopeV1(envelope)).toBe(true);
		expect(verifyAnalysisPassAdmissionEnvelopeV1({ ...envelope, packetKey: 'packet:changed' })).toBe(false);
	});

	it('produces a stable checksum for identical inputs', () => {
		const first = classifyAnalysisPassAdmissionV1(qualifiedInput, { packetIdentityResolution: verifiedPacketIdentity });
		const replay = classifyAnalysisPassAdmissionV1(qualifiedInput, { packetIdentityResolution: verifiedPacketIdentity });

		expect(replay).toEqual(first);
	});
});

describe('NLP staging cohort contract', () => {
	const cohortInput = {
		cohortId: 'nlp-cohort-fixture-v1',
		workspaceRevision: 'sha256:workspace-cohort',
		selectionPolicyRevision: 'packet-source-domain-v1',
		candidates: Array.from({ length: 8 }, (_, index) => {
			const packetKey = `packet:00000000-0000-5000-8000-${String(index + 1).padStart(12, '0')}`;
			return {
				packetKey,
				sourceRef: `src/domain-${index}/file.ts`,
				sourceRevision: index === 3 ? null : `sha256:source-${index}`,
				workspaceRevision: 'sha256:workspace-cohort',
				domainClass: index % 2 === 0 ? 'code' : 'documentation',
				packetIdentityResolution: {
					canonicalPacketKey: packetKey,
					storagePacketKey: packetKey,
					resolutionSource: 'V2_DIRECT' as const,
					aliasEvidenceVersion: null,
				},
			};
		}),
	};

	it('freezes a sorted, checksummed cohort and labels missing source revision partial', () => {
		const cohort = buildNlpStagingCohortV1(cohortInput);

		expect(cohort.packetRefs).toHaveLength(8);
		expect(cohort.packetRefs[3]).toMatchObject({
			sourceRevision: null,
			revisionState: 'REVISION_PARTIAL',
		});
		expect(cohort.packetRefs[0].revisionState).toBe('REVISION_QUALIFIED');
		expect(verifyNlpStagingCohortV1(cohort)).toBe(true);
	});

	it('produces the same cohort checksum independent of candidate input order', () => {
		const first = buildNlpStagingCohortV1(cohortInput);
		const replay = buildNlpStagingCohortV1({
			...cohortInput,
			candidates: [...cohortInput.candidates].reverse(),
		});

		expect(replay).toEqual(first);
	});

	it('rejects an unapproved cohort size', () => {
		expect(() => buildNlpStagingCohortV1({ ...cohortInput, candidates: cohortInput.candidates.slice(0, 7) }))
			.toThrow('NLP_STAGING_COHORT_SIZE_MUST_BE_8_16_OR_32');
	});

	it('rejects members from a different workspace revision', () => {
		const candidates = [...cohortInput.candidates];
		candidates[0] = { ...candidates[0], workspaceRevision: 'sha256:other-workspace' };
		expect(() => buildNlpStagingCohortV1({ ...cohortInput, candidates }))
			.toThrow('NLP_STAGING_COHORT_WORKSPACE_REVISION_MISMATCH');
	});

	it('rejects duplicate logical sources even when packet identities differ', () => {
		const candidates = [...cohortInput.candidates];
		candidates[1] = { ...candidates[1], sourceRef: candidates[0].sourceRef };
		expect(() => buildNlpStagingCohortV1({ ...cohortInput, candidates }))
			.toThrow('NLP_STAGING_COHORT_DUPLICATE_LOGICAL_SOURCE');
	});

	it('rejects a cohort without mixed domain classes', () => {
		const candidates = cohortInput.candidates.map((candidate) => ({ ...candidate, domainClass: 'code' }));
		expect(() => buildNlpStagingCohortV1({ ...cohortInput, candidates }))
			.toThrow('NLP_STAGING_COHORT_DOMAIN_DIVERSITY_REQUIRED');
	});

	it('rejects unresolved or mismatched packet identities', () => {
		const candidates = [...cohortInput.candidates];
		candidates[0] = {
			...candidates[0],
			packetIdentityResolution: {
				...candidates[0].packetIdentityResolution,
				canonicalPacketKey: 'packet:00000000-0000-5000-8000-000000000099',
				storagePacketKey: 'packet:00000000-0000-5000-8000-000000000099',
			},
		};
		expect(() => buildNlpStagingCohortV1({ ...cohortInput, candidates }))
			.toThrow('NLP_STAGING_COHORT_PACKET_IDENTITY_UNRESOLVED');
	});

	it('detects cohort checksum tampering', () => {
		const cohort = buildNlpStagingCohortV1(cohortInput);
		const tampered = { ...cohort, workspaceRevision: 'sha256:changed' };

		expect(verifyNlpStagingCohortV1(cohort)).toBe(true);
		expect(verifyNlpStagingCohortV1(tampered)).toBe(false);
	});
});
