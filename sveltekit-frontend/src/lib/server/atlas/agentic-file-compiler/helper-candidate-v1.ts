import { z } from 'zod';
import { sha256Stable } from './contracts.js';

// AFC-CAND-01: common output normalization so multiple executors of one logical
// retrieval lane (e.g. Qdrant/cuVS/CAGRA under `semantic`) collapse to one candidate
// vote per lane per identity, not N. This preserves the "executor != retrieval lane"
// invariant already documented in root CLAUDE.md's Duplication Prevention section.
//
// identityResolution is DERIVED (never caller-asserted) from which identity field is
// actually populated, so a caller cannot claim CANONICAL_ID confidence while only
// supplying a sourceRef. Priority: canonicalId > packetKey > sourceRef > UNRESOLVED.

export const HELPER_CANDIDATE_SCHEMA_V1 = 'atlas.helper-candidate.v1' as const;

export const IdentityResolutionSchema = z.enum(['CANONICAL_ID', 'PACKET_KEY', 'SOURCE_REF', 'UNRESOLVED']);
export type IdentityResolution = z.infer<typeof IdentityResolutionSchema>;

export const HelperCandidateV1Schema = z.object({
	schema: z.literal(HELPER_CANDIDATE_SCHEMA_V1),
	lane: z.string().min(1),
	canonicalId: z.string().min(1).optional(),
	packetKey: z.string().min(1).optional(),
	sourceRef: z.string().min(1).optional(),
	identityResolution: IdentityResolutionSchema,
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type HelperCandidateV1 = z.infer<typeof HelperCandidateV1Schema>;

function deriveIdentityResolution(input: { canonicalId?: string; packetKey?: string; sourceRef?: string }): IdentityResolution {
	if (input.canonicalId) return 'CANONICAL_ID';
	if (input.packetKey) return 'PACKET_KEY';
	if (input.sourceRef) return 'SOURCE_REF';
	return 'UNRESOLVED';
}

export function buildHelperCandidateV1(input: {
	lane: string;
	canonicalId?: string;
	packetKey?: string;
	sourceRef?: string;
}): HelperCandidateV1 {
	const identityResolution = deriveIdentityResolution(input);
	const body = {
		schema: HELPER_CANDIDATE_SCHEMA_V1,
		lane: input.lane,
		...(input.canonicalId ? { canonicalId: input.canonicalId } : {}),
		...(input.packetKey ? { packetKey: input.packetKey } : {}),
		...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
		identityResolution,
	};
	return HelperCandidateV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertHelperCandidateV1(value: HelperCandidateV1): HelperCandidateV1 {
	const candidate = HelperCandidateV1Schema.parse(value);
	const { checksum, ...body } = candidate;
	if (sha256Stable(body) !== checksum) throw new Error('HELPER_CANDIDATE_CHECKSUM_MISMATCH');
	if (deriveIdentityResolution(candidate) !== candidate.identityResolution) {
		throw new Error('HELPER_CANDIDATE_IDENTITY_RESOLUTION_MISMATCH');
	}
	return candidate;
}

function candidateIdentityKey(candidate: HelperCandidateV1): string {
	return candidate.canonicalId ?? candidate.packetKey ?? candidate.sourceRef ?? `unresolved:${candidate.checksum}`;
}

/**
 * Collapse multiple executor outputs for the same logical lane into one candidate
 * vote per (lane, identity) pair. Distinct executors that resolved to the same
 * canonicalId/packetKey/sourceRef under one lane are deduplicated; distinct
 * identities under the same lane are preserved as separate candidates.
 */
export function dedupeHelperCandidatesByLane(candidates: readonly HelperCandidateV1[]): HelperCandidateV1[] {
	const validated = candidates.map(assertHelperCandidateV1);
	const seen = new Map<string, HelperCandidateV1>();
	for (const candidate of validated) {
		const key = `${candidate.lane}::${candidateIdentityKey(candidate)}`;
		if (!seen.has(key)) seen.set(key, candidate);
	}
	return [...seen.values()].sort((a, b) => {
		if (a.lane !== b.lane) return a.lane < b.lane ? -1 : 1;
		return candidateIdentityKey(a) < candidateIdentityKey(b) ? -1 : 1;
	});
}
