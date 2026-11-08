import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { sceneDocumentV1Schema, stableStringifySceneDocumentV1, type SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
import { db } from '$lib/server/db/client.js';
import { sceneDocumentRevisions } from '$lib/server/db/schema/scene-document-revisions.js';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';

export const sceneRevisionCommandV1Schema = z.object({
	commandId: z.uuid(),
	expectedRevision: z.number().int().min(0),
	manifest: sceneDocumentV1Schema
}).strict();

export type SceneRevisionCommandV1 = z.infer<typeof sceneRevisionCommandV1Schema>;

export function hashSceneDocumentV1(manifest: SceneDocumentV1): string {
	return createHash('sha256').update(stableStringifySceneDocumentV1(manifest), 'utf8').digest('hex');
}

type SceneRevisionReadbackRowV1 = Pick<
	typeof sceneDocumentRevisions.$inferSelect,
	'caseId' | 'sceneId' | 'revision' | 'parentManifestSha256' | 'manifestSha256' | 'manifest'
>;

/** Revalidate database JSONB and its revision bindings before exposing a saved document. */
export function verifySceneDocumentRevisionReadbackV1(input: {
	caseId: string;
	sceneId: string;
	row: SceneRevisionReadbackRowV1;
}): SceneRevisionReadbackRowV1 & { manifest: SceneDocumentV1 } {
	const parsed = sceneDocumentV1Schema.safeParse(input.row.manifest);
	if (!parsed.success) throw new Error('SCENE_REVISION_READBACK_MANIFEST_INVALID');
	const manifest = parsed.data;
	if (
		input.row.caseId !== input.caseId ||
		input.row.sceneId !== input.sceneId ||
		manifest.caseId !== input.caseId ||
		manifest.sceneId !== input.sceneId ||
		manifest.revision !== input.row.revision ||
		manifest.parentManifestSha256 !== input.row.parentManifestSha256 ||
		hashSceneDocumentV1(manifest) !== input.row.manifestSha256
	) {
		throw new Error('SCENE_REVISION_READBACK_INTEGRITY_MISMATCH');
	}
	return { ...input.row, manifest };
}

export function validateSceneRevisionBindingV1(input: {
	caseId: string;
	sceneId: string;
	command: SceneRevisionCommandV1;
}): { manifest: SceneDocumentV1; manifestSha256: string } {
	const { caseId, sceneId, command } = input;
	const manifest = sceneDocumentV1Schema.parse(command.manifest);
	if (manifest.status === 'FIXTURE') throw new Error('SCENE_REVISION_FIXTURE_NOT_ADMISSIBLE');
	// A client cannot declare a scene measured or assert original-source lineage.
	// That requires a server-verified source/object receipt, which this vertical
	// slice has not yet connected to the manifest writer.
	if (manifest.status !== 'HYPOTHESIS') throw new Error('SCENE_REVISION_MEASURED_STATUS_NOT_ADMISSIBLE');
	if (manifest.assets.some((asset) => asset.role === 'SOURCE')) throw new Error('SCENE_REVISION_SOURCE_ASSET_NOT_VERIFIED');
	if (manifest.caseId !== caseId || manifest.sceneId !== sceneId) throw new Error('SCENE_REVISION_SCOPE_MISMATCH');
	if (manifest.revision !== command.expectedRevision + 1) throw new Error('SCENE_REVISION_NUMBER_MISMATCH');
	return { manifest, manifestSha256: hashSceneDocumentV1(manifest) };
}

export function validateSceneEvidenceSourceBindingsV1(input: {
	caseId: string;
	manifest: SceneDocumentV1;
	evidenceRows: Array<{ id: string; caseId: string | null; hash: string | null }>;
}): void {
	const rows = new Map(input.evidenceRows.map((row) => [row.id, row]));
	const bindings = [
		...(input.manifest.evidenceBindings ?? []),
		...input.manifest.evidenceSources.map(({ evidenceId, sourceRevision }) => ({ evidenceId, sourceRevision }))
	];
	const uniqueBindings = new Map<string, string>();
	for (const binding of bindings) {
		const priorRevision = uniqueBindings.get(binding.evidenceId);
		if (priorRevision && priorRevision !== binding.sourceRevision) throw new Error('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		uniqueBindings.set(binding.evidenceId, binding.sourceRevision);
	}
	for (const [evidenceId, sourceRevision] of uniqueBindings) {
		const row = rows.get(evidenceId);
		const canonicalRevision = row?.hash
			? (row.hash.startsWith('sha256:') ? row.hash : `sha256:${row.hash}`)
			: null;
		if (!row || row.caseId !== input.caseId || canonicalRevision !== sourceRevision) {
			throw new Error('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		}
	}
	for (const binding of input.manifest.evidenceSources) {
		if (binding.decoderRevision !== SPZ_DECODER_REVISION_V1 || binding.representationRevision !== SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1) {
			throw new Error('SCENE_REVISION_EVIDENCE_SOURCE_REVISION_UNSUPPORTED');
		}
	}
}

/** Append-only revision save with command idempotency and optimistic head comparison. */
export async function appendSceneDocumentRevisionV1(input: {
	caseId: string;
	sceneId: string;
	actorId: number;
	command: SceneRevisionCommandV1;
}) {
	const binding = validateSceneRevisionBindingV1(input);
	return db.transaction(async (tx) => {
		// Serialize head comparison for this case/scene pair. The unique index is
		// still the final guard if a caller bypasses this transaction owner.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.caseId}), hashtext(${input.sceneId}))`);
		const [replay] = await tx.select().from(sceneDocumentRevisions)
			.where(eq(sceneDocumentRevisions.commandId, input.command.commandId)).limit(1);
		if (replay) {
			if (replay.caseId !== input.caseId || replay.sceneId !== input.sceneId || replay.manifestSha256 !== binding.manifestSha256) {
				throw new Error('SCENE_REVISION_COMMAND_REUSE');
			}
			const verified = verifySceneDocumentRevisionReadbackV1({ caseId: input.caseId, sceneId: input.sceneId, row: replay });
			return { replayed: true, revision: verified.revision, manifestSha256: verified.manifestSha256, manifest: verified.manifest };
		}

		const [head] = await tx.select().from(sceneDocumentRevisions)
			.where(and(eq(sceneDocumentRevisions.caseId, input.caseId), eq(sceneDocumentRevisions.sceneId, input.sceneId)))
			.orderBy(desc(sceneDocumentRevisions.revision)).limit(1);
		const currentRevision = head?.revision ?? 0;
		if (currentRevision !== input.command.expectedRevision) throw new Error('SCENE_REVISION_CONFLICT');
		const expectedParentHash = head?.manifestSha256 ?? null;
		if (binding.manifest.parentManifestSha256 !== expectedParentHash) throw new Error('SCENE_REVISION_PARENT_HASH_MISMATCH');
		for (const asset of binding.manifest.assets) {
			if (asset.role === 'SOURCE') throw new Error('SCENE_REVISION_SOURCE_ASSET_NOT_VERIFIED');
			const [registered] = await tx.select().from(sceneAssets).where(and(
				eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.assetId, asset.assetId)
			)).limit(1);
			if (!registered || registered.sha256 !== asset.sha256 || registered.byteLength !== asset.bytes || registered.format !== asset.format) {
				throw new Error('SCENE_REVISION_ASSET_NOT_REGISTERED');
			}
		}
		if (binding.manifest.evidenceSources.length || (binding.manifest.evidenceBindings?.length ?? 0) > 0) {
			const evidenceIds = [...new Set([
				...binding.manifest.evidenceSources.map((source) => source.evidenceId),
				...(binding.manifest.evidenceBindings ?? []).map((source) => source.evidenceId)
			])];
			const evidenceRows = await tx.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash })
				.from(evidence).where(inArray(evidence.id, evidenceIds));
			validateSceneEvidenceSourceBindingsV1({ caseId: input.caseId, manifest: binding.manifest, evidenceRows });
		}
		const [saved] = await tx.insert(sceneDocumentRevisions).values({
			caseId: input.caseId,
			sceneId: input.sceneId,
			revision: binding.manifest.revision,
			commandId: input.command.commandId,
			parentManifestSha256: expectedParentHash,
			manifestSha256: binding.manifestSha256,
			manifest: binding.manifest,
			createdBy: input.actorId
		}).returning();
		if (!saved) throw new Error('SCENE_REVISION_INSERT_READBACK_FAILED');
		const verified = verifySceneDocumentRevisionReadbackV1({ caseId: input.caseId, sceneId: input.sceneId, row: saved });
		return { replayed: false, revision: verified.revision, manifestSha256: verified.manifestSha256, manifest: verified.manifest };
	});
}

export async function readSceneDocumentRevisionV1(input: { caseId: string; sceneId: string; revision?: number }) {
	const conditions = [eq(sceneDocumentRevisions.caseId, input.caseId), eq(sceneDocumentRevisions.sceneId, input.sceneId)];
	const [row] = input.revision === undefined
		? await db.select().from(sceneDocumentRevisions).where(and(...conditions)).orderBy(desc(sceneDocumentRevisions.revision)).limit(1)
		: await db.select().from(sceneDocumentRevisions).where(and(...conditions, eq(sceneDocumentRevisions.revision, input.revision))).limit(1);
	return row ? verifySceneDocumentRevisionReadbackV1({ caseId: input.caseId, sceneId: input.sceneId, row }) : null;
}
