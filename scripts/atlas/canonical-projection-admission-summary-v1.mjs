export const CANONICAL_PROJECTION_PREDICATES_V1 = Object.freeze([
	'IDENTITY_ALIGNED', 'REVISION_QUALIFIED', 'SYMBOLS_RESOLVED',
	'SEMANTIC_OWNER_PROVEN', 'LATENT_FAMILY_PROVEN', 'GRAPH_MANIFEST_SEALED',
	'ONTOLOGY_COHORT_NONEMPTY', 'ORDINAL_MAP_SEALED', 'PROJECTIONS_CHECKSUM_ALIGNED',
	'BITFROST_KEYS_DERIVABLE', 'ACE_EVIDENCE_GROUNDED',
]);

export function summarizeCanonicalProjectionAuditPredicatesV1(predicates) {
	if (!predicates || typeof predicates !== 'object' || Array.isArray(predicates)) {
		throw new TypeError('CANONICAL_PROJECTION_PREDICATES_REQUIRED');
	}

	const entries = Object.entries(predicates);
	const passingPredicateIds = entries.filter(([, predicate]) => predicate?.verdict === 'PASS').map(([gateId]) => gateId);
	const belowPassPredicateIds = entries.filter(([, predicate]) => predicate?.verdict !== 'PASS').map(([gateId, predicate]) => `${gateId}=${predicate?.verdict ?? 'MISSING_VERDICT'}`);
	const belowPassCount = belowPassPredicateIds.length;

	return {
		totalPredicateCount: entries.length,
		passCount: passingPredicateIds.length,
		belowPassCount,
		verdict: belowPassCount === 0 ? 'SAFE_TO_PROJECT' : 'NOT_SAFE_TO_PROJECT',
		reason: belowPassCount === 0
			? `All ${entries.length} predicates PASS.`
			: `${belowPassCount}/${entries.length} predicates below PASS: ${belowPassPredicateIds.join(', ')}`,
	};
}

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
	for (const gateId of CANONICAL_PROJECTION_PREDICATES_V1) {
		if (!Object.hasOwn(predicates, gateId)) {
			blockingPredicates.push({
				gateId,
				status: 'MISSING',
				blockingReason: 'Required canonical projection predicate is missing.',
				details: null,
			});
		}
	}

	return {
		verdict: report?.overall_verdict ?? 'MISSING_VERDICT',
		admitted: report?.overall_verdict === 'SAFE_TO_PROJECT' && blockingPredicates.length === 0,
		blockingPredicates,
	};
}
