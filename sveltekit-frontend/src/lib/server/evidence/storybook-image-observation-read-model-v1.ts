import { createHash } from 'node:crypto';
import { storybookImageObservationsV1Schema, type StorybookImageObservationsV1 } from '$lib/shared/storybook-image-observations-v1.js';
import type { EvidenceVisualAnalysisV1 } from './evidence-visual-analysis-v1.js';
import { sam2MaskObjectKeyV1 } from './sam2-mask-writer-v1.js';
import { selectSam2PromptBoxesV1, type YoloBoxV1 } from './sam2-silhouette-adapter-v1.js';

const checksum = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function buildStorybookImageObservationReadModelV1(input: {
	evidenceId: string; sourceRevision: string; analysisRevision: string; width: number; height: number;
	imageOcr?: import('$lib/shared/storybook-image-observations-v1.js').ImageOcrStageV1;
	analysis: Pick<EvidenceVisualAnalysisV1, 'sourceRevision' | 'objectDetections' | 'silhouettes' | 'stageErrors' | 'detectionExecuted' |
		'silhouetteStageStatus' | 'visionSummary' | 'visionModelId'>;
}) {
	const { evidenceId, sourceRevision, analysisRevision, width, height, analysis, imageOcr } = input;
	if (analysis.sourceRevision !== sourceRevision || width <= 0 || height <= 0) return null;
	const scope = { evidenceId, sourceRevision, analysisRevision, width, height };
	const detections: StorybookImageObservationsV1['detections'] = [];
	const boxes: YoloBoxV1[] = [];
	for (const [ordinal, detection] of analysis.objectDetections.entries()) {
		const [left, top, right, bottom] = detection.bbox;
		if (left === undefined || top === undefined || right === undefined || bottom === undefined ||
			left < 0 || top < 0 || right > width || bottom > height || right <= left || bottom <= top) return null;
		const label = detection.class;
		const bbox: [number, number, number, number] = [left, top, right, bottom];
		const row = { kind: 'detection' as const, ordinal, label, confidence: detection.confidence, bbox, modelRevision: null };
		detections.push({ ...row, observationId: checksum([scope, row]) });
		boxes.push({ label, confidence: detection.confidence, bboxNormalized: [left / width, top / height, right / width, bottom / height] });
	}
	const prompts = selectSam2PromptBoxesV1(boxes);
	const masks: StorybookImageObservationsV1['masks'] = [];
	const maskKeys = new Map<string, string>();
	for (const mask of analysis.silhouettes ?? []) {
		const key = sam2MaskObjectKeyV1(mask.maskSha256.toLowerCase());
		const prompt = prompts[mask.targetBoxIndex];
		if (!prompt || key !== mask.maskObjectKey) continue;
		const detectionIndex = boxes.indexOf(prompt);
		if (mask.sourceDetectionIndex !== undefined && mask.sourceDetectionIndex !== detectionIndex) continue;
		const detection = detections[detectionIndex];
		if (!detection || detection.label !== mask.label) continue;
		const row = { kind: 'segmentation_mask' as const, label: mask.label, modelRevision: mask.modelRevision ?? null,
			detectionObservationId: detection.observationId, artifactSha256: `sha256:${mask.maskSha256.toLowerCase()}` };
		const observationId = checksum([scope, row]);
		if (maskKeys.has(observationId)) continue;
		masks.push({ ...row, observationId });
		maskKeys.set(observationId, key);
	}
	const sceneContextFailed = analysis.stageErrors.some((reason) => reason.startsWith('vision:'));
	const description = analysis.visionSummary;
	const context = !sceneContextFailed && description?.trim() ? {
		kind: 'scene_context' as const, description, modelId: analysis.visionModelId ?? null,
		reviewState: 'UNREVIEWED_PROPOSAL' as const,
	} : null;
	const span = imageOcr?.status === 'COMPLETED' ? {
		kind: 'image_ocr_span' as const, inputSha256: imageOcr.inputSha256, modelRevision: imageOcr.policyRevision,
		text: imageOcr.text, startUtf16: 0, endUtf16: imageOcr.text.length, truncated: imageOcr.truncated,
	} : null;
	const manifest = {
		schema: 'atlas.storybook-image-observations.v1' as const,
		...scope,
		coordinateSpace: 'ORIGINAL_IMAGE_PIXELS' as const,
		detectionCoverage: analysis.detectionExecuted === false || analysis.stageErrors.some((reason) => reason.startsWith('detection:'))
			? 'FAILED_OR_UNAVAILABLE' : analysis.detectionExecuted || detections.length ? 'RECORDED' : 'NOT_RECORDED',
		maskCoverage: analysis.silhouetteStageStatus === 'MODEL_UNAVAILABLE_SKIPPED' || analysis.silhouetteStageStatus === 'FAILED' ||
			analysis.stageErrors.some((reason) => reason.startsWith('silhouette:')) ? 'FAILED_OR_UNAVAILABLE'
			: analysis.silhouetteStageStatus === 'EXECUTED' || analysis.silhouettes ? 'RECORDED'
				: analysis.silhouetteStageStatus === 'NOT_RUN' ? 'NOT_RUN' : 'NOT_RECORDED',
		sceneContextCoverage: sceneContextFailed ? 'FAILED_OR_UNAVAILABLE' : context ? 'RECORDED' : 'NOT_RECORDED',
		...(context ? { sceneContext: { ...context, observationId: checksum([scope, context]) } } : {}),
		...(imageOcr ? { ocrCoverage: imageOcr.status } : {}),
		...(span ? { ocrSpan: { ...span, observationId: checksum([scope, span]) } } : {}),
		detections, masks, unresolvedMaskCount: (analysis.silhouettes?.length ?? 0) - masks.length,
	};
	const parsed = storybookImageObservationsV1Schema.safeParse({ ...manifest, observationRevision: checksum(manifest) });
	return parsed.success ? { manifest: parsed.data, maskKeys } : null;
}
