/** Read-only VAL-10 batch bridge to the canonical Zod resolver and analysis schema. */
import { readFileSync } from 'node:fs';
import { resolveSummaryClaimValidationV1 } from '../../sveltekit-frontend/src/lib/server/atlas/docs/summary-claim-resolution-v1.js';
import { ExternalDocAnalysisV1Schema, externalDocAnalysisId } from '../../sveltekit-frontend/src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';
import { SummaryClaimValidationV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/docs/summary-claim-validation-v1.js';

type Input = {
	claimValidations: Array<{ groupKey: string; validation: unknown }>;
	analysisCandidates: Array<{ groupKey: string; analysis: Record<string, unknown> }>;
	maximumApplyLimit: number;
};

function main(): void {
	const raw = readFileSync(0, 'utf8');
	const input = JSON.parse(raw) as Input;
	if (!Number.isInteger(input.maximumApplyLimit) || input.maximumApplyLimit < 1 || input.maximumApplyLimit > 20) {
		throw new Error('VAL10_APPLY_LIMIT_MUST_BE_1_TO_20');
	}
	if (!Array.isArray(input.claimValidations) || !Array.isArray(input.analysisCandidates)) {
		throw new Error('VAL10_BATCH_SHAPE_INVALID');
	}
	const claims = input.claimValidations.map(({ groupKey, validation }) => {
		const parsed = SummaryClaimValidationV1Schema.parse(validation);
		return { groupKey, validation: resolveSummaryClaimValidationV1(parsed) };
	});
	const analyses = input.analysisCandidates.map(({ groupKey, analysis }) => {
		const id = externalDocAnalysisId(analysis as Parameters<typeof externalDocAnalysisId>[0]);
		return { groupKey, analysis: ExternalDocAnalysisV1Schema.parse({ ...analysis, analysisId: id }) };
	});
	const keys = new Set([...claims.map((row) => row.groupKey), ...analyses.map((row) => row.groupKey)]);
	const groups = [...keys].sort().map((groupKey) => {
		const groupClaims = claims.filter((row) => row.groupKey === groupKey).map((row) => row.validation);
		const analysis = analyses.find((row) => row.groupKey === groupKey)?.analysis;
		const eligible = Boolean(analysis && groupClaims.length > 0 && groupClaims.every((claim) => claim.result.decision === 'ADMIT'));
		return {
			groupKey,
			analysisId: analysis?.analysisId ?? null,
			analysisEnvelopeValid: Boolean(analysis),
			claimCount: groupClaims.length,
			claimDecisions: groupClaims.map((claim) => claim.result.decision),
			eligible
		};
	});
	const eligibleCount = groups.filter((group) => group.eligible).length;
	process.stdout.write(JSON.stringify({
		schema: 'atlas.summary-claim-eligibility-batch.v1',
		maximumApplyLimit: input.maximumApplyLimit,
		canonicalAuthority: false,
		groups,
		claimDecisionCounts: claims.reduce<Record<string, number>>((counts, row) => {
			const decision = row.validation.result.decision;
			counts[decision] = (counts[decision] ?? 0) + 1;
			return counts;
		}, {}),
		eligibleCount,
		withinBound: eligibleCount <= input.maximumApplyLimit,
		resolvedClaims: claims.map(({ groupKey, validation }) => ({
			groupKey,
			claimOrdinal: validation.claimOrdinal,
			claimChecksum: validation.claimChecksum,
			decision: validation.result.decision,
			resolutionLayer: validation.resolutionLayer,
			validationId: validation.validationId,
			validationChecksum: validation.validationChecksum
		}))
	}));
}

main();
