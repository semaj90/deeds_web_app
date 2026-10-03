import { describe, expect, it } from 'vitest';
import { buildPolicyStateVector } from './policy-state';
import { routePolicy } from './policy-router';
import { buildPolicyDecisionReceiptV1, policyDecisionReceiptV1Schema, type PolicyInputRevisionV1 } from './policy-decision-receipt-v1';
import type { PolicyStateInput } from './policy-types';

const digest = (letter: string) => letter.repeat(64);

function state(): PolicyStateInput {
	return {
		okf: { naiveBayesScore: 0.5, logisticRegressionScore: 0.8, fitMargin: 0.3, decision: 'ACCEPT' },
		hmm: { stateHint: 'TRACE' },
		retrieval: { bestCosine: 0.7, cosineMargin: 0.15, lexicalHitCount: 5, rrfConfidence: 0.8 },
		structural: { astEvidence: 0.8, symbolMatch: 1, exactPathMatch: 0 },
		graph: { seedCount: 4, shortestPathAvailable: true, communityAgreement: 0.7, authority: 1, hopBudgetRemaining: 2 },
		execution: { compileFailed: false, testFailed: false, retryCount: 0, historicalSuccess: 0.5 },
		resource: { vramPressure: 0.2, contextPressure: 0.2, latencyPressure: 0.2, cacheHitRatio: 0.5 },
	};
}

async function collectInCompletionOrder(delays: readonly number[]): Promise<PolicyInputRevisionV1[]> {
	const collected: PolicyInputRevisionV1[] = [];
	await Promise.all(delays.map((delay, index) => new Promise<void>((resolve) => {
		setTimeout(() => {
			collected.push({ inputId: `input-${index}`, revision: `r${index + 1}`, checksum: digest(String.fromCharCode(97 + index)) });
			resolve();
		}, delay);
	})));
	return collected;
}

describe('policy decision receipt v1', () => {
	it('is invariant to asynchronous input completion order for the same revision-bound inputs', async () => {
		const policyState = buildPolicyStateVector(state());
		const firstInputs = await collectInCompletionOrder([1, 8, 3]);
		const secondInputs = await collectInCompletionOrder([8, 1, 3]);
		const first = buildPolicyDecisionReceiptV1({ state: policyState, decision: routePolicy(policyState), policyRevision: 'weights:baseline-v1', inputRevisions: firstInputs });
		const second = buildPolicyDecisionReceiptV1({ state: policyState, decision: routePolicy(policyState), policyRevision: 'weights:baseline-v1', inputRevisions: secondInputs });

		expect(first.inputRevisions.map((input) => input.inputId)).toEqual(['input-0', 'input-1', 'input-2']);
		expect(first.checksum).toBe(second.checksum);
		expect(first.decisionChecksum).toBe(second.decisionChecksum);
		expect(first.writesPerformed).toBe(false);
		expect(first.canonicalAuthority).toBe(false);
	});

	it('changes identity when any upstream input revision/checksum changes', () => {
		const policyState = buildPolicyStateVector(state());
		const decision = routePolicy(policyState);
		const inputs = [{ inputId: 'query', revision: 'query:r1', checksum: digest('a') }];
		const first = buildPolicyDecisionReceiptV1({ state: policyState, decision, policyRevision: 'weights:v1', inputRevisions: inputs });
		const changedInput = buildPolicyDecisionReceiptV1({ state: policyState, decision, policyRevision: 'weights:v1', inputRevisions: [{ ...inputs[0]!, revision: 'query:r2' }] });
		const changedPolicy = buildPolicyDecisionReceiptV1({ state: policyState, decision, policyRevision: 'weights:v2', inputRevisions: inputs });
		expect(first.checksum).not.toBe(changedInput.checksum);
		expect(first.checksum).not.toBe(changedPolicy.checksum);
	});

	it('rejects duplicate input identities and mismatched state hints', () => {
		const policyState = buildPolicyStateVector(state());
		const decision = routePolicy(policyState);
		const duplicate = [
			{ inputId: 'query', revision: 'r1', checksum: digest('a') },
			{ inputId: 'query', revision: 'r2', checksum: digest('b') },
		];
		expect(() => buildPolicyDecisionReceiptV1({ state: policyState, decision, policyRevision: 'weights:v1', inputRevisions: duplicate })).toThrow('POLICY_RECEIPT_DUPLICATE_INPUT');
		expect(() => buildPolicyDecisionReceiptV1({ state: policyState, decision: { ...decision, stateHint: 'LOCATE' }, policyRevision: 'weights:v1', inputRevisions: [] })).toThrow('POLICY_RECEIPT_STATE_HINT_MISMATCH');
		const valid = buildPolicyDecisionReceiptV1({ state: policyState, decision, policyRevision: 'weights:v1', inputRevisions: [] });
		expect(policyDecisionReceiptV1Schema.safeParse({ ...valid, decision: { ...valid.decision, action: 'TERMINATE' } }).success).toBe(false);
	});
});
