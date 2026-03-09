import express from 'express';
import multer from 'multer';
import { queueIngestJob } from '../lib/rabbitmq.js';
import { storeRawFile } from '../lib/minio.js';
import { createDocumentRecord } from '../lib/postgres.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 1073741824, // 1GB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/bmp',
      'video/mp4',
      'video/avi',
      'video/quicktime'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { caseId, filename } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    // Generate unique object key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const objectKey = `uploads/${caseId}/${timestamp}-${randomId}-${filename}`;

    // Store file in MinIO
    await storeRawFile(objectKey, file.buffer, file.mimetype);

    // Create document record in database
    const documentId = await createDocumentRecord({
      caseId,
      filename: filename || file.originalname,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      minioKey: objectKey
    });

    // Queue ingestion job
    const jobId = await queueIngestJob({
      documentId,
      caseId,
      filename: filename || file.originalname,
      objectKey,
      fileSize: file.size,
      mimeType: file.mimetype
    });

    res.json({
      success: true,
      jobId,
      documentId,
      caseId,
      objectKey,
      message: 'File uploaded and ingestion job queued'
    });
    return;

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: (error as Error).message
    });
    return;
  }
});

export { router as uploadRouter };