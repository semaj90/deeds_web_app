import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PolicyDecision, PolicyStateVector } from './policy-types';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function checksum(value: unknown): string {
	return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export const policyInputRevisionV1Schema = z.object({
	inputId: z.string().trim().min(1),
	revision: z.string().trim().min(1),
	checksum: sha256,
}).strict();

export const policyDecisionReceiptV1Schema = z.object({
	schema: z.literal('atlas.policy-decision-receipt.v1'),
	policyRevision: z.string().trim().min(1),
	stateRevision: z.string().min(1),
	featureRevision: z.string().min(1),
	stateChecksum: sha256,
	inputRevisions: z.array(policyInputRevisionV1Schema),
	decision: z.object({
		revision: z.literal('parent-atlas.policy-decision.v1'),
		action: z.string().min(1),
		model: z.string().min(1),
		budget: z.string().min(1),
		maxParallelToolCalls: z.number().int().positive(),
		rankedActions: z.array(z.object({ action: z.string().min(1), score: z.number().finite() }).strict()),
		stateHint: z.string().min(1),
	}).strict(),
	decisionChecksum: sha256,
	checksum: sha256,
	writesPerformed: z.literal(false),
	canonicalAuthority: z.literal(false),
}).strict().superRefine((receipt, context) => {
	const expectedDecisionChecksum = checksum({
		policyRevision: receipt.policyRevision,
		stateChecksum: receipt.stateChecksum,
		inputRevisions: receipt.inputRevisions,
		decision: receipt.decision,
	});
	if (receipt.decisionChecksum !== expectedDecisionChecksum) {
		context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionChecksum'], message: 'Decision checksum does not match receipt contents' });
	}
	const { checksum: receiptChecksum, ...body } = receipt;
	if (receiptChecksum !== checksum(body)) {
		context.addIssue({ code: z.ZodIssueCode.custom, path: ['checksum'], message: 'Receipt checksum does not match receipt contents' });
	}
});

export type PolicyInputRevisionV1 = z.infer<typeof policyInputRevisionV1Schema>;
export type PolicyDecisionReceiptV1 = z.infer<typeof policyDecisionReceiptV1Schema>;

/** Seals an already-selected policy decision; this function does not execute tools or write state. */
export function buildPolicyDecisionReceiptV1(input: {
	state: PolicyStateVector;
	decision: PolicyDecision;
	policyRevision: string;
	inputRevisions: readonly PolicyInputRevisionV1[];
}): PolicyDecisionReceiptV1 {
	const policyRevision = input.policyRevision.trim();
	if (!policyRevision) throw new Error('POLICY_RECEIPT_POLICY_REVISION_REQUIRED');
	const inputRevisions = input.inputRevisions.map((item) => policyInputRevisionV1Schema.parse(item))
		.sort((left, right) => left.inputId.localeCompare(right.inputId) || left.revision.localeCompare(right.revision));
	for (let index = 1; index < inputRevisions.length; index += 1) {
		if (inputRevisions[index - 1]?.inputId === inputRevisions[index]?.inputId) {
			throw new Error(`POLICY_RECEIPT_DUPLICATE_INPUT:${inputRevisions[index]?.inputId}`);
		}
	}
	if (input.state.values.length !== input.state.featureCount || input.state.features.length !== input.state.featureCount) {
		throw new Error('POLICY_RECEIPT_STATE_SHAPE_MISMATCH');
	}
	const values = Array.from(input.state.values);
	if (values.some((value) => !Number.isFinite(value))) throw new Error('POLICY_RECEIPT_NONFINITE_STATE');
	if (input.decision.stateHint !== input.state.stateHint) throw new Error('POLICY_RECEIPT_STATE_HINT_MISMATCH');

	const stateBody = {
		revision: input.state.revision,
		featureRevision: input.state.featureRevision,
		featureCount: input.state.featureCount,
		features: [...input.state.features],
		values,
		stateHint: input.state.stateHint,
	};
	const stateChecksum = checksum(stateBody);
	const decisionBody = {
		policyRevision,
		stateChecksum,
		inputRevisions,
		decision: input.decision,
	};
	const decisionChecksum = checksum(decisionBody);
	const body = {
		schema: 'atlas.policy-decision-receipt.v1' as const,
		policyRevision,
		stateRevision: input.state.revision,
		featureRevision: input.state.featureRevision,
		stateChecksum,
		inputRevisions,
		decision: input.decision,
		decisionChecksum,
		writesPerformed: false as const,
		canonicalAuthority: false as const,
	};
	return policyDecisionReceiptV1Schema.parse({ ...body, checksum: checksum(body) });
}
