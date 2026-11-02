import { z } from 'zod';
import { EvidenceClaimV1Schema } from './evidence-claim-v1.js';
import { VERIFIED_TOOL_REGISTRY_V1 } from '../../atlas/evals/ornith-tool-call-guard-v1.js';

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const boundedRef = z.string().trim().min(1).max(512);
const claimIds = z.array(z.string().uuid()).max(128);
const registeredToolName = z.string().min(1).refine(
	(name) => Object.hasOwn(VERIFIED_TOOL_REGISTRY_V1, name),
	'RLM_TOOL_NOT_IN_VERIFIED_ALLOWLIST',
);

export const BoundedRlmExecutionPlanV1Schema = z.object({
	schema: z.literal('atlas.bounded-rlm-execution-plan.v1'),
	status: z.literal('PLAN_ONLY'),
	maxDepth: z.number().int().min(0).max(3),
	maxWallMs: z.number().int().positive().max(120_000),
	maxWorkingSetBytes: z.number().int().positive().max(268_435_456),
	maxToolCalls: z.number().int().min(1).max(5),
	allowedTools: z.array(registeredToolName).min(1).max(3),
	credentialScope: z.literal('READ_ONLY_REQUIRED'),
	writesAllowed: z.literal(false),
	executionStarted: z.literal(false),
	resourceMeasurement: z.literal('NOT_MEASURED'),
	canonicalAuthority: z.literal(false),
}).strict().superRefine((plan, refinement) => {
	if (new Set(plan.allowedTools).size !== plan.allowedTools.length) {
		refinement.addIssue({ code: 'custom', path: ['allowedTools'], message: 'RLM_TOOL_ALLOWLIST_DUPLICATE' });
	}
});

export const AgenticEvidenceSourceRefV1Schema = z.object({
	sourceId: boundedRef,
	sourceRevision: sha256,
	sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const AgenticEvidenceContextV1Schema = z.object({
	caseId: z.string().uuid().nullable(),
	workspaceRevision: z.string().max(512).nullable(),
	sources: z.array(AgenticEvidenceSourceRefV1Schema).min(1).max(128),
	claims: z.array(EvidenceClaimV1Schema).max(128),
}).strict().superRefine((context, refinement) => {
	const sourceById = new Map(context.sources.map((source) => [source.sourceId, source]));
	if (sourceById.size !== context.sources.length) {
		refinement.addIssue({ code: 'custom', path: ['sources'], message: 'DUPLICATE_SOURCE_ID' });
	}
	for (const [index, claim] of context.claims.entries()) {
		const source = sourceById.get(claim.sourceId);
		if (!source || source.sourceRevision !== claim.sourceRevision || source.sourceSha256 !== claim.sourceSha256) {
			refinement.addIssue({ code: 'custom', path: ['claims', index], message: 'CLAIM_SOURCE_BINDING_MISMATCH' });
		}
		if (claim.caseId !== context.caseId || claim.workspaceRevision !== context.workspaceRevision) {
			refinement.addIssue({ code: 'custom', path: ['claims', index], message: 'CLAIM_CONTEXT_BINDING_MISMATCH' });
		}
	}
});

const proposalState = z.enum(['PROPOSED', 'UNVERIFIED', 'BLOCKED']);

export const InvestigatorInputV1Schema = z.object({
	schema: z.literal('atlas.agentic-investigator-input.v1'),
	context: AgenticEvidenceContextV1Schema,
}).strict();

export const InvestigatorOutputV1Schema = z.object({
	schema: z.literal('atlas.agentic-investigator-output.v1'),
	role: z.literal('INVESTIGATOR'),
	status: proposalState,
	claimIds: claimIds,
	unresolvedSourceRefs: z.array(boundedRef).max(128),
	blockers: z.array(z.string().trim().min(1).max(240)).max(16),
	canonicalAuthority: z.literal(false),
}).strict();

const plannerStep = z.object({
	stepId: z.string().uuid(),
	action: z.enum(['RETRIEVE_EVIDENCE', 'REQUEST_CLARIFICATION', 'REVIEW_TAXONOMY', 'RUN_APPROVED_TEST']),
	claimIds,
	rationale: z.string().trim().min(1).max(500),
}).strict();

export const PlannerInputV1Schema = z.object({
	schema: z.literal('atlas.agentic-planner-input.v1'),
	context: AgenticEvidenceContextV1Schema,
	investigator: InvestigatorOutputV1Schema,
	maxSteps: z.number().int().min(1).max(16),
}).strict().superRefine((input, refinement) => {
	const allowedClaims = new Set(input.context.claims.map((claim) => claim.claimId));
	if (input.investigator.claimIds.some((claimId) => !allowedClaims.has(claimId))) {
		refinement.addIssue({ code: 'custom', path: ['investigator', 'claimIds'], message: 'INVESTIGATOR_CLAIM_NOT_IN_CONTEXT' });
	}
});

export const PlannerOutputV1Schema = z.object({
	schema: z.literal('atlas.agentic-planner-output.v1'),
	role: z.literal('PLANNER'),
	status: proposalState,
	steps: z.array(plannerStep).max(16),
	blockers: z.array(z.string().trim().min(1).max(240)).max(16),
	admission: z.literal('PROPOSAL_ONLY'),
	canonicalAuthority: z.literal(false),
}).strict().superRefine((output, refinement) => {
	const stepIds = output.steps.map((step) => step.stepId);
	if (new Set(stepIds).size !== stepIds.length) {
		refinement.addIssue({ code: 'custom', path: ['steps'], message: 'DUPLICATE_PLAN_STEP_ID' });
	}
	if (output.status === 'BLOCKED' && output.steps.length > 0) {
		refinement.addIssue({ code: 'custom', path: ['steps'], message: 'BLOCKED_PLAN_MUST_NOT_CONTAIN_ACTIONS' });
	}
});

export const VerifierInputV1Schema = z.object({
	schema: z.literal('atlas.agentic-verifier-input.v1'),
	context: AgenticEvidenceContextV1Schema,
	plan: PlannerOutputV1Schema,
	checkIds: z.array(boundedRef).max(16),
}).strict().superRefine((input, refinement) => {
	const allowedClaims = new Set(input.context.claims.map((claim) => claim.claimId));
	for (const [stepIndex, step] of input.plan.steps.entries()) {
		if (step.claimIds.some((claimId) => !allowedClaims.has(claimId))) {
			refinement.addIssue({ code: 'custom', path: ['plan', 'steps', stepIndex, 'claimIds'], message: 'PLAN_CLAIM_NOT_IN_CONTEXT' });
		}
	}
});

export const VerifierOutputV1Schema = z.object({
	schema: z.literal('atlas.agentic-verifier-output.v1'),
	role: z.literal('VERIFIER'),
	status: z.enum(['UNVERIFIED', 'BLOCKED']),
	reviewedClaimIds: z.array(z.string().uuid()).max(128),
	receiptId: z.null(),
	blockers: z.array(z.string().trim().min(1).max(240)).max(16),
	canonicalAuthority: z.literal(false),
}).strict();

export const AdmissionControllerInputV1Schema = z.object({
	schema: z.literal('atlas.agentic-admission-input.v1'),
	plan: PlannerOutputV1Schema,
	verifier: VerifierOutputV1Schema,
}).strict();

export const AdmissionControllerOutputV1Schema = z.object({
	schema: z.literal('atlas.agentic-admission-output.v1'),
	role: z.literal('ADMISSION_CONTROLLER'),
	status: z.enum(['PROPOSAL_ONLY', 'BLOCKED']),
	proposalStepIds: z.array(z.string().uuid()).max(16),
	blockers: z.array(z.string().trim().min(1).max(240)).max(16),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();

export const AdmissionControllerDecisionV1Schema = z.object({
	input: AdmissionControllerInputV1Schema,
	output: AdmissionControllerOutputV1Schema,
}).strict().superRefine((decision, refinement) => {
	const plannedStepIds = new Set(decision.input.plan.steps.map((step) => step.stepId));
	if (decision.output.proposalStepIds.some((stepId) => !plannedStepIds.has(stepId))) {
		refinement.addIssue({ code: 'custom', path: ['output', 'proposalStepIds'], message: 'ADMISSION_STEP_NOT_IN_PLAN' });
	}
	if (decision.input.plan.status === 'BLOCKED' || decision.input.verifier.status === 'BLOCKED') {
		if (decision.output.status !== 'BLOCKED' || decision.output.proposalStepIds.length > 0) {
			refinement.addIssue({ code: 'custom', path: ['output'], message: 'BLOCKED_INPUT_CANNOT_YIELD_PROPOSAL_STEPS' });
		}
	}
});

export type AgenticEvidenceContextV1 = z.infer<typeof AgenticEvidenceContextV1Schema>;
export type BoundedRlmExecutionPlanV1 = z.infer<typeof BoundedRlmExecutionPlanV1Schema>;
export type InvestigatorInputV1 = z.infer<typeof InvestigatorInputV1Schema>;
export type InvestigatorOutputV1 = z.infer<typeof InvestigatorOutputV1Schema>;
export type PlannerInputV1 = z.infer<typeof PlannerInputV1Schema>;
export type PlannerOutputV1 = z.infer<typeof PlannerOutputV1Schema>;
export type VerifierInputV1 = z.infer<typeof VerifierInputV1Schema>;
export type VerifierOutputV1 = z.infer<typeof VerifierOutputV1Schema>;
export type AdmissionControllerInputV1 = z.infer<typeof AdmissionControllerInputV1Schema>;
export type AdmissionControllerOutputV1 = z.infer<typeof AdmissionControllerOutputV1Schema>;
export type AdmissionControllerDecisionV1 = z.infer<typeof AdmissionControllerDecisionV1Schema>;
