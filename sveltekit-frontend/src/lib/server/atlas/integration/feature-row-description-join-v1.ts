import { z } from 'zod';
import { FeatureDescriptionV1Schema, verifyFeatureDescriptionSourceBytesV1, type FeatureDescriptionV1 } from '../contracts/feature-description-v1.js';
import { FeatureRowV1Schema, type FeatureRowV1 } from '../ranking/feature-row-v1.js';

export const FeatureRowDescriptionJoinV1Schema = z.object({
	schema: z.literal('atlas.feature-row-description-join.v1'),
	featureRow: FeatureRowV1Schema,
	description: FeatureDescriptionV1Schema,
	byteVerification: z.object({
		schema: z.literal('atlas.feature-description-byte-verification.v1'),
		status: z.literal('BYTES_AND_SPANS_MATCHED'),
		descriptionDigest: z.string().regex(/^[a-f0-9]{64}$/),
		verifiedEvidenceRefs: z.array(z.string().min(1)).min(1),
	}).strict(),
	writesPerformed: z.literal(false),
	canonicalAuthority: z.literal(false),
}).strict();

export type FeatureRowDescriptionJoinV1 = z.infer<typeof FeatureRowDescriptionJoinV1Schema>;

export function joinFeatureRowAndDescriptionV1(input: {
	featureRow: FeatureRowV1;
	description: FeatureDescriptionV1;
	sourceBytesByEvidenceRef: ReadonlyMap<string, Uint8Array>;
}): FeatureRowDescriptionJoinV1 {
	const featureRow = FeatureRowV1Schema.parse(input.featureRow);
	const description = FeatureDescriptionV1Schema.parse(input.description);
	if (description.canonicalId !== featureRow.canonicalId) throw new Error('FEATURE_DESCRIPTION_JOIN_CANONICAL_ID_MISMATCH');
	if (description.packetKey !== featureRow.packetKey) throw new Error('FEATURE_DESCRIPTION_JOIN_PACKET_KEY_MISMATCH');
	if (description.sourceRef !== featureRow.sourceRef) throw new Error('FEATURE_DESCRIPTION_JOIN_SOURCE_REF_MISMATCH');
	if (description.featureRevision !== featureRow.featureRevision) throw new Error('FEATURE_DESCRIPTION_JOIN_FEATURE_REVISION_MISMATCH');
	if (description.workspaceRevision !== featureRow.workspaceRevision) throw new Error('FEATURE_DESCRIPTION_JOIN_WORKSPACE_REVISION_MISMATCH');
	const primary = description.evidence.find((evidence) =>
		evidence.canonicalId === featureRow.canonicalId &&
		evidence.packetKey === featureRow.packetKey &&
		evidence.sourceRef === featureRow.sourceRef
	);
	if (!primary || primary.sourceRevision !== featureRow.sourceRevision) {
		throw new Error('FEATURE_DESCRIPTION_JOIN_SOURCE_REVISION_MISMATCH');
	}
	const byteVerification = verifyFeatureDescriptionSourceBytesV1(description, input.sourceBytesByEvidenceRef);
	return FeatureRowDescriptionJoinV1Schema.parse({
		schema: 'atlas.feature-row-description-join.v1',
		featureRow,
		description,
		byteVerification,
		writesPerformed: false,
		canonicalAuthority: false,
	});
}
