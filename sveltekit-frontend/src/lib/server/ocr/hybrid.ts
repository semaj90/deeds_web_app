import {
    isTesseractAvailable,
    extractTextFromImage as extractTextFromImageNative
} from '$lib/server/ocr/tesseract.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import os from 'os';
import { ENV } from '$lib/server/env.server.js';

/** VLM OCR endpoints — tries llama-server VLM first, then Ollama as fallback */
const VLM_BASE_URL = ENV.VLM_BASE_URL;
const OLLAMA_BASE_URL = ENV.OLLAMA_BASE_URL;
const VLM_MODEL_NAME = process.env.VLM_MODEL ?? 'gemma4-legal-vlm';
/** Confidence threshold below which Tesseract result triggers VLM supplement */
const VLM_OCR_THRESHOLD = 0.6;

export interface OcrResult {
    text: string;
    method: 'native' | 'tesseractjs' | 'fallback' | 'native-from-pdf' | 'tesseractjs-from-pdf' | 'pdf-conversion-failed' | 'vlm-ocr' | 'vlm-ocr-from-pdf';
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

type DocType = 'general' | 'table' | 'handwriting' | 'scan';

const VLM_OCR_PROMPTS: Record<DocType, string> = {
    general: 'This is a page from a legal document. Extract ALL text exactly as it appears, preserving formatting, paragraph breaks, numbering, and section headings. Output only the extracted text without commentary.',
    table: 'This document page contains a table or structured data. Extract all text preserving rows and columns. Use | to separate columns, newlines for rows. Output only the extracted content.',
    handwriting: 'This document page contains handwritten text. Transcribe ALL handwritten text as precisely as possible. Mark unclear words with [?]. Preserve line breaks and paragraph structure. Output only the transcription.',
    scan: 'This is a scanned document page that may have noise or low quality. Extract ALL legible text. Mark truly unreadable sections with [...]. Preserve formatting as much as possible. Output only the extracted text.',
};

/**
 * Classify document type by asking the VLM to inspect the image.
 * Returns 'general' on any error (safe default).
 */
async function classifyDocType(imageBase64: string): Promise<DocType> {
    const classifyPrompt = 'What type of document is shown in this image? Reply with exactly one word from: general (normal text/paragraphs), table (grids/spreadsheets/structured data), handwriting (handwritten text), scan (degraded/low-quality scan). Single word only.';

    const attempt = async (baseUrl: string, model: string): Promise<DocType | null> => {
        try {
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: [
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
                        { type: 'text', text: classifyPrompt },
                    ] }],
                    temperature: 0.1,
                    max_tokens: 8,
                }),
                signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok) return null;
            const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
            const word = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? '';
            const valid: DocType[] = ['general', 'table', 'handwriting', 'scan'];
            return valid.includes(word as DocType) ? (word as DocType) : null;
        } catch {
            return null;
        }
    };

    return (await attempt(VLM_BASE_URL, VLM_MODEL_NAME))
        ?? (await attempt(OLLAMA_BASE_URL, `${VLM_MODEL_NAME}:latest`))
        ?? 'general';
}

/**
 * Extract text from an image buffer using the Gemma 4 VLM (gemma4-legal-vlm).
 * Two-step: classify document type, then apply a type-specific extraction prompt.
 * Tries llama-server :8085 first, falls back to Ollama :11434.
 */
async function extractTextVlm(imageBuffer: Buffer, isPdf: boolean): Promise<OcrResult> {
    const imageBase64 = imageBuffer.toString('base64');
    const docType = await classifyDocType(imageBase64);
    const extractPrompt = VLM_OCR_PROMPTS[docType];

    const attempt = async (baseUrl: string, model: string): Promise<string | null> => {
        try {
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: [
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
                        { type: 'text', text: extractPrompt },
                    ] }],
                    temperature: 0.1,
                    max_tokens: 4096,
                }),
                signal: AbortSignal.timeout(90_000),
            });
            if (!res.ok) return null;
            const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
            return json.choices?.[0]?.message?.content?.trim() ?? null;
        } catch {
            return null;
        }
    };

    const text = (await attempt(VLM_BASE_URL, VLM_MODEL_NAME))
        ?? (await attempt(OLLAMA_BASE_URL, `${VLM_MODEL_NAME}:latest`));

    if (!text) {
        return {
            text: '',
            method: isPdf ? 'vlm-ocr-from-pdf' : 'vlm-ocr',
            confidence: 0,
            error: 'VLM OCR: both endpoints unavailable',
        };
    }

    return {
        text,
        method: isPdf ? 'vlm-ocr-from-pdf' : 'vlm-ocr',
        confidence: calculateOcrConfidence(text),
    };
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
    const viewport1 = page.getViewport({ scale: 1.0 });
    const maxDim = Math.max(viewport1.width, viewport1.height);
    // Cap rendered image at 1536px max dimension — Gemma 4 vision silently degrades above this
    const scale = Math.min(2.0, 1536 / maxDim);
    const viewport = page.getViewport({ scale });
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
            console.log('[OCR Hybrid] PDF detected, performing multi-page VLM OCR');
            const pdfjsPath = ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs'].join('/');
            const { getDocument } = await import(/* @vite-ignore */ pdfjsPath);
            const pdfDoc = await getDocument({ data: new Uint8Array(imageBuffer) }).promise;
            
            const numPages = Math.min(pdfDoc.numPages, 10); // Cap at 10 pages for performance
            const pageTexts: string[] = [];
            let totalConfidence = 0;

            for (let i = 1; i <= numPages; i++) {
                console.log(`[OCR Hybrid] Processing page ${i}/${numPages}...`);
                const pageBuffer = await renderPdfPageToImage(imageBuffer, i);
                const pageResult = await extractTextVlm(pageBuffer, true);
                pageTexts.push(`--- Page ${i} ---\n${pageResult.text}`);
                totalConfidence += pageResult.confidence;
            }

            pdfDoc.destroy();

            return {
                text: pageTexts.join('\n\n'),
                method: 'vlm-ocr-from-pdf',
                confidence: totalConfidence / numPages
            };
        } catch (pdfErr) {
            console.warn('[OCR Hybrid] Multi-page VLM OCR failed, falling back to page 1:', pdfErr);
            // Fallback to single page if multi-page fails
            try {
                processBuffer = await renderPdfPageToImage(imageBuffer, 1);
            } catch (innerErr) {
                return {
                    text: '',
                    method: 'pdf-conversion-failed',
                    confidence: 0,
                    error: innerErr instanceof Error ? innerErr.message : 'Failed to convert PDF to image',
                };
            }
        }
    }

    // Try native Tesseract first
    try {
        const nativeAvailable = await isTesseractAvailable();
        if (nativeAvailable) {
            const result = await extractTextFromImageNative(processBuffer, safeFilename);
            const nativeResult: OcrResult = {
                text: result.text,
                method: isPdf ? 'native-from-pdf' : 'native',
                confidence: calculateOcrConfidence(result.text),
                error: result.error,
            };
            if (nativeResult.confidence >= VLM_OCR_THRESHOLD) return nativeResult;
            try {
                console.log(`[OCR Hybrid] Tesseract confidence ${nativeResult.confidence.toFixed(2)} < ${VLM_OCR_THRESHOLD}, trying VLM OCR`);
                const vlmResult = await extractTextVlm(processBuffer, isPdf);
                if (vlmResult.confidence > nativeResult.confidence) return vlmResult;
            } catch { /* retain Tesseract result */ }
            return nativeResult;
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
        const jsResult: OcrResult = {
            text: trimmedText,
            method: isPdf ? 'tesseractjs-from-pdf' : 'tesseractjs',
            confidence: calculateOcrConfidence(trimmedText),
        };
        if (jsResult.confidence >= VLM_OCR_THRESHOLD) return jsResult;
        try {
            console.log(`[OCR Hybrid] tesseract.js confidence ${jsResult.confidence.toFixed(2)} < ${VLM_OCR_THRESHOLD}, trying VLM OCR`);
            const vlmResult = await extractTextVlm(processBuffer, isPdf);
            if (vlmResult.confidence > jsResult.confidence) return vlmResult;
        } catch { /* retain tesseract.js result */ }
        return jsResult;
    } catch (error) {
        console.error('tesseract.js OCR failed:', error);

        // VLM OCR as last resort before giving up
        try {
            console.log('[OCR Hybrid] Both Tesseract methods failed, attempting VLM OCR');
            const vlmResult = await extractTextVlm(processBuffer, isPdf);
            if (vlmResult.text) return vlmResult;
        } catch { /* fall through to final fallback */ }

        // Final fallback: return empty text
        return {
            text: '',
            method: 'fallback',
            confidence: 0,
            error: 'All OCR methods failed',
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
