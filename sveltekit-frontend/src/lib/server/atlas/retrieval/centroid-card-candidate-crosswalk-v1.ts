import { z } from 'zod';
import {
	assertCandidateOrdinalMapIntegrityV1,
	candidateOrdinalMapV1Schema,
	type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
	assertCentroidCardV1,
	assertCentroidManifestV1,
	verifyCentroidCardAgainstManifestV1,
	type CentroidCardV1,
	type CentroidManifestV1,
} from '../cache/centroid-artifact-v1.js';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

const CentroidCandidateHintV1Schema = z.object({
	candidateOrdinal: z.number().int().nonnegative(),
	canonicalId: z.string().min(1),
	packetKey: z.string().min(1).nullable(),
	sourceRef: z.string().min(1).nullable(),
	sourceRevision: z.string().min(1),
	workspaceRevision: z.string().min(1),
	candidateSnapshotRevision: z.string().min(1),
}).strict();

export const CentroidCardCandidateCrosswalkV1Schema = z.object({
	schema: z.literal('atlas.centroid-card-candidate-crosswalk.v1'),
	status: z.literal('CANDIDATE_HINTS_ONLY'),
	evidenceStatus: z.literal('UNVERIFIED'),
	centroidId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	candidateSnapshotRevision: z.string().min(1),
	representationRevision: z.string().min(1),
	centroidManifestChecksum: sha256HexSchema,
	centroidCardChecksum: sha256HexSchema,
	ordinalMapChecksum: sha256HexSchema,
	candidates: z.array(CentroidCandidateHintV1Schema).min(1),
	checksum: sha256HexSchema,
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict().superRefine((crosswalk, ctx) => {
	const ordinals = crosswalk.candidates.map((candidate) => candidate.candidateOrdinal);
	const canonicalIds = crosswalk.candidates.map((candidate) => candidate.canonicalId);
	if (new Set(ordinals).size !== ordinals.length) {
		ctx.addIssue({ code: 'custom', path: ['candidates'], message: 'DUPLICATE_CANDIDATE_ORDINAL' });
	}
	if (new Set(canonicalIds).size !== canonicalIds.length) {
		ctx.addIssue({ code: 'custom', path: ['candidates'], message: 'DUPLICATE_CANONICAL_CANDIDATE' });
	}
});

export type CentroidCardCandidateCrosswalkV1 = z.infer<typeof CentroidCardCandidateCrosswalkV1Schema>;

export function assertCentroidCardCandidateCrosswalkV1(
	value: CentroidCardCandidateCrosswalkV1,
): CentroidCardCandidateCrosswalkV1 {
	const crosswalk = CentroidCardCandidateCrosswalkV1Schema.parse(value);
	const { checksum, ...body } = crosswalk;
	if (canonicalSha256V1(body) !== checksum) throw new Error('CENTROID_CANDIDATE_CROSSWALK_CHECKSUM_MISMATCH');
	if (crosswalk.candidates.some((candidate, index, candidates) => index > 0 && candidates[index - 1].candidateOrdinal >= candidate.candidateOrdinal)) {
		throw new Error('CENTROID_CANDIDATE_CROSSWALK_ORDER_INVALID');
	}
	return crosswalk;
}

export function resolveCentroidCardCandidatesV1(input: {
	card: CentroidCardV1;
	manifest: CentroidManifestV1;
	ordinalMap: CandidateOrdinalMapV1;
}): CentroidCardCandidateCrosswalkV1 {
	const card = assertCentroidCardV1(input.card);
	const manifest = assertCentroidManifestV1(input.manifest);
	const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
	assertCandidateOrdinalMapIntegrityV1(ordinalMap);

	const cardBinding = verifyCentroidCardAgainstManifestV1(card, manifest);
	if (!cardBinding.matches) throw new Error(cardBinding.reason);
	if (ordinalMap.workspaceRevision !== manifest.workspaceRevision) throw new Error('CENTROID_CANDIDATE_WORKSPACE_REVISION_MISMATCH');
	if (ordinalMap.candidateSnapshotRevision !== manifest.candidateSnapshotRevision) throw new Error('CENTROID_CANDIDATE_SNAPSHOT_REVISION_MISMATCH');
	if (ordinalMap.ordinalMapChecksum !== manifest.ordinalMapChecksum) throw new Error('CENTROID_CANDIDATE_ORDINAL_MAP_CHECKSUM_MISMATCH');
	if (ordinalMap.rowCount !== manifest.candidateCount) throw new Error('CENTROID_CANDIDATE_COUNT_MISMATCH');
	if (card.exemplarOrdinals.some((ordinal) => ordinal >= ordinalMap.rowCount)) {
		throw new Error('CENTROID_CARD_EXEMPLAR_OUT_OF_RANGE');
	}

	const candidates = card.exemplarOrdinals.map((candidateOrdinal) => {
		const candidate = ordinalMap.candidates[candidateOrdinal];
		if (!candidate || candidate.candidateOrdinal !== candidateOrdinal) {
			throw new Error(`CENTROID_CANDIDATE_ORDINAL_UNRESOLVED:${candidateOrdinal}`);
		}
		return {
			candidateOrdinal,
			canonicalId: candidate.canonicalId,
			packetKey: candidate.packetKey,
			sourceRef: candidate.sourceRef,
			sourceRevision: candidate.sourceRevision,
			workspaceRevision: candidate.workspaceRevision,
			candidateSnapshotRevision: candidate.candidateSnapshotRevision,
		};
	}).sort((left, right) => left.candidateOrdinal - right.candidateOrdinal);

	const body = {
		schema: 'atlas.centroid-card-candidate-crosswalk.v1' as const,
		status: 'CANDIDATE_HINTS_ONLY' as const,
		evidenceStatus: 'UNVERIFIED' as const,
		centroidId: card.centroidId,
		workspaceRevision: manifest.workspaceRevision,
		candidateSnapshotRevision: manifest.candidateSnapshotRevision,
		representationRevision: manifest.representationRevision,
		centroidManifestChecksum: manifest.checksum,
		centroidCardChecksum: card.checksum,
		ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
		candidates,
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	return assertCentroidCardCandidateCrosswalkV1(
		CentroidCardCandidateCrosswalkV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) }),
	);
}
