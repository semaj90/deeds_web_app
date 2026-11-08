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

export type MarkerPosition = { x: number; y: number; z: number };

export type MoveMarkerCommand = {
	caseId: string;
	sceneKey: string;
	markerId: string;
	evidenceId: string;
	commandId: string;
	expectedRevision: number;
	position: MarkerPosition;
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
				if (prior.markerId !== cmd.markerId || prior.caseId !== cmd.caseId || prior.sceneKey !== cmd.sceneKey) {
					throw new CommandReuseError();
				}
				return {
					markerId: cmd.markerId,
					revision: prior.aggregateRevision,
					position: (prior.payload as { position: MarkerPosition }).position,
					replayed: true
				};
			}

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
					payload: { position: cmd.position, evidenceId: cmd.evidenceId },
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
				prior.sceneKey !== cmd.sceneKey
			) {
				throw new CommandReuseError();
			}
			const payload = prior.payload as { position: MarkerPosition };
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

		const [updated] = await tx
			.update(sceneMarkers)
			.set({
				posX: cmd.position.x,
				posY: cmd.position.y,
				posZ: cmd.position.z,
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
				payload: { position: cmd.position },
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
		position: { x: row.posX, y: row.posY, z: row.posZ }
	}));
}
