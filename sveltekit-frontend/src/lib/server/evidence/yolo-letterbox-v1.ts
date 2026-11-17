export interface YoloLetterboxTransformV1 {
	sourceWidth: number;
	sourceHeight: number;
	scaleX: number;
	scaleY: number;
	padLeft: number;
	padTop: number;
}

export function validateYoloLetterboxTransformV1(value: unknown): YoloLetterboxTransformV1 {
	if (!value || typeof value !== 'object') throw new Error('YOLO_LETTERBOX_TRANSFORM_INVALID');
	const transform = value as Record<string, unknown>;
	const keys = ['sourceWidth', 'sourceHeight', 'scaleX', 'scaleY', 'padLeft', 'padTop'] as const;
	if (keys.some((key) => typeof transform[key] !== 'number' || !Number.isFinite(transform[key]))) {
		throw new Error('YOLO_LETTERBOX_TRANSFORM_INVALID');
	}
	const parsed = transform as unknown as YoloLetterboxTransformV1;
	if (
		!Number.isSafeInteger(parsed.sourceWidth) || parsed.sourceWidth <= 0
		|| !Number.isSafeInteger(parsed.sourceHeight) || parsed.sourceHeight <= 0
		|| parsed.scaleX <= 0 || parsed.scaleY <= 0 || parsed.padLeft < 0 || parsed.padTop < 0
	) throw new Error('YOLO_LETTERBOX_TRANSFORM_INVALID');
	return parsed;
}

/** Map a detector box from the padded model input back to original source pixels. */
export function mapYoloLetterboxBoxToSourceV1(
	box: unknown,
	transformInput: unknown,
): [number, number, number, number] {
	const transform = validateYoloLetterboxTransformV1(transformInput);
	if (!Array.isArray(box) || box.length !== 4 || box.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate))) {
		throw new Error('YOLO_LETTERBOX_BOX_INVALID');
	}
	const [x1, y1, x2, y2] = box as number[];
	const mapped: [number, number, number, number] = [
		Math.max(0, Math.min(transform.sourceWidth, (x1 - transform.padLeft) / transform.scaleX)),
		Math.max(0, Math.min(transform.sourceHeight, (y1 - transform.padTop) / transform.scaleY)),
		Math.max(0, Math.min(transform.sourceWidth, (x2 - transform.padLeft) / transform.scaleX)),
		Math.max(0, Math.min(transform.sourceHeight, (y2 - transform.padTop) / transform.scaleY)),
	];
	if (mapped[2] <= mapped[0] || mapped[3] <= mapped[1]) throw new Error('YOLO_LETTERBOX_BOX_OUTSIDE_SOURCE');
	return mapped;
}
