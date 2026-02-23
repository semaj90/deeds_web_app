import Tesseract from 'tesseract.js';
import { logger } from '../utils/logger.js';

export async function runOCR(filePath: string): Promise<string> {
  try {
    logger.info('Running OCR', { filePath });

    const worker = await Tesseract.createWorker('eng');
    const { data } = await worker.recognize(filePath);
    await worker.terminate();

    logger.info('OCR completed', { filePath, textLength: data.text.length });
    return data.text;
  } catch (error) {
    logger.error('OCR failed', { filePath, error });
    throw error;
  }
}
