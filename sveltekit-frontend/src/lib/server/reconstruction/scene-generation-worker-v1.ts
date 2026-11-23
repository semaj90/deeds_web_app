import { createHash } from 'node:crypto';
import { stableStringify, sha256Hex } from '$lib/server/analysis/stable-hash.js';
import { ENV } from '$lib/server/env.server.js';
import { getFileFromSeaweed, putFileToSeaweed } from '$lib/server/storage/seaweed.js';
import { assertArtifactBucket } from '$lib/server/storage/storage-buckets.js';
import { compileSceneGenerationJobV1 as compileRecipe } from './compile-scene-generation-job-v1.js';

interface SceneRecipeStorageV1 {
	bucket: string;
	putIfAbsent(key: string, bytes: Uint8Array): Promise<void>;
	read(key: string, maximumBytes: number): Promise<Uint8Array>;
}

export interface CompileSceneGenerationJobInputV1 {
	snapshot: unknown;
	requestSha256: string;
	storage: SceneRecipeStorageV1;
}

/** Storage entry point for a worker handling an admitted job. */
export function compileSceneGenerationJobToSeaweedV1(input: Omit<CompileSceneGenerationJobInputV1, 'storage'>) {
	const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET;
	assertArtifactBucket(bucket);
	return compileSceneGenerationJobV1({
		...input,
		storage: {
			bucket,
			async putIfAbsent(objectKey, bytes) {
				try {
					await putFileToSeaweed({ bucket, objectKey, bytes, contentType: 'application/json', ifAbsent: true });
				} catch (error) {
					// A concurrent writer may have created the same key. The caller still verifies its bytes.
					if ((error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode !== 412) throw error;
				}
			},
			read: (objectKey, maximumBytes) => getFileFromSeaweed({ bucket, objectKey, maximumBytes })
		}
	});
}

/** Compile a claimed snapshot and return a result only after independent artifact readback. */
export async function compileSceneGenerationJobV1(input: CompileSceneGenerationJobInputV1) {
	const { recipe, bytes, receipt } = compileRecipe(input);
	const artifactKey = `scene-generation/${receipt.caseId}/${receipt.sceneId}/sha256/${receipt.sha256}.json`;
	const artifact = {
		kind: 'SCENE_RUNTIME_RECIPE_V1' as const,
		bucket: input.storage.bucket,
		artifactKey,
		sha256: receipt.sha256,
		byteLength: receipt.byteLength,
		mimeType: 'application/json'
	};

	// Keep the digest independent of storage acknowledgements and attempt timestamps.
	await input.storage.putIfAbsent(artifactKey, bytes);
	const readback = await input.storage.read(artifactKey, receipt.byteLength);
	if (readback.byteLength !== receipt.byteLength || createHash('sha256').update(readback).digest('hex') !== receipt.sha256) {
		throw new Error('SCENE_GENERATION_RECIPE_READBACK_MISMATCH');
	}

	const cellsByKey = new Map<string, { cellKey: string; coordX: number; coordZ: number; placementIds: string[] }>();
	for (const { positionMeters: [x, , z], placementId } of recipe.placements) {
		const coordX = Math.floor(x / recipe.environment.cellSizeMeters);
		const coordZ = Math.floor(z / recipe.environment.cellSizeMeters);
		const cellKey = `${coordX}:${coordZ}`;
		const cell = cellsByKey.get(cellKey) ?? { cellKey, coordX, coordZ, placementIds: [] };
		cell.placementIds.push(placementId);
		cellsByKey.set(cellKey, cell);
	}
	const cells = [...cellsByKey.values()];

	const manifestContent = {
		schema: 'atlas.compiled-scene-manifest.v1' as const,
		caseId: receipt.caseId,
		sceneId: receipt.sceneId,
		expectedSceneRevision: receipt.expectedSceneRevision,
		planSha256: receipt.planHash,
		requestSha256: receipt.requestSha256,
		environmentKind: recipe.environment.kind,
		cellCount: cells.length,
		placementCount: recipe.placements.length,
		eventCueCount: recipe.eventLanes.reduce((total, lane) => total + lane.events.length, 0),
		cells,
		artifactRefs: [artifact]
	};
	const manifestSha256 = sha256Hex(stableStringify(manifestContent));
	return { manifest: { ...manifestContent, manifestSha256 }, resultRefs: [artifact] };
}
