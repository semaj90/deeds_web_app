export function summarizeCanonicalProjectionAdmissionV1(report) {
	const predicates = report?.predicates;
	if (!predicates || typeof predicates !== 'object' || Array.isArray(predicates)) {
		return {
			verdict: report?.overall_verdict ?? 'MISSING_VERDICT',
			admitted: false,
			blockingPredicates: [{
				gateId: 'PREDICATE_REPORT',
				status: 'MISSING',
				blockingReason: 'Admission report has no valid predicate collection.',
				details: null,
			}],
		};
	}

	const blockingPredicates = Object.entries(predicates)
		.filter(([, predicate]) => predicate?.verdict !== 'PASS')
		.map(([gateId, predicate]) => ({
			gateId,
			status: predicate?.verdict ?? 'MISSING_VERDICT',
			blockingReason: predicate?.note ?? 'Predicate did not pass and no explanation was recorded.',
			details: predicate,
		}));

	return {
		verdict: report?.overall_verdict ?? 'MISSING_VERDICT',
		admitted: report?.overall_verdict === 'SAFE_TO_PROJECT' && blockingPredicates.length === 0,
		blockingPredicates,
	};
}
