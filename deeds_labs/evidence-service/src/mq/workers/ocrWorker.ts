import { getChannel, QUEUES } from '../connect.js';
import { publishJob } from '../producer.js';
import { db } from '../../db/drizzle.js';
import { evidences, analysisJobs } from '../../db/schema.js';
import { runOCR } from '../../services/ocr.js';
import { downloadFile } from '../../storage/minio.js';
import { logger } from '../../utils/logger.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function processOCRJob(message: any): Promise<void> {
  const { evidenceId } = message;

  logger.info('Processing OCR job', { evidenceId });

  try {
    // Update job status
    await db.insert(analysisJobs).values({
      evidenceId,
      jobType: 'ocr',
      status: 'processing',
      startedAt: new Date(),
    });

    // Get evidence record
    const [evidence] = await db.select().from(evidences).where(eq(evidences.id, evidenceId));

    if (!evidence) {
      throw new Error(`Evidence not found: ${evidenceId}`);
    }

    // Download file from MinIO to temp location
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    const tempFile = path.join(tempDir, 'file');

    await downloadFile(evidence.storagePath, tempFile);

    // Run OCR
    const ocrText = await runOCR(tempFile);

    // Update evidence with OCR text
    await db.update(evidences)
      .set({
        ocrText,
        status: 'ocr_complete',
        updatedAt: new Date(),
      })
      .where(eq(evidences.id, evidenceId));

    // Update job status
    await db.update(analysisJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        result: { textLength: ocrText.length },
      })
      .where(eq(analysisJobs.evidenceId, evidenceId));

    // Clean up temp file
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Publish to embedding queue
    await publishJob(QUEUES.EMBED, { evidenceId, text: ocrText });

    logger.info('OCR job completed', { evidenceId, textLength: ocrText.length });
  } catch (error) {
    logger.error('OCR job failed', { evidenceId, error });

    await db.update(analysisJobs)
      .set({
        status: 'failed',
        error: String(error),
        completedAt: new Date(),
      })
      .where(eq(analysisJobs.evidenceId, evidenceId));

    throw error;
  }
}

export async function startOCRWorker(): Promise<void> {
  logger.info('Starting OCR worker');

  const channel = await getChannel();
  await channel.prefetch(1);

  channel.consume(QUEUES.OCR, async (msg: any) => {
    if (!msg) return;

    try {
      const message = JSON.parse(msg.content.toString());
      await processOCRJob(message);
      channel.ack(msg);
    } catch (error) {
      logger.error('Failed to process OCR message', { error });
      channel.nack(msg, false, false);
    }
  });

  logger.info('OCR worker started');
}

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startOCRWorker().catch((error) => {
    logger.error('OCR worker crashed', { error });
    process.exit(1);
  });
}
