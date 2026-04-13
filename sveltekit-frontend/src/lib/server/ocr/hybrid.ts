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
    method: 'native' | 'tesseractjs' | 'fallback' | 'native-from-pdf' | 'tesseractjs-from-pdf' | 'pdf-conversion-failed';
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
 * Sanitize filename for filesystem safety (matches tesseract.ts)
 * Prevents issues with spaces, special characters in filenames.
 */
function sanitizeFilename(filename: string): string {
    const basename = filename.replace(/^.*[\\/]/, '');
    const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe.substring(0, 255);
}

/**
 * Render a single PDF page to a PNG buffer using pdfjs-dist + @napi-rs/canvas.
 * This enables OCR on scanned PDFs by converting the first page to an image.
 *
 * @param pdfBuffer - PDF file buffer
 * @param pageNumber - Page number to render (1-indexed)
 * @returns PNG image buffer suitable for Tesseract OCR
 */
async function renderPdfPageToImage(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer> {
    // Runtime-constructed paths prevent Rollup from statically resolving native .node binaries
    const pdfjsPath = ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs'].join('/');
    const canvasPath = ['@napi-rs', 'canvas'].join('/');
    const { getDocument } = await import(/* @vite-ignore */ pdfjsPath);
    const { createCanvas } = await import(/* @vite-ignore */ canvasPath);

    const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    if (pageNumber > pdfDoc.numPages) {
        throw new Error(`Page ${pageNumber} exceeds PDF page count (${pdfDoc.numPages})`);
    }

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better OCR accuracy
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');

    // White background (scanned docs may have transparent BG)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx as any, viewport }).promise;
    const pngBuffer = canvas.toBuffer('image/png');

    // Cleanup
    page.cleanup();
    pdfDoc.destroy();

    return Buffer.from(pngBuffer);
}

/**
 * Hybrid OCR service that tries native Tesseract first, then falls back to tesseract.js
 */
export async function extractTextHybrid(imageBuffer: Buffer, filename: string): Promise<OcrResult> {
    const safeFilename = sanitizeFilename(filename);

    // Check if this is a PDF file — convert to image first
    const isPdf = /\.pdf$/i.test(filename);
    let processBuffer = imageBuffer;

    if (isPdf) {
        try {
            console.log('[OCR Hybrid] PDF detected, converting first page to image for OCR');
            // Convert first page of PDF to PNG using pdfjs-dist + @napi-rs/canvas
            processBuffer = await renderPdfPageToImage(imageBuffer, 1);
        } catch (pdfErr) {
            return {
                text: '',
                method: 'pdf-conversion-failed',
                confidence: 0,
                error: pdfErr instanceof Error ? pdfErr.message : 'Failed to convert PDF to image',
            };
        }
    }

    // Try native Tesseract first
    try {
        const nativeAvailable = await isTesseractAvailable();
        if (nativeAvailable) {
            const result = await extractTextFromImageNative(processBuffer, safeFilename);
            return {
                text: result.text,
                method: isPdf ? 'native-from-pdf' : 'native',
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
        const tempFile = path.join(tempDir, `ocr-js-${Date.now()}-${safeFilename}`);

        // Write buffer to temp file for tesseract.js (use processBuffer which may be PDF→image converted)
        await fs.writeFile(tempFile, processBuffer);

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
            method: isPdf ? 'tesseractjs-from-pdf' : 'tesseractjs',
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
