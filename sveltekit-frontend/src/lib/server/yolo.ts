import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

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
	confidence?: number;
	iouThreshold?: number;
}

/**
 * Resolve the best available YOLO ONNX model.
 * Priority: yolo-doc.onnx (document layout) > yolov8n.onnx (COCO 80-class)
 */
async function resolveModelPath(): Promise<string> {
	const modelsDir = path.join(process.cwd(), 'models');
	const docModel = path.join(modelsDir, 'yolo-doc.onnx');
	const cocoModel = path.join(modelsDir, 'yolov8n.onnx');

	try {
		await fs.access(docModel);
		return docModel;
	} catch {
		// fall through
	}
	try {
		await fs.access(cocoModel);
		return cocoModel;
	} catch {
		return docModel; // default (will fail isModelAvailable check)
	}
}

/**
 * YOLO Object Detection Service
 * Supports both YOLOv8n COCO (80 classes) and document layout models via ONNX runtime.
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
		if (this.config.modelPath) return this.config.modelPath;
		if (!this.resolvedPath) {
			this.resolvedPath = await resolveModelPath();
		}
		return this.resolvedPath;
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

			const processingTime = Date.now() - startTime;
			const isCoco = modelPath.includes('yolov8n');

			return {
				text: this.extractTextFromRegions(yoloData?.regions ?? []),
				layout: { regions: yoloData?.regions ?? [] },
				objects: yoloData?.objects ?? [],
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
import sys, json, cv2, numpy as np, onnxruntime as ort

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
    out_shape = session.get_outputs()[0].shape  # e.g. [1, 84, 8400] for YOLOv8

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f'Could not read: {image_path}')
    oh, ow = img.shape[:2]

    # Preprocess
    resized = cv2.resize(img, (640, 640))
    blob = resized.astype(np.float32) / 255.0
    blob = np.transpose(blob, (2, 0, 1))[np.newaxis]

    outputs = session.run(None, {inp.name: blob})
    pred = outputs[0]  # shape varies by model

    # Detect output format
    is_yolov8 = len(pred.shape) == 3 and pred.shape[1] < pred.shape[2]  # (1, 84, 8400)
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
    else:
        # Legacy format: (1, N, 6) = [x,y,w,h,conf,class_id]
        pred = pred[0]
        mask = pred[:, 4] > conf_thresh
        pred = pred[mask]
        boxes_xywh = pred[:, :4]
        max_scores = pred[:, 4]
        class_ids = pred[:, 5].astype(int)
        class_names = DOC_NAMES
        is_coco = False

    if len(boxes_xywh) == 0:
        json.dump({'regions': [], 'objects': []}, open(output_path, 'w'))
        print(json.dumps({'success': True}))
        return

    boxes_xyxy = xywh2xyxy(boxes_xywh)
    # Scale to original image
    boxes_xyxy[:, [0, 2]] *= ow / 640.0
    boxes_xyxy[:, [1, 3]] *= oh / 640.0

    keep = nms(boxes_xyxy, max_scores, iou_thresh)
    boxes_xyxy = boxes_xyxy[keep]
    max_scores = max_scores[keep]
    class_ids = class_ids[keep]

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

    json.dump({'regions': regions, 'objects': objects}, open(output_path, 'w'))
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
					const python = spawn('python', [
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

	async isModelAvailable(): Promise<boolean> {
		try {
			const modelPath = await this.getModelPath();
			await fs.access(modelPath);
			return true;
		} catch {
			return false;
		}
	}
}

export function createYOLOService(config?: YOLOConfig): YOLOService {
	return new YOLOService(config);
}
