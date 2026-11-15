/**
 * Read-only scene snapshot for the Noir crime-scene view. Loaded fresh on every request (never
 * cached) so a saved marker move is visible on the next load. Fields the database does not
 * record are returned as null; nothing is invented.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { sceneMarkers } from '$lib/server/db/schema/scene-markers.js';

export interface SceneMarkerSnapshot {
	id: string;
	sceneKey: string;
	markerKey: string;
	label: string | null;
	posX: number;
	posY: number;
	posZ: number;
	revision: number;
	evidenceId: string;
	evidenceTitle: string;
	evidenceHash: string | null;
	evidenceAddedAt: string | null;
	evidenceVerified: boolean;
}

export interface SceneSnapshot {
	caseNumber: string | null;
	markers: SceneMarkerSnapshot[];
}

export async function loadSceneSnapshot(caseId: string): Promise<SceneSnapshot | null> {
	try {
		const [caseRow] = await db
			.select({ caseNumber: cases.caseNumber })
			.from(cases)
			.where(eq(cases.id, caseId))
			.limit(1);
		if (!caseRow) return null;

		const rows = await db
			.select({
				id: sceneMarkers.id,
				sceneKey: sceneMarkers.sceneKey,
				markerKey: sceneMarkers.markerKey,
				label: sceneMarkers.label,
				posX: sceneMarkers.posX,
				posY: sceneMarkers.posY,
				posZ: sceneMarkers.posZ,
				revision: sceneMarkers.revision,
				evidenceId: evidence.id,
				evidenceTitle: evidence.title,
				evidenceHash: evidence.hash,
				evidenceUploadedAt: evidence.uploadedAt,
				evidenceVerified: evidence.verified
			})
			.from(sceneMarkers)
			.innerJoin(evidence, eq(evidence.id, sceneMarkers.evidenceId))
			.where(and(eq(sceneMarkers.caseId, caseId), isNull(sceneMarkers.deletedAt)))
			.orderBy(asc(sceneMarkers.sceneKey), asc(sceneMarkers.markerKey))
			.limit(200);

		return {
			caseNumber: caseRow.caseNumber ?? null,
			markers: rows.map((row) => ({
				id: row.id,
				sceneKey: row.sceneKey,
				markerKey: row.markerKey,
				label: row.label ?? null,
				posX: row.posX,
				posY: row.posY,
				posZ: row.posZ,
				revision: row.revision,
				evidenceId: row.evidenceId,
				evidenceTitle: row.evidenceTitle,
				evidenceHash: row.evidenceHash ?? null,
				evidenceAddedAt: row.evidenceUploadedAt ? new Date(row.evidenceUploadedAt).toISOString() : null,
				evidenceVerified: row.evidenceVerified === true
			}))
		};
	} catch (cause) {
		console.error('[scene-snapshot] load failed', cause instanceof Error ? cause.name : 'unknown');
		return null;
	}
}
