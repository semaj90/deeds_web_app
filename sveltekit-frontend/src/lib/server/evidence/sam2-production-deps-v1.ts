/**
 * Production wiring for the SAM 2 silhouette stage.
 *
 * Off by default. Enabled only when SAM2_ENABLED=1, and then every required path and the artifact
 * bucket must be set, or this throws (fail-closed configuration).
 *
 * Environment:
 *   SAM2_ENABLED=1
 *   SAM2_PYTHON       absolute path to the isolated SAM 2 Python (e.g. C:/Users/james/.venvs/sam2-tiny/Scripts/python.exe)
 *   SAM2_CONFIG       SAM 2 config name (e.g. configs/sam2.1/sam2.1_hiera_t.yaml)
 *   SAM2_CHECKPOINT   absolute path to the checkpoint (e.g. models/sam2/sam2.1_hiera_tiny.pt)
 *   SAM2_RUNNER       absolute path to python/atlas_sam2_silhouette_runner_v1.py (defaults to repo-relative)
 *   SAM2_ARTIFACT_BUCKET  derived-artifact bucket (never the evidence bucket)
 */
import { resolve } from 'node:path';
import { headFileInSeaweed, putFileToSeaweed } from '$lib/server/storage/seaweed.js';
import { createSam2SubprocessRunnerV1 } from './sam2-subprocess-runner-v1.js';
import { createSam2MaskWriterV1, type Sam2MaskStoragePortV1 } from './sam2-mask-writer-v1.js';
import { runSam2SilhouetteAdapterV1, type Sam2SilhouetteResultV1, type YoloBoxV1 } from './sam2-silhouette-adapter-v1.js';

export type Sam2SilhouetteStageInputV1 = { buffer: Buffer; mimeType: string; boxes: YoloBoxV1[] };
export type Sam2SilhouetteStageV1 = (input: Sam2SilhouetteStageInputV1) => Promise<Sam2SilhouetteResultV1>;

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
	const value = env[key]?.trim();
	if (!value) throw new Error(`SAM2_CONFIG_MISSING:${key}`);
	return value;
}

function isNotFound(error: unknown): boolean {
	const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
	return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/** Storage port over the existing SeaweedFS client. Maps a missing object to null, not an error. */
export const sam2SeaweedMaskStorageV1: Sam2MaskStoragePortV1 = {
	async head({ bucket, objectKey }) {
		try {
			const stat = await headFileInSeaweed({ bucket, objectKey });
			return { contentLength: stat.contentLength };
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
	},
	async put({ bucket, objectKey, bytes, contentType, metadata }) {
		return putFileToSeaweed({ bucket, objectKey, bytes, contentType, metadata });
	},
};

/**
 * Returns the SAM 2 stage, or undefined when SAM2_ENABLED is not "1".
 * Throws on partial configuration when enabled.
 */
export function createSam2SilhouetteStageFromEnvV1(env: NodeJS.ProcessEnv = process.env): Sam2SilhouetteStageV1 | undefined {
	if (env.SAM2_ENABLED !== '1') return undefined;
	const python = requireEnv(env, 'SAM2_PYTHON');
	const config = requireEnv(env, 'SAM2_CONFIG');
	const checkpoint = requireEnv(env, 'SAM2_CHECKPOINT');
	const bucket = requireEnv(env, 'SAM2_ARTIFACT_BUCKET');
	const script = env.SAM2_RUNNER?.trim() || resolve(process.cwd(), '..', 'python', 'atlas_sam2_silhouette_runner_v1.py');
	const runMask = createSam2SubprocessRunnerV1({ python, script, config, checkpoint });
	const writeMask = createSam2MaskWriterV1({ bucket, storage: sam2SeaweedMaskStorageV1 });
	return (input) => runSam2SilhouetteAdapterV1({ bytes: input.buffer, mimeType: input.mimeType, boxes: input.boxes }, { runMask, writeMask });
}
