import { z } from 'zod';

/**
 * ============================================================================
 * CANDIDATE-SET-OVERLAP-FILTER-01: OaK Candidate Set Overlap Filtering Operator
 * ============================================================================
 *
 * Implements the OaK `filter_set_overlap` operator:
 * Takes candidate elements from Set A and filters them against a reference Set B
 * under explicit mathematical set-overlap criteria:
 *  - 'DISJOINT': Exclude all elements in A that appear in B (anti-join / leakage prevention).
 *  - 'INTERSECTION': Retain only elements in A that also appear in B (inner join).
 *  - 'UNION_DISTINCT': Combine A and B preserving first-seen order and uniqueness.
 *  - 'DIFFERENCE': Return elements in A not in B.
 *
 * Guarantees:
 *  - Pure in-memory compute (deterministic, zero database side-effects).
 *  - Bounded by explicit input revisions (`setRevisionA`, `setRevisionB`).
 *  - Non-canonical receipts (`canonicalAuthority: false`, `writesPerformed: false`).
 */

export const OVERLAP_CRITERIA_VALUES = [
	'DISJOINT',
	'INTERSECTION',
	'UNION_DISTINCT',
	'DIFFERENCE',
] as const;

export type OverlapCriteria = (typeof OVERLAP_CRITERIA_VALUES)[number];

export const OverlapCriteriaSchema = z.enum(OVERLAP_CRITERIA_VALUES);

export const CandidateItemV1Schema = z
	.object({
		candidateId: z.string().min(1),
		ordinal: z.number().int().nonnegative().optional(),
		score: z.number().finite().optional(),
		sourceRef: z.string().min(1).optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.strict();

export type CandidateItemV1 = z.infer<typeof CandidateItemV1Schema>;

export const CandidateSetOverlapFilterInputV1Schema = z
	.object({
		setRevisionA: z.string().min(1),
		setRevisionB: z.string().min(1),
		candidatesA: z.array(CandidateItemV1Schema),
		candidatesB: z.array(CandidateItemV1Schema),
		criteria: OverlapCriteriaSchema,
	})
	.strict();

export type CandidateSetOverlapFilterInputV1 = z.infer<
	typeof CandidateSetOverlapFilterInputV1Schema
>;

export const CandidateSetOverlapFilterOutputV1Schema = z
	.object({
		schema: z.literal('atlas.candidate-set-overlap-filter.v1'),
		criteria: OverlapCriteriaSchema,
		setRevisionA: z.string().min(1),
		setRevisionB: z.string().min(1),
		totalInputA: z.number().int().nonnegative(),
		totalInputB: z.number().int().nonnegative(),
		totalOutput: z.number().int().nonnegative(),
		filteredCandidates: z.array(CandidateItemV1Schema),
		overlapCandidateIds: z.array(z.string().min(1)),
		overlapFraction: z.number().min(0).max(1),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	})
	.strict();

export type CandidateSetOverlapFilterOutputV1 = z.infer<
	typeof CandidateSetOverlapFilterOutputV1Schema
>;

/**
 * Executes set overlap filtering over two revision-qualified candidate lists.
 */
export function filterCandidateSetOverlapV1(
	input: CandidateSetOverlapFilterInputV1,
): CandidateSetOverlapFilterOutputV1 {
	const validated = CandidateSetOverlapFilterInputV1Schema.parse(input);

	const setBIds = new Set(validated.candidatesB.map((c) => c.candidateId));
	const setAIds = new Set(validated.candidatesA.map((c) => c.candidateId));

	// Find common overlap IDs
	const overlapIds: string[] = [];
	for (const id of setAIds) {
		if (setBIds.has(id)) {
			overlapIds.push(id);
		}
	}
	overlapIds.sort();

	const overlapFraction =
		validated.candidatesA.length > 0 ? overlapIds.length / validated.candidatesA.length : 0;

	let filtered: CandidateItemV1[] = [];

	switch (validated.criteria) {
		case 'DISJOINT':
		case 'DIFFERENCE':
			// Retain items in A that are NOT in B
			filtered = validated.candidatesA.filter((c) => !setBIds.has(c.candidateId));
			break;

		case 'INTERSECTION':
			// Retain items in A that ARE in B
			filtered = validated.candidatesA.filter((c) => setBIds.has(c.candidateId));
			break;

		case 'UNION_DISTINCT': {
			// Combine A and B, distinct by candidateId, preserving order
			const seen = new Set<string>();
			for (const item of [...validated.candidatesA, ...validated.candidatesB]) {
				if (!seen.has(item.candidateId)) {
					seen.add(item.candidateId);
					filtered.push(item);
				}
			}
			break;
		}
	}

	return CandidateSetOverlapFilterOutputV1Schema.parse({
		schema: 'atlas.candidate-set-overlap-filter.v1',
		criteria: validated.criteria,
		setRevisionA: validated.setRevisionA,
		setRevisionB: validated.setRevisionB,
		totalInputA: validated.candidatesA.length,
		totalInputB: validated.candidatesB.length,
		totalOutput: filtered.length,
		filteredCandidates: filtered,
		overlapCandidateIds: overlapIds,
		overlapFraction,
		canonicalAuthority: false,
		writesPerformed: false,
	});
}
