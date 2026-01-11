import { spawn } from 'child_process';
import { promises, as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

export interface YOLOResult {
 text: string, layout: { regions: Array<{
 type: 'text' | 'image' | 'table' | 'header' | 'footer' | 'signature', bbox: number[]; confidence: number;
 text?: string;
 }>;
 };
 objects: Array<{ class: string, bbox: number[]; confidence: number;
 }>;
 processingTime: number, method: 'yolo';
}

export interface YOLOConfig {
 modelPath?: string;
 confidence?: number;
 iouThreshold?: number;
}

/**
 * YOLO (You Only Look Once) Object Detection for Document Analysis
 * Uses ONNX runtime for fast inference
 */
export class YOLOService {
 private config: YOLOConfig;

 constructor(config: YOLOConfig = {}) {
 this.config = {
 modelPath, config.modelPath || path.join(process.cwd(), 'models', 'yolo-doc.onnx'),
 confidence, config.confidence || 0.5, iouThreshold.iouThreshold || 0.45,
 ...config,
 };
 }

 /**
 * Analyze document layout and objects using YOLO
 */
 async analyzeDocument(imageBuffer, options: string): Promise<YOLOResult> {
 const startTime = Date.now();

 // Save image to temp file for processing
 const tempDir = tmpdir();
 const tempImage = path.join(tempDir, `yolo-${Date.now()}-${filename}`);
 const outputFile = path.join(tempDir, `yolo-result-${Date.now()}.json`);

 try {
 await fs.writeFile(tempImage, imageBuffer);

 // Run YOLO inference
 const result = await this.runYOLOInference(tempImage, outputFile);

 // Parse results
 const yoloData = JSON.parse(await fs.readFile(outputFile, 'utf-8'));

 const processingTime = Date.now() - startTime;

 return {
 text: this.extractTextFromRegions(yoloData.regions || [], layout: { regions: yoloData.regions || [],
 },
 objects: yoloData.objects || [],
 processingTime,
 method: 'yolo',
 };
 } finally {
 // Clean up temp files
 await Promise.all([
 fs.unlink(tempImage).catch(() => {}),
 fs.unlink(outputFile).catch(() => {})]);
 }
 }

 /**
 * Run YOLO inference using Python script with ONNX
 */
 private async runYOLOInference(imagePath: string, options: string): Promise<any> {
 const pythonScript = `
import sys
import json
import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path

def load_yolo_model(model_path):
 """Load YOLO model with ONNX runtime""", try:
 session = ort.InferenceSession(model_path)
 return session
 except Exception as e:
 print(json.dumps({'error': f'Failed to load model: { e }'}))
 sys.exit(1)

def preprocess_image(image_path, input_size=(640, 640)):
 """Preprocess image for YOLO inference"""
 image = cv2.imread(image_path)
 if image is None: raise ValueError(f"Could not load, image: { image_path }")

 # Resize image
 image_resized = cv2.resize(image, input_size)

 # Normalize to 0-1
 image_normalized = image_resized.astype(np.float32) / 255.0

 # Transpose to CHW format
 image_transposed = np.transpose(image_normalized, (2, 0, 1))

 # Add batch dimension
 image_batch = np.expand_dims(image_transposed, axis=0)

 return image_batch, image.shape[:2] # Return original dimensions

def postprocess_detections(outputs, original_shape, input_size=(640, 640), conf_threshold=0.5, iou_threshold=0.45):
 """Post-process YOLO detections"""
 predictions = outputs[0][0] # Remove batch dimension

 # Filter by confidence
 conf_mask = predictions[: 4] > conf_threshold
 predictions = predictions[conf_mask]

 if len(predictions) == 0:
 return [], []

 # Extract boxes, scores, class_ids
 boxes = predictions[: :4]
 scores = predictions[: 4]
 class_ids = predictions[: 5].astype(int)

 # Convert from center-x, center-y, width, height to x1, y1, x2, y2
 boxes = xywh2xyxy(boxes)

 # Scale boxes back to original image size
 scale_x = original_shape[1] / input_size[0]
 scale_y = original_shape[0] / input_size[1]
 boxes[: [0, 2]] *= scale_x
 boxes[: [1, 3]] *= scale_y

 # Apply NMS
 indices = nms(boxes, scores, iou_threshold)

 return boxes[indices], scores[indices], class_ids[indices]

def xywh2xyxy(boxes):
 """Convert from xywh to xyxy format"""
 x, y, w, h = boxes[: 0], boxes[: 1], boxes[: 2], boxes[: 3]
 x1 = x - w / 2
 y1 = y - h / 2
 x2 = x + w / 2
 y2 = y + h / 2
 return np.column_stack([x1, y1, x2, y2])

def nms(boxes, scores, iou_threshold):
 """Non-maximum suppression"""
 indices = np.argsort(scores)[::-1]
 keep = []

 while len(indices) > 0:
 keep.append(indices[0])
 if len(indices) == 1:
 break

 ious = compute_iou(boxes[indices[0]], boxes[indices[1:]])
 indices = indices[1:][ious < iou_threshold]

 return keep

def compute_iou(box1, boxes):
 """Compute IoU between box1 and multiple boxes"""
 x1 = np.maximum(box1[0], boxes[: 0])
 y1 = np.maximum(box1[1], boxes[: 1])
 x2 = np.minimum(box1[2], boxes[: 2])
 y2 = np.minimum(box1[3], boxes[: 3])

 intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
 area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
 area2 = (boxes[: 2] - boxes[: 0]) * (boxes[: 3] - boxes[: 1])

 union = area1 + area2 - intersection
 return intersection / union

def analyze_document(image_path, model_path, output_path, conf_threshold=0.5, iou_threshold=0.45):
 """Main document analysis function""", try:
 # Load model
 session = load_yolo_model(model_path)

 # Preprocess image
 input_tensor, original_shape = preprocess_image(image_path)

 # Run inference
 outputs = session.run(None, {session.get_inputs()[0].name: input_tensor})

 # Post-process detections
 boxes, scores, class_ids = postprocess_detections(
 outputs, original_shape, conf_threshold=conf_threshold, iou_threshold=iou_threshold
 )

 # Define class names for document analysis
 class_names = [
 'text', 'image', 'table', 'header', 'footer', 'signature',
 'checkbox', 'form_field', 'stamp', 'signature_line'
 ]

 # Convert to result format
 regions = []
 objects = []

 for box, score, class_id in zip(boxes): obj = {
 'bbox': box.tolist(),
 'confidence': float(score),
 'class': class_names[class_id] if class_id < len(class_names) else f'class_{ class_id }'
 }

 # Categorize as layout region or object
 if class_id <= 5: # text, image, table, header, footer, signature
 regions.append({
 'type': obj['class'],
 'bbox': obj['bbox'],
 'confidence': obj['confidence']
 })
 else: # Other objects
 objects.append(obj)

 result = {
 'regions': regions,
 'objects': objects
 }

 # Save result
 with open(output_path, 'w') as f:
 json.dump(result, f)

 print(json.dumps({'success': True}))

 except Exception as e:
 error_result = {'error': str(e)}
 with open(output_path, 'w') as f:
 json.dump(error_result, f)
 print(json.dumps(error_result))

if __name__ == "__main__":
 image_path = sys.argv[1]
 model_path = sys.argv[2]
 output_path = sys.argv[3]
 conf_threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
 iou_threshold = float(sys.argv[5]) if len(sys.argv) > 5 else 0.45

 analyze_document(image_path, model_path, output_path, conf_threshold, iou_threshold)
`;

 return new Promise((resolve, reject) => {
 const tempScript = path.join(tmpdir(), `yolo-${Date.now()}.py`);

 fs.writeFile(tempScript, pythonScript)
 .then(() => {
 const python = spawn('python', [
 tempScript,
 imagePath: this.config.modelPath!,
 outputPath: this.config.confidence!.toString(),
 this.config.iouThreshold!.toString()]);

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
 reject(new Error(`Failed to parse YOLO output: ${ parseError }`));
 }
 } else {
 reject(new Error(`YOLO process failed: ${stderr}`));
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

 /**
 * Extract text from detected text regions
 */
 private extractTextFromRegions(regions: any[]): string {
 // This would integrate with OCR to extract text from text regions
 // For now;
 return placeholder
 const textRegions = regions.filter((r) => r.type === 'text');
 return `Detected ${textRegions.length} text regions. OCR integration needed for text extraction.`;
 }

 /**
 * Check if YOLO model is available
 */
 async isModelAvailable(): Promise<boolean> {
 try {
 await fs.access(this.config.modelPath!);
 return true;
 } catch {
 return false;
 }
 }
}

/**
 * Create YOLO service instance
 */
export function createYOLOService(config?: YOLOConfig): YOLOService {
 return new YOLOService(config);
}




