/**
 * Adapter from YOLO boxes to SAM 2 silhouette masks, shaped for the existing
 * `sam2_alpha_silhouette` contract (evidence-image-analysis-contract-v1.ts).
 *
 * Both the mask runner (SAM 2 process) and the mask writer (object storage) are injected
 * ports, so this module has no runtime or storage dependency of its own. Generated masks
 * are derivative 2D artifacts: never canonical evidence, never 3D.
 *
 * Fail-closed: any invalid box, runner error, or storage error returns FAILED with no masks.
 */
import { createHash } from 'node:crypto';
import { Sam2SegmentationMaskSchemaV1 } from './evidence-image-analysis-contract-v1.js';

export const SAM2_SILHOUETTE_ADAPTER_VERSION_V1 = 'atlas.sam2-silhouette-adapter.v1' as const;
export const SAM2_MAX_BOXES_V1 = 8;
export const SAM2_MIN_BOX_CONFIDENCE_V1 = 0.3;

export type NormalizedBoxV1 = [number, number, number, number];

export type YoloBoxV1 = {
	label: string;
	confidence: number;
	bboxNormalized: NormalizedBoxV1;
};

/** Injected: runs SAM 2 for one normalized box. Returns a PNG-encoded binary mask. */
export type Sam2MaskRunnerV1 = (input: {
	bytes: Uint8Array;
	mimeType: string;
	bboxNormalized: NormalizedBoxV1;
}) => Promise<{ maskPng: Uint8Array; iouScore: number }>;

/** Injected: stores one mask and returns its object key. Must not overwrite existing objects. */
export type Sam2MaskWriterV1 = (input: {
	maskPng: Uint8Array;
	maskSha256: string;
	targetBoxIndex: number;
}) => Promise<{ maskObjectKey: string }>;

export type Sam2SilhouetteResultV1 = {
	status: 'EXECUTED' | 'FAILED' | 'MODEL_UNAVAILABLE_SKIPPED';
	masks: Array<ReturnType<typeof Sam2SegmentationMaskSchemaV1.parse> & { label: string }>;
};

function isUnitBox(box: readonly number[]): box is NormalizedBoxV1 {
	if (box.length !== 4) return false;
	const [x0, y0, x1, y1] = box as NormalizedBoxV1;
	return [x0, y0, x1, y1].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && x1 > x0 && y1 > y0;
}

export function selectSam2PromptBoxesV1(boxes: readonly YoloBoxV1[]): Array<YoloBoxV1 & { bboxNormalized: NormalizedBoxV1 }> {
	const usable = boxes
		.filter((b) => b.confidence >= SAM2_MIN_BOX_CONFIDENCE_V1)
		.filter((b) => isUnitBox(b.bboxNormalized))
		.sort((a, b) => b.confidence - a.confidence)
		.slice(0, SAM2_MAX_BOXES_V1);
	return usable as Array<YoloBoxV1 & { bboxNormalized: NormalizedBoxV1 }>;
}

export async function runSam2SilhouetteAdapterV1(
	input: { bytes: Uint8Array; mimeType: string; boxes: readonly YoloBoxV1[] },
	ports: { runMask: Sam2MaskRunnerV1; writeMask: Sam2MaskWriterV1 },
): Promise<Sam2SilhouetteResultV1> {
	const prompts = selectSam2PromptBoxesV1(input.boxes);
	if (prompts.length === 0) return { status: 'EXECUTED', masks: [] };

	const masks: Sam2SilhouetteResultV1['masks'] = [];
	try {
		for (let index = 0; index < prompts.length; index++) {
			const prompt = prompts[index]!;
			const { maskPng, iouScore } = await ports.runMask({
				bytes: input.bytes,
				mimeType: input.mimeType,
				bboxNormalized: prompt.bboxNormalized,
			});
			if (maskPng.byteLength === 0) throw new Error('SAM2_EMPTY_MASK');
			if (!(iouScore >= 0 && iouScore <= 1)) throw new Error('SAM2_SCORE_OUT_OF_RANGE');
			const maskSha256 = createHash('sha256').update(maskPng).digest('hex');
			const { maskObjectKey } = await ports.writeMask({ maskPng, maskSha256, targetBoxIndex: index });
			const mask = Sam2SegmentationMaskSchemaV1.parse({
				artifactKind: 'sam2_alpha_silhouette',
				maskObjectKey,
				maskSha256,
				targetBoxIndex: index,
				sourceDetectionIndex: input.boxes.indexOf(prompt),
				label: prompt.label,
				iouScore,
				is3DReconstruction: false,
			});
			masks.push({ ...mask, label: prompt.label });
		}
	} catch {
		// Fail closed: no partial mask set is returned.
		return { status: 'FAILED', masks: [] };
	}
	return { status: 'EXECUTED', masks };
}
