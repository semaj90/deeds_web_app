import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { createHash } from 'node:crypto';
import { mapYoloLetterboxBoxToSourceV1, validateYoloLetterboxTransformV1 } from './evidence/yolo-letterbox-v1.js';

export interface YOLOResult {
	text: string;
	layout: {
		regions: Array<{
			type: string;
			bbox: number[];
			confidence: number;
			text?: string;
		}>;
	};
	objects: Array<{
		class: string;
		bbox: number[];
		confidence: number;
	}>;
	processingTime: number;
	method: 'yolo';
	modelType: 'coco' | 'doclayout';
}

export interface YOLOConfig {
	modelPath?: string;
	/** Python executable with onnxruntime + numpy (+ cv2 or PIL). Defaults to YOLO_PYTHON, then 'python'. */
	pythonPath?: string;
	confidence?: number;
	iouThreshold?: number;
}

/** Python executable for the detector subprocess: YOLO_PYTHON when set, otherwise 'python' on PATH. */
export function resolveYoloPython(configured?: string): string {
	return configured?.trim() || process.env.YOLO_PYTHON?.trim() || 'python';
}

// The THU-MIG YOLOv10 release assets are from an AGPL-3.0 repository. Do not
// infer a permissive weight license from the ONNX format or model filename.
// These names are permitted only with an exact artifact hash pin. The model
// artifact inventory remains the license authority; names alone are not proof.
// yolox_nano.onnx: Megvii YOLOX repository LICENSE is Apache-2.0 and names no separate
// weight grant (operator accepted this basis 2026-11-16, ledger DET-04). Production also
// requires YOLO_MODEL_SHA256 to match the artifact's exact hash.
const PRODUCTION_YOLO_MODEL_BASENAMES = new Set(['yolo-doc.onnx', 'yolox_nano.onnx']);

/** Fail closed in production on model family and exact-artifact checksum. */
export function assertProductionYoloModelAdmission(
	modelPath: string,
	nodeEnv = process.env.NODE_ENV,
	expectedSha256 = process.env.YOLO_MODEL_SHA256,
	actualSha256?: string,
): void {
	if (nodeEnv !== 'production') return;
	const basename = path.basename(modelPath).toLowerCase();
	if (!PRODUCTION_YOLO_MODEL_BASENAMES.has(basename)) {
		throw new Error('YOLO_MODEL_NOT_ADMITTED_FOR_PRODUCTION');
	}
	if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)
		|| !actualSha256 || actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
		throw new Error('YOLO_MODEL_CHECKSUM_NOT_ADMITTED_FOR_PRODUCTION');
	}
}

function mapDetectedBoxesToSource<T extends { bbox: unknown }>(items: T[], transform: unknown): Array<Omit<T, 'bbox'> & { bbox: [number, number, number, number] }> {
	const mapped: Array<Omit<T, 'bbox'> & { bbox: [number, number, number, number] }> = [];
	for (const item of items) {
		try {
			mapped.push({ ...item, bbox: mapYoloLetterboxBoxToSourceV1(item.bbox, transform) });
		} catch (error) {
			// Detector predictions wholly outside the source crop have no visible
			// region. Drop only those; malformed boxes or transforms still fail closed.
			if (error instanceof Error && error.message === 'YOLO_LETTERBOX_BOX_OUTSIDE_SOURCE') continue;
			throw error;
		}
	}
	return mapped;
}

/**
 * Resolve the best available YOLO ONNX model.
 * Priority:
 *   1. yolo-doc.onnx   (DocLayout-YOLO document layout,       Apache 2.0 ✅)
 *   2. yolox_nano.onnx (YOLOX Nano COCO, 416 input; local evaluation only until weight licensing is explicit)
 *   3. yolov10n.onnx   (THU-MIG release; AGPL-3.0; local evaluation only)
 *   4. yolov10s.onnx   (THU-MIG release; AGPL-3.0; local evaluation only)
 *
 * YOLOX's code repository is Apache-2.0, but its official pretrained-weight
 * license is not stated separately; an upstream issue asks for clarification.
 * Keep the pinned artifact available for local evaluation, but do not admit it
 * in production until the model-weight grant is explicit. yolov8n.onnx is also
 * intentionally excluded from auto-resolution and production admission. The THU-MIG YOLOv10 repository and
 * ONNX model card also identify AGPL-3.0; do not treat those release weights
 * as Apache-2.0. If you need a manual override pass modelPath explicitly to
 * YOLOConfig for local evaluation — production admission still applies.
 */
async function resolveModelPath(): Promise<string> {
	const searchDirs = [
		path.join(process.cwd(), 'models'),
		path.join(process.cwd(), 'sveltekit-frontend', 'models')
	];
	const candidateNames = [
		'yolo-doc.onnx',
		'yolox_nano.onnx',
		'yolov10n.onnx',
		'yolov10s.onnx',
		// YOLOv8 intentionally excluded. YOLOv10 remains a dev candidate, but its
		// upstream release is AGPL-3.0 and it is blocked from production below.
	];

	for (const dir of searchDirs) {
		for (const name of candidateNames) {
			const candidate = path.join(dir, name);
			try {
				await fs.access(candidate);
				return candidate;
			} catch {
				// continue searching
			}
		}
	}

	return path.join(searchDirs[0], 'yolo-doc.onnx');
}

/**
 * YOLO Object Detection Service
 * Supports COCO YOLO models and document-layout models via ONNX runtime.
 */
export class YOLOService {
	private config: YOLOConfig;
	private resolvedPath: string | null = null;

	constructor(config: YOLOConfig = {}) {
		this.config = {
			confidence: config?.confidence ?? 0.5,
			iouThreshold: config?.iouThreshold ?? 0.45,
			...config,
		};
	}

	private async getModelPath(): Promise<string> {
		const modelPath = this.config.modelPath ?? (this.resolvedPath ??= await resolveModelPath());
		if (process.env.NODE_ENV === 'production') {
			const bytes = await fs.readFile(modelPath);
			const actualSha256 = createHash('sha256').update(bytes).digest('hex');
			assertProductionYoloModelAdmission(modelPath, 'production', process.env.YOLO_MODEL_SHA256, actualSha256);
		}
		return modelPath;
	}

	async analyzeDocument(imageBuffer: Buffer, filename: string): Promise<YOLOResult> {
		const startTime = Date.now();
		const tempDir = tmpdir();
		const tempImage = path.join(tempDir, `yolo-${Date.now()}-${filename}`);
		const outputFile = path.join(tempDir, `yolo-result-${Date.now()}.json`);

		try {
			await fs.writeFile(tempImage, imageBuffer);
			const modelPath = await this.getModelPath();
			await this.runYOLOInference(tempImage, outputFile, modelPath);

			const yoloData = JSON.parse(await fs.readFile(outputFile, 'utf-8'));
			if (yoloData.error) {
				throw new Error(yoloData.error);
			}
			const isCoco = /yolo(v8|v10|x_nano)/i.test(path.basename(modelPath));
			if (yoloData.skipped) {
				console.info(`[YOLO] Skipped inference: ${yoloData.skipped}`);
				return {
					text: '',
					layout: { regions: [] },
					objects: [],
					processingTime: Date.now() - startTime,
					method: 'yolo',
					modelType: isCoco ? 'coco' : 'doclayout',
				};
			}
			const transform = validateYoloLetterboxTransformV1(yoloData.letterbox);
			const regions = mapDetectedBoxesToSource<YOLOResult['layout']['regions'][number] & { bbox: unknown }>(
				yoloData.regions ?? [], transform,
			);
			const objects = mapDetectedBoxesToSource<YOLOResult['objects'][number] & { bbox: unknown }>(
				yoloData.objects ?? [], transform,
			);

			const processingTime = Date.now() - startTime;

			return {
				text: this.extractTextFromRegions(regions),
				layout: { regions },
				objects,
				processingTime,
				method: 'yolo',
				modelType: isCoco ? 'coco' : 'doclayout',
			};
		} finally {
			await Promise.all([
				fs.unlink(tempImage).catch(() => {}),
				fs.unlink(outputFile).catch(() => {}),
			]);
		}
	}

	private async runYOLOInference(imagePath: string, outputPath: string, modelPath: string): Promise<any> {
		// Python script that handles both YOLOv8 COCO (84 x 8400) and doc-layout models
		const pythonScript = `
import sys, json

has_cv2 = False
try:
    import cv2
    has_cv2 = True
except ImportError:
    pass

has_pil = False
try:
    from PIL import Image
    has_pil = True
except ImportError:
    pass

try:
    import numpy as np
    import onnxruntime as ort
except ImportError as e:
    json.dump({'regions': [], 'objects': [], 'skipped': f'Missing dependency: {e}'}, open(sys.argv[3], 'w'))
    print(json.dumps({'success': True, 'skipped': str(e)}))
    sys.exit(0)

if not has_cv2 and not has_pil:
    json.dump({'regions': [], 'objects': [], 'skipped': 'Neither cv2 nor PIL installed'}, open(sys.argv[3], 'w'))
    print(json.dumps({'success': True, 'skipped': 'Neither cv2 nor PIL installed'}))
    sys.exit(0)

COCO_NAMES = [
    'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
    'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat',
    'dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack',
    'umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball',
    'kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
    'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple',
    'sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair',
    'couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
    'remote','keyboard','cell phone','microwave','oven','toaster','sink',
    'refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'
]
DOC_NAMES = ['text','image','table','header','footer','signature','checkbox','form_field','stamp','signature_line']

# Legal-relevant COCO classes (subset for evidence analysis)
LEGAL_RELEVANT = {'person','knife','scissors','cell phone','laptop','tv','car','truck',
    'bus','motorcycle','bicycle','backpack','handbag','suitcase','bottle','cup','book'}

def xywh2xyxy(x):
    y = np.copy(x)
    y[:, 0] = x[:, 0] - x[:, 2] / 2
    y[:, 1] = x[:, 1] - x[:, 3] / 2
    y[:, 2] = x[:, 0] + x[:, 2] / 2
    y[:, 3] = x[:, 1] + x[:, 3] / 2
    return y

def nms(boxes, scores, iou_thresh):
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        xx1 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
        area_j = (boxes[order[1:], 2] - boxes[order[1:], 0]) * (boxes[order[1:], 3] - boxes[order[1:], 1])
        iou = inter / (area_i + area_j - inter + 1e-9)
        order = order[1:][iou < iou_thresh]
    return keep

def run(image_path, model_path, output_path, conf_thresh, iou_thresh):
    session = ort.InferenceSession(model_path)
    inp = session.get_inputs()[0]
    out_shape = session.get_outputs()[0].shape  # inspected for diagnostics; output formats handled below
    is_yolox = 'yolox_nano' in sys.argv[2].lower()
    input_w = 416 if is_yolox else 640
    input_h = 416 if is_yolox else 640

    if has_cv2:
        bgr = cv2.imread(image_path)
        if bgr is None:
            raise ValueError(f'Could not read: {image_path}')
        img = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        oh, ow = img.shape[:2]
        ratio = min(input_w / ow, input_h / oh)
        resized_w, resized_h = int(round(ow * ratio)), int(round(oh * ratio))
        pad_left, pad_top = (input_w - resized_w) // 2, (input_h - resized_h) // 2
        pad_right, pad_bottom = input_w - resized_w - pad_left, input_h - resized_h - pad_top
        resized = cv2.resize(img, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
        resized = cv2.copyMakeBorder(resized, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_CONSTANT, value=(114, 114, 114))
        blob = resized.astype(np.float32) if is_yolox else resized.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis]
    else:
        with Image.open(image_path) as im:
            im = im.convert('RGB')
            ow, oh = im.size
            ratio = min(input_w / ow, input_h / oh)
            resized_w, resized_h = int(round(ow * ratio)), int(round(oh * ratio))
            pad_left, pad_top = (input_w - resized_w) // 2, (input_h - resized_h) // 2
            pad_right, pad_bottom = input_w - resized_w - pad_left, input_h - resized_h - pad_top
            im_resized = im.resize((resized_w, resized_h), Image.Resampling.BILINEAR)
            canvas = Image.new('RGB', (input_w, input_h), (114, 114, 114))
            canvas.paste(im_resized, (pad_left, pad_top))
            arr = np.array(canvas, dtype=np.float32)
            if not is_yolox:
                arr /= 255.0
            blob = np.transpose(arr, (2, 0, 1))[np.newaxis]
    letterbox = {
        'sourceWidth': ow,
        'sourceHeight': oh,
        'scaleX': resized_w / ow,
        'scaleY': resized_h / oh,
        'padLeft': pad_left,
        'padTop': pad_top,
    }

    outputs = session.run(None, {inp.name: blob})
    pred = outputs[0]  # shape varies by model

    # Detect output format
    is_yolov8 = len(pred.shape) == 3 and pred.shape[1] < pred.shape[2]  # (1, 84, 8400)
    is_yolov10 = (len(pred.shape) == 3 and pred.shape[2] == 6) or 'yolov10' in sys.argv[2].lower()

    if is_yolov8:
        # YOLOv8 native: (1, 84, 8400) -> transpose to (8400, 84)
        pred = pred[0].T  # (8400, 84)
        num_classes = pred.shape[1] - 4
        boxes_xywh = pred[:, :4]
        class_scores = pred[:, 4:]
        max_scores = class_scores.max(axis=1)
        class_ids = class_scores.argmax(axis=1)
        mask = max_scores > conf_thresh
        boxes_xywh = boxes_xywh[mask]
        max_scores = max_scores[mask]
        class_ids = class_ids[mask]
        class_names = COCO_NAMES if num_classes >= 80 else DOC_NAMES
        is_coco = num_classes >= 80
        boxes_xyxy = xywh2xyxy(boxes_xywh)
        keep = nms(boxes_xyxy, max_scores, iou_thresh)
        boxes_xyxy = boxes_xyxy[keep]
        max_scores = max_scores[keep]
        class_ids = class_ids[keep]
    elif is_yolov10:
        # YOLOv10 native: (1, N, 6) = [x1, y1, x2, y2, score, class_id] with NMS built-in
        pred = pred[0]
        mask = pred[:, 4] > conf_thresh
        pred = pred[mask]
        boxes_xyxy = pred[:, :4].copy()
        max_scores = pred[:, 4]
        class_ids = pred[:, 5].astype(int)
        class_names = COCO_NAMES
        is_coco = True
    elif is_yolox:
        # YOLOX-Nano: [1, 3549, 85] raw grid output (upstream YOLOX demo_postprocess).
        # Rows are strides 8/16/32 grids (52^2 + 26^2 + 13^2). Decode in input-pixel
        # space: xy = (xy + grid) * stride, wh = exp(wh) * stride, then score =
        # objectness * class score, class-agnostic NMS, then source mapping.
        pred = pred[0].astype(np.float32).copy()
        grids = []
        strides_col = []
        for stride in (8, 16, 32):
            gh, gw = input_h // stride, input_w // stride
            xv, yv = np.meshgrid(np.arange(gw), np.arange(gh))
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
            strides_col.append(np.full((gh * gw, 1), stride, dtype=np.float32))
        grid = np.concatenate(grids, 0).astype(np.float32)
        strides_col = np.concatenate(strides_col, 0)
        cxcy = (pred[:, :2] + grid) * strides_col
        wh = np.exp(pred[:, 2:4]) * strides_col
        boxes_xyxy_all = np.concatenate([cxcy - wh / 2.0, cxcy + wh / 2.0], 1)
        class_scores = pred[:, 5:] * pred[:, 4:5]
        max_scores = class_scores.max(axis=1)
        class_ids = class_scores.argmax(axis=1)
        mask = max_scores > conf_thresh
        boxes_xyxy = boxes_xyxy_all[mask]
        max_scores = max_scores[mask]
        class_ids = class_ids[mask]
        class_names = COCO_NAMES
        is_coco = True
        keep = nms(boxes_xyxy, max_scores, iou_thresh)
        boxes_xyxy = boxes_xyxy[keep]
        max_scores = max_scores[keep]
        class_ids = class_ids[keep]
    else:
        # DocLayout / Legacy format: (1, N, 6) = [x,y,w,h,conf,class_id]
        pred = pred[0]
        mask = pred[:, 4] > conf_thresh
        pred = pred[mask]
        boxes_xywh = pred[:, :4]
        max_scores = pred[:, 4]
        class_ids = pred[:, 5].astype(int)
        class_names = DOC_NAMES
        is_coco = False
        boxes_xyxy = xywh2xyxy(boxes_xywh)
        keep = nms(boxes_xyxy, max_scores, iou_thresh)
        boxes_xyxy = boxes_xyxy[keep]
        max_scores = max_scores[keep]
        class_ids = class_ids[keep]

    if len(boxes_xyxy) == 0:
        json.dump({'regions': [], 'objects': [], 'letterbox': letterbox}, open(output_path, 'w'))
        print(json.dumps({'success': True}))
        return

    regions, objects = [], []
    for box, score, cid in zip(boxes_xyxy, max_scores, class_ids):
        name = class_names[int(cid)] if int(cid) < len(class_names) else f'class_{cid}'
        entry = {'bbox': box.tolist(), 'confidence': float(score), 'class': name}
        if is_coco:
            objects.append(entry)
        else:
            if int(cid) <= 5:
                regions.append({'type': name, 'bbox': entry['bbox'], 'confidence': entry['confidence']})
            else:
                objects.append(entry)

    json.dump({'regions': regions, 'objects': objects, 'letterbox': letterbox}, open(output_path, 'w'))
    print(json.dumps({'success': True}))

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], sys.argv[3],
        float(sys.argv[4]) if len(sys.argv) > 4 else 0.5,
        float(sys.argv[5]) if len(sys.argv) > 5 else 0.45)
`;

		return new Promise((resolve, reject) => {
			const tempScript = path.join(tmpdir(), `yolo-${Date.now()}.py`);

			fs.writeFile(tempScript, pythonScript)
				.then(() => {
					const python = spawn(resolveYoloPython(this.config.pythonPath), [
						tempScript,
						imagePath,
						modelPath,
						outputPath,
						this.config.confidence!.toString(),
						this.config.iouThreshold!.toString(),
					]);

					let stdout = '';
					let stderr = '';

					python.stdout.on('data', (data) => {
						stdout += data.toString();
					});
					python.stderr.on('data', (data) => {
						stderr += data.toString();
					});

					python.on('close', async (code) => {
						await fs.unlink(tempScript).catch(() => {});
						if (code === 0) {
							try {
								const result = JSON.parse(stdout.trim());
								resolve(result);
							} catch (parseError) {
								reject(new Error(`Failed to parse YOLO output: ${parseError}`));
							}
						} else {
							reject(new Error(`YOLO process exited ${code}: ${stderr}`));
						}
					});

					python.on('error', (error) => {
						fs.unlink(tempScript).catch(() => {});
						reject(new Error(`Failed to start YOLO: ${error.message}`));
					});
				})
				.catch(reject);
		});
	}

	private extractTextFromRegions(regions: any[]): string {
		const textRegions = regions.filter((r) => r.type === 'text');
		if (textRegions.length > 0) {
			return `Detected ${textRegions.length} text regions. OCR integration needed for text extraction.`;
		}
		return '';
	}

	/** Probe result per Python executable, so changing YOLO_PYTHON is not masked by an old result. */
	private static runtimeAvailable = new Map<string, boolean>();

	static async isRuntimeAvailable(pythonPath?: string): Promise<boolean> {
		const python = resolveYoloPython(pythonPath);
		const known = YOLOService.runtimeAvailable.get(python);
		if (known !== undefined) return known;
		return new Promise((resolve) => {
			const done = (ok: boolean) => {
				YOLOService.runtimeAvailable.set(python, ok);
				resolve(ok);
			};
			const proc = spawn(python, ['-c', 'import onnxruntime, numpy']);
			proc.on('close', (code) => done(code === 0));
			proc.on('error', () => done(false));
		});
	}

	async isModelAvailable(): Promise<boolean> {
		try {
			const modelPath = await this.getModelPath();
			await fs.access(modelPath);
			const hasRuntime = await YOLOService.isRuntimeAvailable(this.config.pythonPath);
			return hasRuntime;
		} catch {
			return false;
		}
	}

	async getModelArtifactRevision(): Promise<string | null> {
		try {
			const modelPath = await this.getModelPath();
			const bytes = await fs.readFile(modelPath);
			return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		} catch {
			return null;
		}
	}
}

export function createYOLOService(config?: YOLOConfig): YOLOService {
	return new YOLOService(config);
}
