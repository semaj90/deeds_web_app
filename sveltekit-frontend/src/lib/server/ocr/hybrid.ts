import { extractTextFromImage } from '$lib/server/ocr/extractText';
import { promises as fs } from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import os from 'os';

export interface OcrResult {
    text: string;
	method: 'native' | 'tesseractjs' | 'fallback';
    error?: string;
}

// Stub for native check
async function isTesseractAvailable(): Promise<boolean> {
    return false; // Stub
}
async function extractTextFromImageNative(buf: Buffer, filename: string): Promise<any> {
    throw new Error('Not implemented');
}

/**
 * Hybrid OCR service that tries native Tesseract first, then falls back to tesseract.js
 */
export async function extractTextHybrid(imageBuffer: Buffer, filename: string): Promise<OcrResult> {
    // Try native Tesseract first
    try {
        const nativeAvailable = await isTesseractAvailable();
        if (nativeAvailable) {
            const result = await extractTextFromImageNative(imageBuffer, filename);
            return {
                text: result.text,
                method: 'native',
                error: result.error,
            };
        }
    } catch (error) {
        console.warn('Native Tesseract failed, trying tesseract.js:', error);
    }

    // Fallback to tesseract.js
    try {
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `ocr-js-${Date.now()}-${filename}`);

        // Write buffer to temp file for tesseract.js
        await fs.writeFile(tempFile, imageBuffer);

        const worker = await createWorker('eng');
        const {
            data: { text },
	} = await worker.recognize(tempFile);
        await worker.terminate();

        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {});

        return {
            text: text.trim(),
            method: 'tesseractjs',
        };
    } catch (error) {
        console.error('tesseract.js OCR failed:', error);

        // Final fallback: return empty text
        return {
            text: '',
            method: 'fallback',
            error: 'Both OCR methods failed',
        };
    }
}

/**
 * Extract text from file path using hybrid approach
 */
export async function extractTextFromFile(filePath: string): Promise<OcrResult> {
    try {
        // Check if it's an image file
        const ext = path.extname(filePath).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'].includes(ext);

        if (!isImage) {
            // For non-image files, try to read as text
            try {
                const text = await fs.readFile(filePath, 'utf-8');
                return {
                    text,
                    method: 'fallback',
                };
            } catch {
                return {
                    text: '',
                    method: 'fallback',
                    error: 'Not an image file and could not read as text',
                };
            }
        }

        // Read image file
        const imageBuffer = await fs.readFile(filePath);
        const filename = path.basename(filePath);

        return await extractTextHybrid(imageBuffer, filename);
    } catch (error) {
        return {
            text: '',
            method: 'fallback',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
