import path from 'node:path';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import {
	CANONICAL_SEMANTIC_ENCODER_REVISION,
	buildCanonicalSemanticLineage,
	type CanonicalSemanticLineage,
} from '$lib/server/embedding/semantic-lineage.js';
import { makePacketUlid } from '$lib/server/identity/ulid.js';

export interface PersistCanonicalSemanticPacketEmbeddingInput {
	packetId?: string;
	packetKey: string;
	sourceRef: string;
	vector: readonly number[] | Float32Array;
	encoderRevision?: string;
	representationRevision?: number;
	sourceRepresentationId?: string;
	sourceDimension?: number;
	projectionRepresentationId?: string | null;
	projectionDimension?: number | null;
	featureId?: string;
	featureLabel?: string;
	sourceKind?: string;
	sourcePath?: string | null;
	summary?: string | null;
	metadata?: Record<string, unknown>;
	topology?: Record<string, unknown>;
	vectors?: Record<string, unknown>;
}

export interface PersistCanonicalSemanticPacketEmbeddingResult {
	packetId: string;
	packetKey: string;
	lineage: CanonicalSemanticLineage;
}

type AtlasPacketWriter = {
	insert: typeof db.insert;
};

export async function persistCanonicalSemanticPacketEmbedding(
	input: PersistCanonicalSemanticPacketEmbeddingInput,
	database: AtlasPacketWriter = db,
): Promise<PersistCanonicalSemanticPacketEmbeddingResult> {
	const packetId = input.packetId?.trim() || input.packetKey.trim() || makePacketUlid();
	const packetKey = input.packetKey.trim() || packetId;
	const sourceRef = input.sourceRef.trim() || packetKey;
	const encoderRevision =
		input.encoderRevision === undefined
			? CANONICAL_SEMANTIC_ENCODER_REVISION
			: input.encoderRevision.trim();
	if (!encoderRevision) {
		throw new Error('SEMANTIC_768_ENCODER_REVISION_REQUIRED');
	}
	const lineage = buildCanonicalSemanticLineage({
		vector: input.vector,
		encoderRevision,
		representationRevision: input.representationRevision,
	});

	const directoryPath = path.dirname(input.sourcePath?.trim() || sourceRef);
	const now = new Date();
	const featureId = input.featureId?.trim() || lineage.representationId;
	const featureLabel = input.featureLabel?.trim() || lineage.representationId;
	const sourceRepresentationId = input.sourceRepresentationId ?? lineage.representationId;
	const sourceDimension = input.sourceDimension ?? lineage.dimension;

	await database
		.insert(atlasPackets)
		.values({
			packetId,
			packetKey,
			sourceRef,
			directoryPath,
			featureId,
			featureLabel,
			packetUlid: packetId,
			sourceKind: input.sourceKind ?? 'codebase',
			sourcePath: input.sourcePath ?? sourceRef,
			embedding: Array.from(input.vector),
			payload: input.metadata ?? {},
			metadata: {
				...(input.metadata ?? {}),
				semantic_lineage: lineage,
			},
			topology: input.topology ?? {},
			vectors: input.vectors ?? {},
			representationRevision: lineage.representationRevision,
			sourceRepresentationId,
			sourceDimension,
			projectionRepresentationId: input.projectionRepresentationId ?? null,
			projectionDimension: input.projectionDimension ?? null,
			encoderRevision: lineage.encoderRevision,
			embeddingDigest: lineage.embeddingDigest,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: atlasPackets.packetId,
			set: {
				packetKey,
				sourceRef,
				directoryPath,
				featureId,
				featureLabel,
				sourceKind: input.sourceKind ?? 'codebase',
				sourcePath: input.sourcePath ?? sourceRef,
				embedding: Array.from(input.vector),
				payload: input.metadata ?? {},
				metadata: {
					...(input.metadata ?? {}),
					semantic_lineage: lineage,
				},
				topology: input.topology ?? {},
				vectors: input.vectors ?? {},
				representationRevision: lineage.representationRevision,
				sourceRepresentationId,
				sourceDimension,
				projectionRepresentationId: input.projectionRepresentationId ?? null,
				projectionDimension: input.projectionDimension ?? null,
				encoderRevision: lineage.encoderRevision,
				embeddingDigest: lineage.embeddingDigest,
				updatedAt: now,
			},
		});

	return {
		packetId,
		packetKey,
		lineage,
	};
}
