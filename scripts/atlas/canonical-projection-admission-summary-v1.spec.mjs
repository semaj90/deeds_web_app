import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_PROJECTION_PREDICATES_V1, summarizeCanonicalProjectionAdmissionV1 } from './canonical-projection-admission-summary-v1.mjs';

const passingPredicates = () => Object.fromEntries(CANONICAL_PROJECTION_PREDICATES_V1.map((gateId) => [gateId, { verdict: 'PASS' }]));

test('summarizes every non-PASS predicate with its evidence details', () => {
	const report = {
		overall_verdict: 'NOT_SAFE_TO_PROJECT',
		predicates: {
			...passingPredicates(),
			IDENTITY_ALIGNED: { verdict: 'PASS' },
			SYMBOLS_RESOLVED: { verdict: 'PARTIAL_PROVEN', note: 'Coverage is incomplete.', coverage: { processed: 9, total: 10 } },
			ACE_EVIDENCE_GROUNDED: { verdict: 'NOT_PROVEN', note: 'No independent receipt readback.' },
		},
	};

	assert.deepEqual(summarizeCanonicalProjectionAdmissionV1(report), {
		verdict: 'NOT_SAFE_TO_PROJECT',
		admitted: false,
		blockingPredicates: [
			{
				gateId: 'SYMBOLS_RESOLVED',
				status: 'PARTIAL_PROVEN',
				blockingReason: 'Coverage is incomplete.',
				details: report.predicates.SYMBOLS_RESOLVED,
			},
			{
				gateId: 'ACE_EVIDENCE_GROUNDED',
				status: 'NOT_PROVEN',
				blockingReason: 'No independent receipt readback.',
				details: report.predicates.ACE_EVIDENCE_GROUNDED,
			},
		],
	});
});

test('returns no blockers when all predicates pass', () => {
	assert.deepEqual(summarizeCanonicalProjectionAdmissionV1({
		overall_verdict: 'SAFE_TO_PROJECT',
		predicates: passingPredicates(),
	}), { verdict: 'SAFE_TO_PROJECT', admitted: true, blockingPredicates: [] });
});

test('fails closed for malformed or missing predicate collections', () => {
	assert.deepEqual(summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'NOT_SAFE_TO_PROJECT' }), {
		verdict: 'NOT_SAFE_TO_PROJECT',
		admitted: false,
		blockingPredicates: [{
			gateId: 'PREDICATE_REPORT',
			status: 'MISSING',
			blockingReason: 'Admission report has no valid predicate collection.',
			details: null,
		}],
	});
	assert.deepEqual(summarizeCanonicalProjectionAdmissionV1(null), {
		verdict: 'MISSING_VERDICT',
		admitted: false,
		blockingPredicates: [{
			gateId: 'PREDICATE_REPORT',
			status: 'MISSING',
			blockingReason: 'Admission report has no valid predicate collection.',
			details: null,
		}],
	});
});

test('fails closed when the overall verdict conflicts with predicate statuses', () => {
	const predicateFailure = summarizeCanonicalProjectionAdmissionV1({
		overall_verdict: 'SAFE_TO_PROJECT',
		predicates: { IDENTITY_ALIGNED: { verdict: 'NOT_PROVEN' } },
	});
	const verdictFailure = summarizeCanonicalProjectionAdmissionV1({
		overall_verdict: 'NOT_SAFE_TO_PROJECT',
		predicates: { IDENTITY_ALIGNED: { verdict: 'PASS' } },
	});
	assert.equal(predicateFailure.admitted, false);
	assert.equal(verdictFailure.admitted, false);
});

test('labels a non-PASS predicate without a note', () => {
	const result = summarizeCanonicalProjectionAdmissionV1({
		overall_verdict: 'NOT_SAFE_TO_PROJECT',
		predicates: { ...passingPredicates(), MISSING_EVIDENCE: { verdict: 'NOT_PROVEN' } },
	});
	assert.equal(result.blockingPredicates[0].blockingReason, 'Predicate did not pass and no explanation was recorded.');
});

test('rejects empty, partial, and malformed required predicates despite a safe verdict', () => {
	for (const predicates of [{}, { IDENTITY_ALIGNED: { verdict: 'PASS' } }]) {
		const result = summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'SAFE_TO_PROJECT', predicates });
		assert.equal(result.admitted, false);
		assert.ok(result.blockingPredicates.some((predicate) => predicate.status === 'MISSING'));
	}
	for (const gateId of CANONICAL_PROJECTION_PREDICATES_V1) {
		const predicates = passingPredicates();
		delete predicates[gateId];
		const result = summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'SAFE_TO_PROJECT', predicates });
		assert.equal(result.admitted, false);
		assert.equal(result.blockingPredicates[0].gateId, gateId);
		predicates[gateId] = null;
		assert.equal(summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'SAFE_TO_PROJECT', predicates }).admitted, false);
	}
});
