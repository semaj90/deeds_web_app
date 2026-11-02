import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	BoundedRlmExecutionPlanV1Schema,
	AdmissionControllerInputV1Schema,
	AdmissionControllerDecisionV1Schema,
	AdmissionControllerOutputV1Schema,
	AgenticEvidenceContextV1Schema,
	InvestigatorInputV1Schema,
	InvestigatorOutputV1Schema,
	PlannerInputV1Schema,
	PlannerOutputV1Schema,
	VerifierInputV1Schema,
	VerifierOutputV1Schema,
} from './agentic-workflow-roles-v1.js';

const sourceId = 'evidence:workflow-fixture';
const caseId = '22222222-2222-4222-8222-222222222222';
const workspaceRevision = 'workspace:fixture-1';
const sourceText = 'Witness said yes.';
const sourceBytes = Buffer.from(sourceText, 'utf8');
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const sourceRevision = `sha256:${sourceSha256}`;
const textSourceSha256 = sourceSha256;
const claimId = '11111111-1111-4111-8111-111111111111';
const stepId = '33333333-3333-4333-8333-333333333333';
const spanStart = sourceText.indexOf('yes');

const claim = {
	claimId,
	sourceId,
	sourceSha256,
	sourceRevision,
	workspaceRevision,
	caseId,
	span: {
		startChar: spanStart,
		endChar: spanStart + 3,
		startByte: spanStart,
		endByte: spanStart + 3,
		exactText: 'yes',
		textSourceSha256,
	},
	who: 'Witness',
	relationPredicate: 'said',
	what: 'yes',
	why: '',
	how: '',
	assertion: 'Witness said yes.',
	domainId: null,
	taxonomyId: null,
	observedAt: null,
	validAt: null,
	extraction: {
		provider: 'fixture',
		producerRevision: 'fixture-v1',
		modelId: null,
		outputSha256: sourceSha256,
		method: 'fixture',
		confidence: 1,
		productVersion: 'fixture-v1',
	},
	verificationStatus: 'SOURCE_GROUNDED',
	supportingClaimIds: [],
	contradictingClaimIds: [],
};

const context = {
	caseId,
	workspaceRevision,
	sources: [{ sourceId, sourceRevision, sourceSha256 }],
	claims: [claim],
};

const investigator = {
	schema: 'atlas.agentic-investigator-output.v1',
	role: 'INVESTIGATOR',
	status: 'PROPOSED',
	claimIds: [claimId],
	unresolvedSourceRefs: [],
	blockers: [],
	canonicalAuthority: false,
};

const plan = {
	schema: 'atlas.agentic-planner-output.v1',
	role: 'PLANNER',
	status: 'PROPOSED',
	steps: [{ stepId, action: 'REVIEW_TAXONOMY', claimIds: [claimId], rationale: 'Review the cited claim.' }],
	blockers: [],
	admission: 'PROPOSAL_ONLY',
	canonicalAuthority: false,
};

describe('agentic workflow role contracts', () => {
	it('bounds RLM plans and fails closed on unregistered tools or execution claims', () => {
		const plan = {
			schema: 'atlas.bounded-rlm-execution-plan.v1',
			status: 'PLAN_ONLY',
			maxDepth: 3,
			maxWallMs: 120_000,
			maxWorkingSetBytes: 268_435_456,
			maxToolCalls: 5,
			allowedTools: ['read_evidence', 'query_symbol_facts'],
			credentialScope: 'READ_ONLY_REQUIRED',
			writesAllowed: false,
			executionStarted: false,
			resourceMeasurement: 'NOT_MEASURED',
			canonicalAuthority: false,
		};
		expect(BoundedRlmExecutionPlanV1Schema.safeParse(plan).success).toBe(true);
		expect(BoundedRlmExecutionPlanV1Schema.safeParse({ ...plan, maxDepth: 4 }).success).toBe(false);
		expect(BoundedRlmExecutionPlanV1Schema.safeParse({ ...plan, allowedTools: ['drop_table'] }).success).toBe(false);
		expect(BoundedRlmExecutionPlanV1Schema.safeParse({ ...plan, writesAllowed: true }).success).toBe(false);
		expect(BoundedRlmExecutionPlanV1Schema.safeParse({ ...plan, executionStarted: true }).success).toBe(false);
	});

	it('binds investigator and planner references to validated source claims', () => {
		expect(AgenticEvidenceContextV1Schema.safeParse(context).success).toBe(true);
		expect(InvestigatorInputV1Schema.safeParse({
			schema: 'atlas.agentic-investigator-input.v1', context,
		}).success).toBe(true);
		expect(InvestigatorOutputV1Schema.safeParse(investigator).success).toBe(true);
		expect(InvestigatorOutputV1Schema.safeParse({ ...investigator, status: 'CONFLICTED' }).success).toBe(false);
		expect(PlannerInputV1Schema.safeParse({
			schema: 'atlas.agentic-planner-input.v1', context, investigator, maxSteps: 4,
		}).success).toBe(true);
		expect(PlannerOutputV1Schema.safeParse(plan).success).toBe(true);
	});

	it('rejects claim/source, case, workspace, and plan-reference mismatches', () => {
		expect(AgenticEvidenceContextV1Schema.safeParse({
			...context,
			claims: [{ ...claim, sourceRevision: `sha256:${'0'.repeat(64)}` }],
		}).success).toBe(false);
		expect(AgenticEvidenceContextV1Schema.safeParse({
			...context,
			claims: [{ ...claim, caseId: null }],
		}).success).toBe(false);
		expect(PlannerInputV1Schema.safeParse({
			schema: 'atlas.agentic-planner-input.v1',
			context,
			investigator: { ...investigator, claimIds: ['44444444-4444-4444-8444-444444444444'] },
			maxSteps: 4,
		}).success).toBe(false);
		expect(PlannerOutputV1Schema.safeParse({
			...plan,
			status: 'BLOCKED',
		}).success).toBe(false);
	});

	it('keeps verifier and admission outcomes non-authoritative without independent receipts', () => {
		const verifierInput = {
			schema: 'atlas.agentic-verifier-input.v1',
			context,
			plan,
			checkIds: ['source-readback'],
		};
		expect(VerifierInputV1Schema.safeParse(verifierInput).success).toBe(true);
		const verifier = {
			schema: 'atlas.agentic-verifier-output.v1',
			role: 'VERIFIER',
			status: 'UNVERIFIED',
			reviewedClaimIds: [claimId],
			receiptId: null,
			blockers: ['No independent execution receipt supplied.'],
			canonicalAuthority: false,
		};
		expect(VerifierOutputV1Schema.safeParse(verifier).success).toBe(true);
		expect(VerifierOutputV1Schema.safeParse({ ...verifier, receiptId: 'caller-asserted-pass' }).success).toBe(false);
		expect(AdmissionControllerInputV1Schema.safeParse({
			schema: 'atlas.agentic-admission-input.v1', plan, verifier,
		}).success).toBe(true);
		expect(AdmissionControllerOutputV1Schema.safeParse({
			schema: 'atlas.agentic-admission-output.v1',
			role: 'ADMISSION_CONTROLLER',
			status: 'PROPOSAL_ONLY',
			proposalStepIds: [stepId],
			blockers: ['Independent receipt required before execution.'],
			canonicalAuthority: false,
			writesPerformed: false,
		}).success).toBe(true);
		expect(AdmissionControllerOutputV1Schema.safeParse({
			schema: 'atlas.agentic-admission-output.v1',
			role: 'ADMISSION_CONTROLLER',
			status: 'PROPOSAL_ONLY',
			proposalStepIds: [stepId],
			blockers: [],
			canonicalAuthority: true,
			writesPerformed: false,
		}).success).toBe(false);
		const admissionInput = { schema: 'atlas.agentic-admission-input.v1', plan, verifier };
		const admissionOutput = {
			schema: 'atlas.agentic-admission-output.v1',
			role: 'ADMISSION_CONTROLLER',
			status: 'PROPOSAL_ONLY',
			proposalStepIds: [stepId],
			blockers: ['Independent receipt required before execution.'],
			canonicalAuthority: false,
			writesPerformed: false,
		};
		expect(AdmissionControllerDecisionV1Schema.safeParse({ input: admissionInput, output: admissionOutput }).success).toBe(true);
		expect(AdmissionControllerDecisionV1Schema.safeParse({
			input: admissionInput,
			output: { ...admissionOutput, proposalStepIds: ['44444444-4444-4444-8444-444444444444'] },
		}).success).toBe(false);
	});
});
