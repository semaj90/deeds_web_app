import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { computePacketKey as computeCanonicalPacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import { resolveCanonicalPacketKey } from '$lib/server/atlas/identity/packet-identity-resolver.js';
import {
	CANONICAL_SEMANTIC_ENCODER_REVISION,
	buildCanonicalSemanticLineage,
	type CanonicalSemanticLineage,
} from '$lib/server/embedding/semantic-lineage.js';

export interface PersistCanonicalSemanticPacketEmbeddingInput {
	packetId?: string;
	packetKey: string;
	sourceRef: string;
	/**
	 * Revision of the source content this embedding was computed from (e.g. a
	 * content hash or git blob SHA). Optional and left NULL when the caller has
	 * no real revision evidence -- never synthesize a value here. Added
	 * 2026-09-09 alongside the atlas_packets.source_revision column migration;
	 * no current caller supplies it yet (see PACKET_WRITE_REVISION_CONTRACT_01).
	 */
	sourceRevision?: string | null;
	treeNodeId?: string | null;
	titleId?: string | null;
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

async function resolvePersistedPacketKey(
	input: PersistCanonicalSemanticPacketEmbeddingInput
): Promise<string> {
	const providedPacketKey = input.packetKey.trim();
	const sourceRef = input.sourceRef.trim();
	const treeNodeId = input.treeNodeId?.trim() || '';
	const titleId = input.titleId?.trim() || '';

	const structuredKey = sourceRef && treeNodeId && titleId
		? computeCanonicalPacketKey(sourceRef, treeNodeId, titleId)
		: '';

	if (providedPacketKey) {
		const resolvedPacketKey = await resolveCanonicalPacketKey(providedPacketKey);
		if (structuredKey && resolvedPacketKey !== structuredKey) {
			throw new Error(
				`PACKET_KEY_MISMATCH_CANONICAL_RESOLUTION expected=${structuredKey} provided=${resolvedPacketKey}`
			);
		}
		return resolvedPacketKey;
	}

	if (structuredKey) {
		return structuredKey;
	}

	throw new Error('PACKET_KEY_REQUIRED_OR_CANONICAL_SOURCE_FIELDS_REQUIRED');
}

export async function persistCanonicalSemanticPacketEmbedding(
	input: PersistCanonicalSemanticPacketEmbeddingInput,
	database: AtlasPacketWriter = db,
): Promise<PersistCanonicalSemanticPacketEmbeddingResult> {
	const packetKey = await resolvePersistedPacketKey(input);
	const packetId = input.packetId?.trim() || packetKey;
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
	// Never synthesized: NULL when the caller has no real revision evidence.
	const sourceRevision = input.sourceRevision?.trim() || null;
	// PACKET-WRITER-SOURCE-REVISION-PRESERVATION-01 (2026-09-09): the conflict
	// branch below never overwrites a previously-stored source_revision with
	// NULL. If this call supplies a real value, it wins (matches "existing A,
	// incoming B -> B" for the create-time INSERT path; full SOURCE_REVISION_CONFLICT
	// semantics for a genuine A->B disagreement belong to decidePacketWrite/
	// executePacketWriteTransaction, not this function, once it's wired
	// through them). If this call supplies no value (undefined/null), any
	// existing proven value is preserved via COALESCE rather than clobbered --
	// closing the exact risk this file's prior comment flagged but did not fix.
	const conflictSourceRevision = sql`COALESCE(${sourceRevision}, ${atlasPackets.sourceRevision})`;

	// PACKET-WRITER-SUMMARY-FIELD-WIRING-01 (2026-09-09): input.summary was
	// previously declared on PersistCanonicalSemanticPacketEmbeddingInput but
	// never read anywhere in this function -- any caller passing it had the
	// value silently dropped. Wired now using the same never-clobber pattern
	// as source_revision above: a supplied summary is used, but an existing
	// stored summary is never overwritten with NULL on conflict (real summary
	// population is a separate later-pass concern -- see
	// backfill-summary-layers-from-chunks.mjs / backfill-atlas-packet-summaries-from-layers.mjs
	// -- this write path must not clobber that pass's output either).
	const summary = input.summary?.trim() || null;
	const conflictSummary = sql`COALESCE(${summary}, ${atlasPackets.summary})`;

	await database
		.insert(atlasPackets)
		.values({
			packetId,
			packetKey,
			sourceRef,
			sourceRevision,
			directoryPath,
			featureId,
			featureLabel,
			packetUlid: packetId,
			sourceKind: input.sourceKind ?? 'codebase',
			sourcePath: input.sourcePath ?? sourceRef,
			summary,
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
				sourceRevision: conflictSourceRevision,
				directoryPath,
				featureId,
				featureLabel,
				sourceKind: input.sourceKind ?? 'codebase',
				sourcePath: input.sourcePath ?? sourceRef,
				summary: conflictSummary,
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
