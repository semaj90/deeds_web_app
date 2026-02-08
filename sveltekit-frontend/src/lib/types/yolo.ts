/**
 * YOLO Object Detection Types
 * For legal document analysis and evidence processing
 * Date: February 7, 2026
 */

export interface YOLOConfig {
  modelPath: string;
  modelVersion: 'yolov8' | 'yolov9' | 'yolov10';
  confidenceThreshold: number;
  iouThreshold: number;
  inputSize: [number, number]; // [width, height]
  gpuAcceleration: boolean;
  batchSize: number;
  maxDetections: number;
}

export interface YOLODetection {
  class: string;
  classId: number;
  confidence: number;
  bbox: {
    x: number; // Top-left x
    y: number; // Top-left y
    width: number;
    height: number;
    centerX?: number;
    centerY?: number;
  };
  area: number;
  metadata?: Record<string, unknown>;
}

export interface YOLOAnalysisResult {
  detections: YOLODetection[];
  processingTime: number;
  imageSize: [number, number];
  model: string;
  metadata: {
    preprocessingTime: number;
    inferenceTime: number;
    postprocessingTime: number;
    gpuUsed: boolean;
  };
}

// Legal Document Specific YOLO Types

export interface LegalDocumentYOLO {
  documentId: string;
  pages: LegalDocumentPageYOLO[];
  summary: LegalDocumentYOLOSummary;
}

export interface LegalDocumentPageYOLO {
  pageNumber: number;
  signatures: YOLODetection[];
  seals: YOLODetection[];
  stamps: YOLODetection[];
  tables: YOLODetection[];
  headers: YOLODetection[];
  footers: YOLODetection[];
  annotations: YOLODetection[];
  handwriting: YOLODetection[];
  checkboxes: YOLODetection[];
  barcodes: YOLODetection[];
  qrCodes: YOLODetection[];
}

export interface LegalDocumentYOLOSummary {
  totalPages: number;
  totalSignatures: number;
  totalSeals: number;
  totalTables: number;
  hasAnnotations: boolean;
  hasHandwriting: boolean;
  authenticityIndicators: {
    signatures: boolean;
    seals: boolean;
    stamps: boolean;
  };
  confidence: number;
}

// Evidence Analysis

export interface EvidenceYOLOAnalysis {
  evidenceId: string;
  type: 'photo' | 'document' | 'video-frame' | 'diagram';
  detections: YOLODetection[];
  relevantObjects: RelevantObject[];
  chainOfCustody: ChainOfCustodyIndicator[];
  metadata: {
    timestamp?: Date;
    location?: string;
    cameraModel?: string;
  };
}

export interface RelevantObject {
  detection: YOLODetection;
  relevance: 'critical' | 'high' | 'medium' | 'low';
  legalSignificance: string;
  notes?: string;
}

export interface ChainOfCustodyIndicator {
  type: 'label' | 'seal' | 'signature' | 'barcode' | 'timestamp';
  detection: YOLODetection;
  verified: boolean;
  text?: string;
}

// Batch Processing

export interface YOLOBatchRequest {
  images: Array<{
    id: string;
    data: string | ArrayBuffer;
    metadata?: Record<string, unknown>;
  }>;
  config: Partial<YOLOConfig>;
}

export interface YOLOBatchResult {
  results: Map<string, YOLOAnalysisResult>;
  totalProcessingTime: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ id: string; error: string }>;
}

// Training & Fine-tuning

export interface YOLOTrainingConfig {
  baseModel: string;
  datasetPath: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  augmentation: boolean;
  classes: string[];
}

export interface YOLOTrainingResult {
  modelPath: string;
  metrics: {
    mAP: number; // Mean Average Precision
    precision: number;
    recall: number;
    f1Score: number;
  };
  trainingTime: number;
  epochs: number;
}

// Annotation

export interface YOLOAnnotation {
  imageId: string;
  detections: YOLODetection[];
  annotatedBy: string;
  annotatedAt: Date;
  verified: boolean;
  notes?: string;
}

export interface YOLOAnnotationExport {
  format: 'yolo' | 'coco' | 'pascal-voc';
  annotations: YOLOAnnotation[];
  classes: string[];
  metadata: {
    version: string;
    createdAt: Date;
    totalImages: number;
    totalAnnotations: number;
  };
}

// Integration with Gemma3 VLM

export interface YOLOGemmaIntegration {
  yoloDetections: YOLODetection[];
  gemmaAnalysis: string; // VLM description of detected objects
  combinedConfidence: number;
  enrichedDetections: EnrichedDetection[];
}

export interface EnrichedDetection extends YOLODetection {
  description: string; // From Gemma3 VLM
  context: string; // Relationship to other detected objects
  legalRelevance: string;
}