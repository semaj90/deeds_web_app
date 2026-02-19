import { pipeline, Pipeline } from '@huggingface/transformers';
import { Client as MinioClient } from 'minio';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { lookup as lookupMimeType } from 'mime-types';

interface DetectionResult {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  score: number;
  label: string;
  class: number;
}

interface SAMResult {
  masks: number[][][];
  scores: number[];
}

interface LegalEntity {
  id: string;
  type: 'signature' | 'stamp' | 'text_block' | 'form_field' | 'document_boundary';
  bbox: [number, number, number, number];
  confidence: number;
  text?: string;
  metadata?: Record<string, any>;
}

interface DocumentAnalysis {
  id: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  entities: LegalEntity[];
  extractedText?: string;
  processingTime: number;
  timestamp: string;
  minioPath: string;
  postgresId?: string;
}

class YOLOSAMLegalPipeline {
  private yoloModel: Pipeline | null = null;
  private samModel: InferenceSession | null = null;
  private minioClient: MinioClient;
  private dbPool: Pool;
  private app: express.Application;
  private wss: WebSocket.Server;
  private upload: multer.Multer;

  constructor() {
    this.initializeMinIO();
    this.initializeDatabase();
    this.initializeExpress();
    this.initializeWebSocket();
    this.initializeMulter();
  }

  private initializeMinIO() {
    this.minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
  }

  private initializeDatabase() {
    this.dbPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'legal_ai_db',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  private initializeExpress() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'yolo-sam-legal-pipeline' });
    });

    // Upload endpoint
    this.app.post('/analyze', this.upload.single('document'), this.handleDocumentAnalysis.bind(this));

    // Get analysis results
    this.app.get('/analysis/:id', this.getAnalysisResult.bind(this));

    // List analyses
    this.app.get('/analyses', this.listAnalyses.bind(this));
  }

  private initializeWebSocket() {
    this.wss = new WebSocket.Server({ port: 8083 });

    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected to YOLO/SAM pipeline');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          // Handle real-time analysis requests
          if (data.type === 'analyze_document') {
            this.handleRealtimeAnalysis(ws, data);
          }
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });
    });
  }

  private initializeMulter() {
    const storage = multer.memoryStorage();
    this.upload = multer({
      storage,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/tiff',
          'application/pdf'
        ];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only JPEG, PNG, TIFF, and PDF are allowed.'));
        }
      }
    });
  }

  async initializeModels(): Promise<void> {
    try {
      console.log('Loading YOLO model...');
      this.yoloModel = await pipeline('object-detection', 'microsoft/DialoGPT-medium');

      console.log('Loading SAM model...');
      const samModelPath = path.join(process.cwd(), 'models', 'sam_vit_b.onnx');
      this.samModel = await InferenceSession.create(samModelPath);

      console.log('Models loaded successfully');
    } catch (error) {
      console.error('Error loading models:', error);
      throw error;
    }
  }

  async preprocessImage(imageBuffer: Buffer): Promise<{
    tensor: Tensor;
    originalWidth: number;
    originalHeight: number;
  }> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Resize to YOLO input size (640x640)
    const resizedBuffer = await image
      .resize(640, 640, {
        fit: 'fill',
        withoutEnlargement: false
      })
      .raw()
      .toBuffer();

    // Convert to tensor (assuming RGB)
    const pixels = new Float32Array(640 * 640 * 3);
    for (let i = 0; i < resizedBuffer.length; i += 3) {
      pixels[i] = resizedBuffer[i] / 255.0;     // R
      pixels[i + 1] = resizedBuffer[i + 1] / 255.0; // G
      pixels[i + 2] = resizedBuffer[i + 2] / 255.0; // B
    }

    const tensor = new Tensor('float32', pixels, [1, 3, 640, 640]);

    return {
      tensor,
      originalWidth: metadata.width || 640,
      originalHeight: metadata.height || 640
    };
  }

  async runYOLODetection(imageTensor: Tensor): Promise<DetectionResult[]> {
    if (!this.yoloModel) {
      throw new Error('YOLO model not loaded');
    }

    const results = await this.yoloModel(imageTensor);

    return results.map((result: any) => ({
      bbox: result.box,
      score: result.score,
      label: result.label,
      class: result.class
    }));
  }

  async runSAMSegmentation(
    imageTensor: Tensor,
    bboxes: [number, number, number, number][]
  ): Promise<SAMResult> {
    if (!this.samModel) {
      throw new Error('SAM model not loaded');
    }

    // Prepare input tensors for SAM
    const imageEmbedding = await this.samModel.run({
      image: imageTensor
    });

    // For each bbox, generate mask
    const masks: number[][][] = [];
    const scores: number[] = [];

    for (const bbox of bboxes) {
      const maskResult = await this.samModel.run({
        image_embeddings: imageEmbedding.image_embeddings,
        point_coords: new Tensor('float32', [bbox[0], bbox[1], bbox[2], bbox[3]], [1, 4]),
        point_labels: new Tensor('float32', [1, 1, 1, 1], [1, 4])
      });

      masks.push(maskResult.masks.data);
      scores.push(maskResult.scores.data[0]);
    }

    return { masks, scores };
  }

  classifyLegalEntity(
    detection: DetectionResult,
    mask?: number[][]
  ): LegalEntity['type'] {
    // Simple classification based on detection results
    // In a real implementation, this would use more sophisticated logic
    const { label, bbox } = detection;
    const [x1, y1, x2, y2] = bbox;
    const width = x2 - x1;
    const height = y2 - y1;
    const aspectRatio = width / height;

    if (label.toLowerCase().includes('signature') || aspectRatio > 3) {
      return 'signature';
    } else if (label.toLowerCase().includes('stamp') || (width < 100 && height < 100)) {
      return 'stamp';
    } else if (label.toLowerCase().includes('text')) {
      return 'text_block';
    } else if (aspectRatio > 1.5) {
      return 'form_field';
    } else {
      return 'document_boundary';
    }
  }

  async analyzeDocument(
    imageBuffer: Buffer,
    filename: string
  ): Promise<DocumentAnalysis> {
    const startTime = Date.now();
    const analysisId = uuidv4();

    try {
      // Preprocess image
      const { tensor, originalWidth, originalHeight } = await this.preprocessImage(imageBuffer);

      // Run YOLO detection
      const detections = await this.runYOLODetection(tensor);

      // Filter detections with confidence > 0.5
      const filteredDetections = detections.filter(d => d.score > 0.5);

      // Run SAM segmentation on detected objects
      const bboxes = filteredDetections.map(d => d.bbox);
      const samResults = await this.runSAMSegmentation(tensor, bboxes);

      // Classify entities and create results
      const entities: LegalEntity[] = filteredDetections.map((detection, index) => ({
        id: uuidv4(),
        type: this.classifyLegalEntity(detection, samResults.masks[index]),
        bbox: detection.bbox,
        confidence: detection.score,
        metadata: {
          samScore: samResults.scores[index],
          mask: samResults.masks[index]
        }
      }));

      const analysis: DocumentAnalysis = {
        id: analysisId,
        filename,
        mimeType: lookupMimeType(filename) || 'application/octet-stream',
        width: originalWidth,
        height: originalHeight,
        entities,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        minioPath: `analyses/${analysisId}/${filename}`
      };

      // Store in MinIO
      await this.storeInMinIO(analysisId, imageBuffer, filename);

      // Store metadata in PostgreSQL
      await this.storeInPostgres(analysis);

      return analysis;

    } catch (error) {
      console.error('Error analyzing document:', error);
      throw error;
    }
  }

  async storeInMinIO(analysisId: string, buffer: Buffer, filename: string): Promise<void> {
    const bucketName = 'legal-documents';
    const objectName = `analyses/${analysisId}/${filename}`;

    try {
      // Ensure bucket exists
      const bucketExists = await this.minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(bucketName);
      }

      // Upload file
      await this.minioClient.putObject(bucketName, objectName, buffer);

    } catch (error) {
      console.error('Error storing in MinIO:', error);
      throw error;
    }
  }

  async storeInPostgres(analysis: DocumentAnalysis): Promise<void> {
    const query = `
      INSERT INTO document_analyses (
        id, filename, mime_type, width, height, entities,
        processing_time, timestamp, minio_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    const values = [
      analysis.id,
      analysis.filename,
      analysis.mimeType,
      analysis.width,
      analysis.height,
      JSON.stringify(analysis.entities),
      analysis.processingTime,
      analysis.timestamp,
      analysis.minioPath
    ];

    try {
      await this.dbPool.query(query, values);
    } catch (error) {
      console.error('Error storing in PostgreSQL:', error);
      throw error;
    }
  }

  private async handleDocumentAnalysis(req: express.Request, res: express.Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const analysis = await this.analyzeDocument(req.file.buffer, req.file.originalname);

      res.json(analysis);
    } catch (error) {
      console.error('Error in document analysis:', error);
      res.status(500).json({ error: error.message });
    }
  }

  private async getAnalysisResult(req: express.Request, res: express.Response) {
    try {
      const { id } = req.params;

      const query = 'SELECT * FROM document_analyses WHERE id = $1';
      const result = await this.dbPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Analysis not found' });
      }

      const analysis = result.rows[0];
      analysis.entities = JSON.parse(analysis.entities);

      res.json(analysis);
    } catch (error) {
      console.error('Error getting analysis result:', error);
      res.status(500).json({ error: error.message });
    }
  }

  private async listAnalyses(req: express.Request, res: express.Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      const query = `
        SELECT id, filename, mime_type, processing_time, timestamp
        FROM document_analyses
        ORDER BY timestamp DESC
        LIMIT $1 OFFSET $2
      `;

      const result = await this.dbPool.query(query, [limit, offset]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error listing analyses:', error);
      res.status(500).json({ error: error.message });
    }
  }

  private async handleRealtimeAnalysis(ws: WebSocket, data: any) {
    try {
      // Handle real-time analysis via WebSocket
      // This could process streaming data or provide progress updates
      ws.send(JSON.stringify({
        type: 'analysis_started',
        id: data.id
      }));

      // Simulate processing steps
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'progress',
          id: data.id,
          step: 'Preprocessing image',
          progress: 25
        }));
      }, 1000);

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'progress',
          id: data.id,
          step: 'Running YOLO detection',
          progress: 50
        }));
      }, 2000);

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'progress',
          id: data.id,
          step: 'SAM segmentation',
          progress: 75
        }));
      }, 3000);

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'analysis_complete',
          id: data.id,
          result: { /* mock result */ }
        }));
      }, 4000);

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  }

  async start(port: number = 3001): Promise<void> {
    await this.initializeModels();

    this.app.listen(port, () => {
      console.log(`YOLO/SAM Legal Pipeline server running on port ${port}`);
      console.log('WebSocket server running on port 8083');
    });
  }

  async cleanup(): Promise<void> {
    await this.dbPool.end();
    this.wss.close();
  }
}

// Main execution
async function main() {
  const pipeline = new YOLOSAMLegalPipeline();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down YOLO/SAM Legal Pipeline...');
    await pipeline.cleanup();
    process.exit(0);
  });

  await pipeline.start();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { YOLOSAMLegalPipeline, DocumentAnalysis, LegalEntity };