/**
 * Durable marker move. One Drizzle transaction writes the marker, its scene event and the
 * outbox row, or nothing. The database db is injected so tests can use a scratch database.
 *
 * Idempotency: scene_events.command_id is unique. A repeated commandId with the same
 * marker returns the committed result (replayed: true) and writes nothing.
 * Concurrency: the UPDATE is guarded by expectedRevision; zero rows means a conflict.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { sceneEventOutbox, sceneEvents, sceneMarkers } from '../db/schema/scene-markers.js';
import { evidence } from '../db/schema-postgres.js';
import { normalizeSha256 } from '../features/evidence/evidence-revision-v1.js';
import { anchorRowValues, type MarkerAnchor } from './marker-anchor-v1.js';

/** Raised when a marker would reference evidence that is not active in the same case. */
export class EvidenceNotInCaseError extends Error {
	constructor() {
		super('EVIDENCE_NOT_IN_CASE');
	}
}

export class MarkerSourceMismatchError extends Error {
	constructor() {
		super('This image marker needs the current source image revision. Reopen the exhibit and place the marker again.');
	}
}

function assertImageAnchorSource(
	source: { hash: string | null; mimeType: string | null; fileType: string | null },
	cmd: Pick<CreateMarkerCommand, 'sourceRevision' | 'sourceSha256' | 'position'>,
	anchor: Extract<MarkerAnchor, { kind: 'IMAGE_UV' }>
) {
	const hash = normalizeSha256(source.hash);
	const mimeType = (source.mimeType || source.fileType || '').toLowerCase();
	if (!hash || !mimeType.startsWith('image/') || cmd.sourceRevision !== hash || cmd.sourceSha256 !== hash ||
		cmd.position.x !== anchor.u || cmd.position.y !== anchor.v || cmd.position.z !== 0) {
		throw new MarkerSourceMismatchError();
	}
}

function sameAnchor(a: MarkerAnchor | null, b: MarkerAnchor | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind === 'IMAGE_UV' && b.kind === 'IMAGE_UV') return a.u === b.u && a.v === b.v;
	if (a.kind === 'MESH_SURFACE' && b.kind === 'MESH_SURFACE') {
		return a.meshId === b.meshId && a.triangleIndex === b.triangleIndex &&
			a.barycentric.every((weight, index) => weight === b.barycentric[index]);
	}
	return false;
}

export type MarkerPosition = { x: number; y: number; z: number };

export type MoveMarkerCommand = {
	caseId: string;
	sceneKey: string;
	markerId: string;
	evidenceId: string;
	commandId: string;
	expectedRevision: number;
	position: MarkerPosition;
	/** If provided, update the source anchor atomically with the displayed position. */
	anchor?: MarkerAnchor | null;
	sourceRevision?: string | null;
	sourceSha256?: string | null;
	userId: number;
};

export type MoveMarkerResult = {
	markerId: string;
	revision: number;
	position: MarkerPosition;
	replayed: boolean;
};

export class MarkerNotFoundError extends Error {
	constructor() {
		super('MARKER_NOT_FOUND');
		this.name = 'MarkerNotFoundError';
	}
}

export class MarkerConflictError extends Error {
	constructor(public readonly currentRevision: number | null) {
		super('MARKER_CONFLICT');
		this.name = 'MarkerConflictError';
	}
}

export class EvidenceMismatchError extends Error {
	constructor() {
		super('EVIDENCE_MISMATCH');
		this.name = 'EvidenceMismatchError';
	}
}

export class CommandReuseError extends Error {
	constructor() {
		super('COMMAND_ID_REUSED_FOR_DIFFERENT_TARGET');
		this.name = 'CommandReuseError';
	}
}

export type CreateMarkerCommand = {
	caseId: string;
	sceneKey: string;
	markerId: string;
	evidenceId: string;
	commandId: string;
	position: MarkerPosition;
	label: string | null;
	userId: number;
	/** Optional anchor (MARK-01). Stored as DRAFT; review status is never set here. */
	anchor?: MarkerAnchor | null;
	sourceRevision?: string | null;
	sourceSha256?: string | null;
};

/**
 * Creates a marker in one transaction with its MARKER_CREATED event and outbox row.
 * The client supplies markerId (UUID) and commandId; a repeated commandId replays.
 */
export async function createMarker(
	db: TransactionalDb,
	cmd: CreateMarkerCommand
): Promise<MoveMarkerResult> {
	const run = () =>
		db.transaction(async (tx) => {
			const [prior] = await tx
				.select()
				.from(sceneEvents)
				.where(eq(sceneEvents.commandId, cmd.commandId))
				.limit(1);
			if (prior) {
				// A replay must match every field of the original create, not just the identifiers.
				// Compared against the committed event payload, not the marker's current row (a later move is legitimate).
				const stored = prior.payload as {
					position?: MarkerPosition;
					evidenceId?: string;
					label?: string | null;
					anchor?: MarkerAnchor | null;
					sourceRevision?: string | null;
					sourceSha256?: string | null;
				};
				const sameIdentity = prior.eventType === 'MARKER_CREATED' &&
					prior.markerId === cmd.markerId && prior.caseId === cmd.caseId && prior.sceneKey === cmd.sceneKey;
				const sameFields =
					typeof stored.evidenceId === 'string' &&
					stored.evidenceId === cmd.evidenceId &&
					(stored.label ?? null) === (cmd.label ?? null) &&
					!!stored.position &&
					stored.position.x === cmd.position.x &&
					stored.position.y === cmd.position.y &&
					stored.position.z === cmd.position.z &&
					// Events written before MARK-01 carry no anchor fields; treat them as null.
					sameAnchor(stored.anchor ?? null, cmd.anchor ?? null) &&
					(stored.sourceRevision ?? null) === (cmd.sourceRevision ?? null) &&
					(stored.sourceSha256 ?? null) === (cmd.sourceSha256 ?? null);
				if (!sameIdentity || !sameFields) {
					throw new CommandReuseError();
				}
				return {
					markerId: cmd.markerId,
					revision: prior.aggregateRevision,
					position: stored.position as MarkerPosition,
					replayed: true
				};
			}

			// Same-case evidence only: a marker may not reference another case's (or a deleted) exhibit.
			const [owned] = await tx
				.select({ hash: evidence.hash, mimeType: evidence.mimeType, fileType: evidence.fileType })
				.from(evidence)
				.where(and(eq(evidence.id, cmd.evidenceId), eq(evidence.caseId, cmd.caseId), isNull(evidence.deletedAt)))
				.limit(1)
				.for('share');
			if (!owned) throw new EvidenceNotInCaseError();
			if (cmd.anchor?.kind === 'IMAGE_UV') assertImageAnchorSource(owned, cmd, cmd.anchor);

			await tx.insert(sceneMarkers).values({
				id: cmd.markerId,
				caseId: cmd.caseId,
				sceneKey: cmd.sceneKey,
				markerKey: cmd.markerId,
				evidenceId: cmd.evidenceId,
				posX: cmd.position.x,
				posY: cmd.position.y,
				posZ: cmd.position.z,
				label: cmd.label,
				sourceRevision: cmd.sourceRevision ?? null,
				sourceSha256: cmd.sourceSha256 ?? null,
				...anchorRowValues(cmd.anchor),
				revision: 1,
				createdBy: cmd.userId
			});

			const [event] = await tx
				.insert(sceneEvents)
				.values({
					caseId: cmd.caseId,
					sceneKey: cmd.sceneKey,
					commandId: cmd.commandId,
					eventType: 'MARKER_CREATED',
					markerId: cmd.markerId,
					aggregateRevision: 1,
					payload: {
						position: cmd.position,
						evidenceId: cmd.evidenceId,
						label: cmd.label,
						anchor: cmd.anchor ?? null,
						sourceRevision: cmd.sourceRevision ?? null,
						sourceSha256: cmd.sourceSha256 ?? null,
					},
					createdBy: cmd.userId
				})
				.returning({ id: sceneEvents.id });
			await tx.insert(sceneEventOutbox).values({ eventId: event.id });

			return { markerId: cmd.markerId, revision: 1, position: cmd.position, replayed: false };
		});

	try {
		return await run();
	} catch (err) {
		if (isUniqueViolation(err)) return run();
		throw err;
	}
}

type UniqueViolation = { code?: string };

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as UniqueViolation).code === '23505';
}

// Structural type: the app client and a test client both satisfy this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactionalDb = { transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T> };

async function attempt(db: TransactionalDb, cmd: MoveMarkerCommand): Promise<MoveMarkerResult> {
	return db.transaction(async (tx) => {
		const [prior] = await tx
			.select()
			.from(sceneEvents)
			.where(eq(sceneEvents.commandId, cmd.commandId))
			.limit(1);

		if (prior) {
			if (
				prior.markerId !== cmd.markerId ||
				prior.caseId !== cmd.caseId ||
				prior.sceneKey !== cmd.sceneKey ||
				prior.eventType !== 'MARKER_MOVED'
			) {
				throw new CommandReuseError();
			}
			const payload = prior.payload as {
				position: MarkerPosition;
				evidenceId?: string;
				anchor?: MarkerAnchor | null;
				sourceRevision?: string | null;
				sourceSha256?: string | null;
			};
			if (
				!payload.position ||
				payload.position.x !== cmd.position.x ||
				payload.position.y !== cmd.position.y ||
				payload.position.z !== cmd.position.z ||
				(payload.evidenceId !== undefined && payload.evidenceId !== cmd.evidenceId) ||
				!sameAnchor(payload.anchor ?? null, cmd.anchor ?? null) ||
				(cmd.sourceRevision !== undefined && (payload.sourceRevision ?? null) !== cmd.sourceRevision) ||
				(cmd.sourceSha256 !== undefined && (payload.sourceSha256 ?? null) !== cmd.sourceSha256)
			) throw new CommandReuseError();
			return {
				markerId: cmd.markerId,
				revision: prior.aggregateRevision,
				position: payload.position,
				replayed: true
			};
		}

		const [marker] = await tx
			.select()
			.from(sceneMarkers)
			.where(
				and(
					eq(sceneMarkers.id, cmd.markerId),
					eq(sceneMarkers.caseId, cmd.caseId),
					eq(sceneMarkers.sceneKey, cmd.sceneKey),
					isNull(sceneMarkers.deletedAt)
				)
			)
			.limit(1);

		if (!marker) throw new MarkerNotFoundError();
		if (marker.evidenceId !== cmd.evidenceId) throw new EvidenceMismatchError();
		if (marker.revision !== cmd.expectedRevision) {
			throw new MarkerConflictError(marker.revision);
		}

		if (marker.anchorKind === 'IMAGE_UV' || cmd.anchor?.kind === 'IMAGE_UV') {
			if (cmd.anchor?.kind !== 'IMAGE_UV' ||
				(marker.sourceRevision !== null && marker.sourceRevision !== cmd.sourceRevision) ||
				(marker.anchorKind !== null && marker.anchorKind !== 'IMAGE_UV')) {
				throw new MarkerSourceMismatchError();
			}
			const [source] = await tx
				.select({ hash: evidence.hash, mimeType: evidence.mimeType, fileType: evidence.fileType })
				.from(evidence)
				.where(and(eq(evidence.id, cmd.evidenceId), eq(evidence.caseId, cmd.caseId), isNull(evidence.deletedAt)))
				.limit(1)
				.for('share');
			if (!source) throw new EvidenceNotInCaseError();
			assertImageAnchorSource(source, cmd, cmd.anchor);
		}

		const [updated] = await tx
			.update(sceneMarkers)
			.set({
				posX: cmd.position.x,
				posY: cmd.position.y,
				posZ: cmd.position.z,
				...(cmd.anchor !== undefined ? anchorRowValues(cmd.anchor) : {}),
				...(cmd.sourceRevision !== undefined ? { sourceRevision: cmd.sourceRevision } : {}),
				...(cmd.sourceSha256 !== undefined ? { sourceSha256: cmd.sourceSha256 } : {}),
				revision: sql`${sceneMarkers.revision} + 1`,
				updatedAt: sql`now()`
			})
			.where(
				and(eq(sceneMarkers.id, cmd.markerId), eq(sceneMarkers.revision, cmd.expectedRevision))
			)
			.returning();

		if (!updated) throw new MarkerConflictError(null);

		const [event] = await tx
			.insert(sceneEvents)
			.values({
				caseId: cmd.caseId,
				sceneKey: cmd.sceneKey,
				commandId: cmd.commandId,
				eventType: 'MARKER_MOVED',
				markerId: cmd.markerId,
				aggregateRevision: updated.revision,
				payload: {
					position: cmd.position,
					evidenceId: cmd.evidenceId,
					...(cmd.anchor !== undefined ? { anchor: cmd.anchor } : {}),
					...(cmd.sourceRevision !== undefined ? { sourceRevision: cmd.sourceRevision } : {}),
					...(cmd.sourceSha256 !== undefined ? { sourceSha256: cmd.sourceSha256 } : {})
				},
				createdBy: cmd.userId
			})
			.returning({ id: sceneEvents.id });

		await tx.insert(sceneEventOutbox).values({ eventId: event.id });

		return {
			markerId: cmd.markerId,
			revision: updated.revision,
			position: cmd.position,
			replayed: false
		};
	});
}

/**
 * Commits one marker move. A concurrent duplicate commandId loses the unique-index race,
 * so it is retried once and then resolves as a replay of the winning commit.
 */
export async function moveMarker(
	db: TransactionalDb,
	cmd: MoveMarkerCommand
): Promise<MoveMarkerResult> {
	try {
		return await attempt(db, cmd);
	} catch (err) {
		if (isUniqueViolation(err)) return attempt(db, cmd);
		throw err;
	}
}

export type DeleteMarkerCommand = Omit<MoveMarkerCommand, 'position'>;

/** Soft-delete a marker and append its event/outbox row atomically. */
export async function deleteMarker(
	db: TransactionalDb,
	cmd: DeleteMarkerCommand
): Promise<MoveMarkerResult> {
	const attemptDelete = () => db.transaction(async (tx) => {
		const [prior] = await tx.select().from(sceneEvents).where(eq(sceneEvents.commandId, cmd.commandId)).limit(1);
		if (prior) {
			if (prior.markerId !== cmd.markerId || prior.caseId !== cmd.caseId || prior.sceneKey !== cmd.sceneKey || prior.eventType !== 'MARKER_DELETED') {
				throw new CommandReuseError();
			}
			const payload = prior.payload as { position: MarkerPosition };
			return { markerId: cmd.markerId, revision: prior.aggregateRevision, position: payload.position, replayed: true };
		}

		const [marker] = await tx.select().from(sceneMarkers).where(and(
			eq(sceneMarkers.id, cmd.markerId),
			eq(sceneMarkers.caseId, cmd.caseId),
			eq(sceneMarkers.sceneKey, cmd.sceneKey),
			isNull(sceneMarkers.deletedAt)
		)).limit(1);
		if (!marker) throw new MarkerNotFoundError();
		if (marker.evidenceId !== cmd.evidenceId) throw new EvidenceMismatchError();
		if (marker.revision !== cmd.expectedRevision) throw new MarkerConflictError(marker.revision);

		const nextRevision = cmd.expectedRevision + 1;
		const [updated] = await tx.update(sceneMarkers).set({
			deletedAt: sql`now()`,
			revision: nextRevision,
			updatedAt: sql`now()`
		}).where(and(
			eq(sceneMarkers.id, cmd.markerId),
			eq(sceneMarkers.caseId, cmd.caseId),
			eq(sceneMarkers.sceneKey, cmd.sceneKey),
			eq(sceneMarkers.revision, cmd.expectedRevision),
			isNull(sceneMarkers.deletedAt)
		)).returning();
		if (!updated) throw new MarkerConflictError(null);

		const [event] = await tx.insert(sceneEvents).values({
			caseId: cmd.caseId,
			sceneKey: cmd.sceneKey,
			commandId: cmd.commandId,
			eventType: 'MARKER_DELETED',
			markerId: cmd.markerId,
			aggregateRevision: nextRevision,
			payload: { position: { x: marker.posX, y: marker.posY, z: marker.posZ }, evidenceId: marker.evidenceId },
			createdBy: cmd.userId
		}).returning({ id: sceneEvents.id });
		await tx.insert(sceneEventOutbox).values({ eventId: event.id });
		return { markerId: cmd.markerId, revision: nextRevision, position: { x: marker.posX, y: marker.posY, z: marker.posZ }, replayed: false };
	});

	try { return await attemptDelete(); }
	catch (err) { if (isUniqueViolation(err)) return attemptDelete(); throw err; }
}

export type SavedMarker = {
	markerId: string;
	evidenceId: string;
	label: string | null;
	revision: number;
	position: MarkerPosition;
	anchor: MarkerAnchor | null;
	anchorStatus: string;
	provenance: { sourceRevision: string | null; sourceSha256: string | null };
};

/** Live (not soft-deleted) markers for one scene, oldest first. Read-only. */
export async function listSceneMarkers(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	db: { select: (...args: any[]) => any },
	caseId: string,
	sceneKey: string
): Promise<SavedMarker[]> {
	const rows = await db
		.select()
		.from(sceneMarkers)
		.where(
			and(
				eq(sceneMarkers.caseId, caseId),
				eq(sceneMarkers.sceneKey, sceneKey),
				isNull(sceneMarkers.deletedAt)
			)
		)
		.orderBy(sceneMarkers.createdAt, sceneMarkers.id);
	return rows.map((row: typeof sceneMarkers.$inferSelect) => ({
		markerId: row.id,
		evidenceId: row.evidenceId,
		label: row.label,
		revision: row.revision,
		position: { x: row.posX, y: row.posY, z: row.posZ },
		anchor: row.anchorKind === 'IMAGE_UV' && row.anchorU !== null && row.anchorV !== null
			? { kind: 'IMAGE_UV', u: row.anchorU, v: row.anchorV }
			: row.anchorKind === 'MESH_SURFACE' && row.meshId !== null && row.triangleIndex !== null && row.barycentric !== null
				? { kind: 'MESH_SURFACE', meshId: row.meshId, triangleIndex: row.triangleIndex, barycentric: row.barycentric }
				: null,
		anchorStatus: row.anchorStatus,
		provenance: { sourceRevision: row.sourceRevision, sourceSha256: row.sourceSha256 }
	}));
}
