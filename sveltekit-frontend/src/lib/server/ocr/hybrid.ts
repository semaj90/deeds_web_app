import {
    isTesseractAvailable,
    extractTextFromImage as extractTextFromImageNative
} from '$lib/server/ocr/tesseract.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import os from 'os';

export interface OcrResult {
    text: string;
    method: 'native' | 'tesseractjs' | 'fallback';
    confidence: number;
    error?: string;
}

/**
 * Calculate OCR confidence from extracted text using heuristic analysis.
 * Ported from Python ocr_service.py — aggregates per-word quality signals.
 */
function calculateOcrConfidence(text: string): number {
    if (!text.trim()) return 0;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return 0;

    let validWords = 0;
    for (const word of words) {
        const alphaRatio = (word.match(/[a-zA-Z]/g)?.length ?? 0) / word.length;
        // Word is "valid" if >50% alphabetic or is a number/legal citation pattern
        if (alphaRatio > 0.5 || /^\d+$/.test(word) || /^§\d+/.test(word) || /^\d+[a-zA-Z]/.test(word)) {
            validWords++;
        }
    }

    const wordConfidence = validWords / words.length;
    // Boost for longer text (more content = higher confidence)
    const lengthBoost = Math.min(words.length / 50, 1) * 0.1;
    // Penalize if too many special characters (likely OCR artifacts)
    const specialCharRatio = (text.match(/[^\w\s.,;:!?()\-'"§]/g)?.length ?? 0) / text.length;
    const specialPenalty = Math.min(specialCharRatio * 2, 0.3);

    return Math.max(0, Math.min(1, wordConfidence + lengthBoost - specialPenalty));
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
                confidence: calculateOcrConfidence(result.text),
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

        const trimmedText = text.trim();
        return {
            text: trimmedText,
            method: 'tesseractjs',
            confidence: calculateOcrConfidence(trimmedText),
        };
    } catch (error) {
        console.error('tesseract.js OCR failed:', error);

        // Final fallback: return empty text
        return {
            text: '',
            method: 'fallback',
            confidence: 0,
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
                    confidence: calculateOcrConfidence(text),
                };
            } catch {
                return {
                    text: '',
                    method: 'fallback',
                    confidence: 0,
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
            confidence: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
