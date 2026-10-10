import { z } from 'zod';
import {
	assertCentroidArtifactV1,
	assertCentroidManifestV1,
	type CentroidArtifactV1,
	type CentroidManifestV1,
} from './centroid-artifact-v1.js';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

const scoreRowSchema = z.object({
	centroidId: z.string().min(1),
	rank: z.number().int().positive(),
	cosineSimilarity: z.number().finite().min(-1).max(1),
	artifactChecksum: sha256HexSchema,
}).strict();

const scoreLookupSchema = z.record(z.string(), scoreRowSchema);

export const CentroidCosineIndexV1Schema = z.object({
	schema: z.literal('atlas.centroid-cosine-index.v1'),
	workspaceRevision: z.string().min(1),
	candidateSnapshotRevision: z.string().min(1),
	representationRevision: z.string().min(1),
	ordinalMapChecksum: sha256HexSchema,
	centroidManifestChecksum: sha256HexSchema,
	queryVectorChecksum: sha256HexSchema,
	rows: z.array(scoreRowSchema),
	byCentroidId: scoreLookupSchema,
	checksum: sha256HexSchema,
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict().superRefine((index, ctx) => {
	const ids = index.rows.map((row) => row.centroidId);
	if (new Set(ids).size !== ids.length) {
		ctx.addIssue({ code: 'custom', path: ['rows'], message: 'DUPLICATE_CENTROID_SCORE_ROW' });
	}
	if (index.rows.some((row, position) => row.rank !== position + 1)) {
		ctx.addIssue({ code: 'custom', path: ['rows'], message: 'CENTROID_SCORE_RANKS_NOT_CONTIGUOUS' });
	}
	if (Object.keys(index.byCentroidId).sort().join('\u0000') !== [...ids].sort().join('\u0000')) {
		ctx.addIssue({ code: 'custom', path: ['byCentroidId'], message: 'CENTROID_SCORE_LOOKUP_KEYS_MISMATCH' });
	}
	for (const row of index.rows) {
		if (JSON.stringify(index.byCentroidId[row.centroidId]) !== JSON.stringify(row)) {
			ctx.addIssue({ code: 'custom', path: ['byCentroidId', row.centroidId], message: 'CENTROID_SCORE_LOOKUP_ROW_MISMATCH' });
		}
	}
});

export type CentroidCosineIndexV1 = z.infer<typeof CentroidCosineIndexV1Schema>;

export interface CentroidCosineVectorBindingV1 {
	artifact: CentroidArtifactV1;
	vector: readonly number[];
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
	let dot = 0;
	let leftNormSquared = 0;
	let rightNormSquared = 0;
	for (let index = 0; index < left.length; index += 1) {
		dot += left[index]! * right[index]!;
		leftNormSquared += left[index]! ** 2;
		rightNormSquared += right[index]! ** 2;
	}
	if (leftNormSquared === 0 || rightNormSquared === 0) throw new Error('COSINE_ZERO_NORM_VECTOR');
	const score = dot / Math.sqrt(leftNormSquared * rightNormSquared);
	if (!Number.isFinite(score)) throw new Error('COSINE_SCORE_NON_FINITE');
	return Math.max(-1, Math.min(1, score));
}

export function buildCentroidCosineIndexV1(input: {
	manifest: CentroidManifestV1;
	queryVector: readonly number[];
	queryWorkspaceRevision: string;
	queryCandidateSnapshotRevision: string;
	queryRepresentationRevision: string;
	queryOrdinalMapChecksum: string;
	vectors: readonly CentroidCosineVectorBindingV1[];
}): CentroidCosineIndexV1 {
	const manifest = assertCentroidManifestV1(input.manifest);
	if (input.queryWorkspaceRevision !== manifest.workspaceRevision) throw new Error('COSINE_INDEX_WORKSPACE_REVISION_MISMATCH');
	if (input.queryCandidateSnapshotRevision !== manifest.candidateSnapshotRevision) throw new Error('COSINE_INDEX_CANDIDATE_SNAPSHOT_MISMATCH');
	if (input.queryRepresentationRevision !== manifest.representationRevision) throw new Error('COSINE_INDEX_REPRESENTATION_REVISION_MISMATCH');
	if (input.queryOrdinalMapChecksum !== manifest.ordinalMapChecksum) throw new Error('COSINE_INDEX_ORDINAL_MAP_CHECKSUM_MISMATCH');
	if (input.queryVector.length === 0) throw new Error('COSINE_QUERY_VECTOR_EMPTY');
	if (input.queryVector.some((value) => !Number.isFinite(value))) throw new Error('COSINE_QUERY_VECTOR_NON_FINITE');
	if (input.queryVector.every((value) => value === 0)) throw new Error('COSINE_ZERO_NORM_VECTOR');

	const vectorByCentroidId = new Map<string, CentroidCosineVectorBindingV1>();
	for (const binding of input.vectors) {
		const artifact = assertCentroidArtifactV1(binding.artifact);
		if (vectorByCentroidId.has(artifact.centroidId)) throw new Error('DUPLICATE_CENTROID_VECTOR_BINDING');
		if (artifact.workspaceRevision !== manifest.workspaceRevision) throw new Error('CENTROID_ARTIFACT_WORKSPACE_REVISION_MISMATCH');
		if (artifact.representationRevision !== manifest.representationRevision) throw new Error('CENTROID_ARTIFACT_REPRESENTATION_REVISION_MISMATCH');
		if (binding.vector.length !== artifact.dimensions) throw new Error('CENTROID_ARTIFACT_VECTOR_DIMENSION_MISMATCH');
		if (input.queryVector.length !== artifact.dimensions) throw new Error('COSINE_QUERY_VECTOR_DIMENSION_MISMATCH');
		if (binding.vector.some((value) => !Number.isFinite(value))) throw new Error('CENTROID_ARTIFACT_VECTOR_NON_FINITE');
		const vectorChecksum = canonicalSha256V1({ schema: 'atlas.centroid-vector.v1', vector: binding.vector });
		if (vectorChecksum !== artifact.vectorChecksum) throw new Error('CENTROID_ARTIFACT_VECTOR_CHECKSUM_MISMATCH');
		vectorByCentroidId.set(artifact.centroidId, { artifact, vector: binding.vector });
	}
	if (vectorByCentroidId.size !== manifest.centroids.length) throw new Error('CENTROID_VECTOR_SET_INCOMPLETE');

	const ranked = manifest.centroids.map((entry) => {
		const binding = vectorByCentroidId.get(entry.centroidId);
		if (!binding) throw new Error('CENTROID_VECTOR_BINDING_MISSING');
		if (binding.artifact.artifactRef !== entry.artifactRef
			|| binding.artifact.checksum !== entry.artifactChecksum
			|| binding.artifact.memberCount !== entry.memberCount
			|| binding.artifact.memberSetChecksum !== entry.memberSetChecksum) {
			throw new Error('CENTROID_VECTOR_ARTIFACT_NOT_IN_MANIFEST');
		}
		return {
			centroidId: entry.centroidId,
			cosineSimilarity: cosineSimilarity(input.queryVector, binding.vector),
			artifactChecksum: entry.artifactChecksum,
		};
	}).sort((left, right) => right.cosineSimilarity - left.cosineSimilarity || left.centroidId.localeCompare(right.centroidId, 'en'));

	const rows = ranked.map((row, index) => scoreRowSchema.parse({ ...row, rank: index + 1 }));
	const byCentroidId = Object.fromEntries(rows.map((row) => [row.centroidId, row]));
	const body = {
		schema: 'atlas.centroid-cosine-index.v1' as const,
		workspaceRevision: manifest.workspaceRevision,
		candidateSnapshotRevision: manifest.candidateSnapshotRevision,
		representationRevision: manifest.representationRevision,
		ordinalMapChecksum: manifest.ordinalMapChecksum,
		centroidManifestChecksum: manifest.checksum,
		queryVectorChecksum: canonicalSha256V1({ schema: 'atlas.centroid-query-vector.v1', vector: input.queryVector }),
		rows,
		byCentroidId,
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	return CentroidCosineIndexV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function assertCentroidCosineIndexV1(value: CentroidCosineIndexV1): CentroidCosineIndexV1 {
	const index = CentroidCosineIndexV1Schema.parse(value);
	const { checksum, ...body } = index;
	if (canonicalSha256V1(body) !== checksum) throw new Error('CENTROID_COSINE_INDEX_CHECKSUM_MISMATCH');
	return index;
}
