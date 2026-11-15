import { describe, expect, it } from 'vitest';
import { assertProductionYoloModelAdmission } from './yolo.js';

describe('production YOLO model admission', () => {
	it('admits the document-layout candidate in production', () => {
		const sha256 = 'a'.repeat(64);
		expect(() => assertProductionYoloModelAdmission('C:/models/yolo-doc.onnx', 'production', sha256, sha256)).not.toThrow();
	});

	it('rejects YOLOv8 even when explicitly configured in production', () => {
		expect(() => assertProductionYoloModelAdmission('C:/models/yolov8n.onnx', 'production'))
			.toThrow('YOLO_MODEL_NOT_ADMITTED_FOR_PRODUCTION');
	});

	it('keeps the pinned YOLOX-Nano artifact out of production until pretrained-weight licensing is explicit', () => {
		const sha256 = 'c'.repeat(64);
		expect(() => assertProductionYoloModelAdmission('C:/models/yolox_nano.onnx', 'production', sha256, sha256))
			.toThrow('YOLO_MODEL_NOT_ADMITTED_FOR_PRODUCTION');
	});

	it('rejects unknown models in production instead of inferring their license from their path', () => {
		expect(() => assertProductionYoloModelAdmission('C:/models/custom-detector.onnx', 'production', 'a'.repeat(64), 'a'.repeat(64)))
			.toThrow('YOLO_MODEL_NOT_ADMITTED_FOR_PRODUCTION');
	});

	it.each(['yolov10n.onnx', 'yolov10s.onnx'])(
		'blocks the THU-MIG %s release from production pending license clearance', (filename) => {
			expect(() => assertProductionYoloModelAdmission(`C:/models/${filename}`, 'production', 'a'.repeat(64), 'a'.repeat(64)))
				.toThrow('YOLO_MODEL_NOT_ADMITTED_FOR_PRODUCTION');
		},
	);

	it('requires an exact checksum pin for the admitted production model', () => {
		expect(() => assertProductionYoloModelAdmission('C:/models/yolo-doc.onnx', 'production'))
			.toThrow('YOLO_MODEL_CHECKSUM_NOT_ADMITTED_FOR_PRODUCTION');
		expect(() => assertProductionYoloModelAdmission('C:/models/yolo-doc.onnx', 'production', 'a'.repeat(64), 'b'.repeat(64)))
			.toThrow('YOLO_MODEL_CHECKSUM_NOT_ADMITTED_FOR_PRODUCTION');
	});

	it('keeps local development overrides available for fixture work', () => {
		expect(() => assertProductionYoloModelAdmission('C:/models/yolov8n.onnx', 'development')).not.toThrow();
	});
});
