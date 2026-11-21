import { createHash } from 'node:crypto';
import type { CaseSceneFetchParametersInputV1, CaseSceneIntakeContextV1 } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';
import { CaseSceneFetchParametersInputV1Schema } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';

function sourceSha256(hash: string | null, hashAlgorithm?: string | null): string | null {
	if (hashAlgorithm?.toLowerCase() !== 'sha256' || !hash) return null;
	try { return formatEvidenceSourceRevisionV1(hash).slice('sha256:'.length); } catch { return null; }
}

export interface CaseSceneFetchParametersV1 {
	schema: 'parent-atlas.case-scene-fetch-parameters/v1';
	caseId: string;
	requestHash: string;
	compiler: 'procedural-three-scene-v1';
	caseIntake: CaseSceneIntakeContextV1 | null;
	brief: CaseSceneFetchParametersInputV1['brief'];
	sourceEvidence: Array<{ evidenceId: string; sha256: string | null; revisionVerified: false }>;
	environment: CaseSceneFetchParametersInputV1['environment'];
	interpretation: { who: 'pseudonymous_visual_handles'; why: 'hypothesis_or_unknown'; clocks: 'source_local_unaligned'; geometry: 'illustrative_uncalibrated' };
}

/** Build the deterministic, bounded body for the next procedural-scene fetch step. */
export function buildCaseSceneFetchParametersV1(input: {
	caseId: string;
	request: CaseSceneFetchParametersInputV1;
	caseIntake?: CaseSceneIntakeContextV1 | null;
	verifiedEvidence: ReadonlyArray<{ id: string; hash: string | null; hashAlgorithm?: string | null }>;
}): CaseSceneFetchParametersV1 {
	const request = CaseSceneFetchParametersInputV1Schema.parse(input.request);
	const rows = new Map(input.verifiedEvidence.map((item) => [item.id, item]));
	if (rows.size !== input.verifiedEvidence.length || request.sourceEvidenceIds.some((evidenceId) => !rows.has(evidenceId))) {
		throw new Error('SCENE_FETCH_EVIDENCE_MEMBERSHIP_MISMATCH');
	}
	const canonical = JSON.stringify({ caseId: input.caseId, caseIntake: input.caseIntake ?? null, request });
	return {
		schema: 'parent-atlas.case-scene-fetch-parameters/v1',
		caseId: input.caseId,
		requestHash: createHash('sha256').update(canonical).digest('hex'),
		compiler: 'procedural-three-scene-v1',
		caseIntake: input.caseIntake ?? null,
		brief: request.brief,
		sourceEvidence: request.sourceEvidenceIds.map((evidenceId) => {
			const row = rows.get(evidenceId)!;
			return { evidenceId, sha256: sourceSha256(row.hash, row.hashAlgorithm), revisionVerified: false as const };
		}),
		environment: request.environment,
		interpretation: { who: 'pseudonymous_visual_handles', why: 'hypothesis_or_unknown', clocks: 'source_local_unaligned', geometry: 'illustrative_uncalibrated' }
	};
}

