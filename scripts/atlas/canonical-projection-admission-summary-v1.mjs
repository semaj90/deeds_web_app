export const CANONICAL_PROJECTION_PREDICATES_V1 = Object.freeze([
	'IDENTITY_ALIGNED', 'REVISION_QUALIFIED', 'SYMBOLS_RESOLVED',
	'SEMANTIC_OWNER_PROVEN', 'LATENT_FAMILY_PROVEN', 'GRAPH_MANIFEST_SEALED',
	'ONTOLOGY_COHORT_NONEMPTY', 'ORDINAL_MAP_SEALED', 'PROJECTIONS_CHECKSUM_ALIGNED',
	'BITFROST_KEYS_DERIVABLE', 'ACE_EVIDENCE_GROUNDED',
]);

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
