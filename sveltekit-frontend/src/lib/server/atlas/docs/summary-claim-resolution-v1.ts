/** VAL-09 deterministic resolution. Semantic/OaK outputs are evidence inputs, never policy owners. */
import {
	buildSummaryClaimValidationV1,
	SummaryClaimValidationV1Schema,
	type SummaryClaimValidationInputV1,
	type SummaryClaimValidationV1
} from './summary-claim-validation-v1.js';

export const SUMMARY_CLAIM_ESCALATION_REVISION_V1 = 'summary-claim-resolution:val-09-v1';

type Resolution = {
	decision: SummaryClaimValidationV1['result']['decision'];
	resolutionLayer: SummaryClaimValidationV1['resolutionLayer'];
};

function resolveDecision(value: SummaryClaimValidationV1): Resolution {
	const hardFailures: SummaryClaimValidationV1['resolutionLayer'][] = [];
	const pendingLayers: SummaryClaimValidationV1['resolutionLayer'][] = [];

	if (value.technical.status === 'FAIL' || value.technical.unexpectedTechnicalTokens.length > 0) hardFailures.push('TECHNICAL');
	if (value.numeric.status === 'FAIL' || value.numeric.unsupportedValues.length > 0) hardFailures.push('NUMERIC');
	if (value.version.status === 'FAIL' || value.version.unsupportedVersions.length > 0) hardFailures.push('VERSION');
	if (value.sourceSpan.status === 'REJECTED') hardFailures.push('SOURCE_SPAN');
	if (value.semantic.verdict === 'UNSUPPORTED_CLAIM' || value.semantic.verdict === 'CONTRADICTED') hardFailures.push('SEMANTIC');
	if (value.ontology.assertions.some((assertion) => assertion.status === 'REJECTED')) hardFailures.push('ONTOLOGY');

	if (hardFailures.length) {
		return {
			decision: 'REJECT',
			resolutionLayer: hardFailures.length === 1 ? hardFailures[0] : 'COMPOSITE'
		};
	}

	if (value.technical.status !== 'PASS') pendingLayers.push('TECHNICAL');
	if (value.numeric.status !== 'PASS') pendingLayers.push('NUMERIC');
	if (value.version.status !== 'PASS') pendingLayers.push('VERSION');
	const hasSpans = value.sourceSpan.spans.length > 0;
	if (
		value.sourceSpan.status === 'CLAIMED' ||
		((value.sourceSpan.status === 'NOT_RUN' || value.sourceSpan.status === 'NO_CLAIMED_SPAN') && hasSpans) ||
		(value.sourceSpan.status === 'VERIFIED' && !hasSpans)
	) pendingLayers.push('SOURCE_SPAN');
	if (value.semantic.status !== 'JUDGED' || !['SUPPORTED', 'SUPPORTED_PARAPHRASE'].includes(value.semantic.verdict ?? '')) pendingLayers.push('SEMANTIC');
	if (value.ontology.status === 'FAIL' || value.ontology.assertions.some((assertion) => assertion.status === 'REVIEW')) pendingLayers.push('ONTOLOGY');

	if (pendingLayers.length) {
		return {
			decision: 'REVIEW',
			resolutionLayer: pendingLayers.length === 1 ? pendingLayers[0] : 'COMPOSITE'
		};
	}

	return { decision: 'ADMIT', resolutionLayer: 'COMPOSITE' };
}

/** Re-validates and re-seals the derived envelope; it never writes to a store or promotes authority. */
export function resolveSummaryClaimValidationV1(input: SummaryClaimValidationV1): SummaryClaimValidationV1 {
	const value = SummaryClaimValidationV1Schema.parse(input);
	const resolution = resolveDecision(value);
	const {
		claimChecksum: _claimChecksum,
		validationId: _validationId,
		validationChecksum: _validationChecksum,
		...body
	} = value;
	return buildSummaryClaimValidationV1({
		...(body as SummaryClaimValidationInputV1),
		result: { decision: resolution.decision, escalationRevision: SUMMARY_CLAIM_ESCALATION_REVISION_V1 },
		resolutionLayer: resolution.resolutionLayer
	});
}
