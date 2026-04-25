/**
 * Docling Integration Module
 * Connects to docling-vlm Docker service for OCR + layout-aware text extraction
 */

import { env } from '$env/dynamic/private';

// Docker service URL (falls back to localhost for dev)
const DOCLING_SERVICE_URL = env.DOCLING_SERVICE_URL || 'http://localhost:8085';

export type DoclingBlock = {
    type: 'paragraph' | 'heading' | 'table' | 'list' | 'equation' | 'image' | 'transcription' | 'other';
    text: string;
	page: number;
    bbox?: [number, number, number, number];
	timestampMs?: number;
};

export type DoclingResult = {
    fullText: string;
	blocks: DoclingBlock[];
    pageCount?: number;
    processingTimeMs?: number;
};

type AnalyzeArgs = {
    fileBuffer: Buffer;
	mimeType: string;
};

/**
 * Analyze document using docling-vlm Docker service
 */
export async function analyzeDocumentWithDocling(args: AnalyzeArgs): Promise<DoclingResult> {
    const { fileBuffer, mimeType } = args;
    const startTime = Date.now();

    try {
        const formData = new FormData();
        formData.append('file', new Blob([new Uint8Array(fileBuffer)]), 'document');
        formData.append('mime_type', mimeType);

        const response = await fetch(`${DOCLING_SERVICE_URL}/analyze`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Docling service error (${response.status}): ${errorText}`);
        }

        const result = await response.json() as {
            full_text: string;
            blocks: Array<{
                type: string;
                text: string;
                page: number;
                bbox?: number[];
                timestamp_ms?: number;
            }>;
            page_count: number;
            processing_time_ms: number;
        };

        // Map snake_case response to camelCase
        return {
            fullText: result.full_text,
            blocks: result.blocks.map(b => ({
                type: b.type as DoclingBlock['type'],
                text: b.text,
                page: b.page,
                bbox: b.bbox as [number, number, number, number] | undefined,
                timestampMs: b.timestamp_ms,
            })),
            pageCount: result.page_count,
            processingTimeMs: result.processing_time_ms || (Date.now() - startTime),
        };
    } catch (error) {
        console.error('❌ Docling analysis failed:', error);
        throw error;
    }
}

/**
 * Transcribe audio using docling-vlm Docker service.
 * Supports WAV, MP3, M4A via Whisper ASR.
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<DoclingResult> {
    const startTime = Date.now();

    try {
        const formData = new FormData();
        formData.append('file', new Blob([new Uint8Array(audioBuffer)]), 'audio');
        formData.append('language', 'en');

        const response = await fetch(`${DOCLING_SERVICE_URL}/transcribe`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Transcription service error (${response.status}): ${errorText}`);
        }

        const result = await response.json() as {
            text: string;
            language: string;
            word_count: number;
            duration_seconds: number;
            segments: Array<{ start: number; end: number; text: string }>;
            processing_time_ms: number;
        };

        // Convert transcription result to DoclingResult format
        return {
            fullText: result.text,
            blocks: [{
                type: 'transcription',
                text: result.text,
                page: 1,
                timestampMs: 0,
            }],
            pageCount: 1,
            processingTimeMs: result.processing_time_ms || (Date.now() - startTime),
        };
    } catch (error) {
        console.error('❌ Audio transcription failed:', error);
        throw error;
    }
}

/**
 * Check if docling-vlm Docker service is available
 */
export async function isDoclingAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${DOCLING_SERVICE_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) return false;

        const health = await response.json() as { status: string; services: Record<string, boolean> };
        return health.status === 'healthy';
    } catch {
        return false;
    }
}

/**
 * Detect objects in image using YOLO via docling-vlm service
 */
export async function detectObjectsInImage(imageBuffer: Buffer, mimeType: string): Promise<{
    detections: Array<{ class: string; confidence: number; bbox: number[] }>;
    numObjects: number;
    classes: string[];
}> {
    try {
        const formData = new FormData();
        formData.append('file', new Blob([new Uint8Array(imageBuffer)]), 'image');
        formData.append('confidence', '0.25');

        const response = await fetch(`${DOCLING_SERVICE_URL}/detect`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`YOLO detection error (${response.status}): ${errorText}`);
        }

        const result = await response.json() as {
            detections: Array<{ class: string; confidence: number; bbox: number[] }>;
            num_objects: number;
            classes: string[];
        };

        return {
            detections: result.detections,
            numObjects: result.num_objects,
            classes: result.classes,
        };
    } catch (error) {
        console.error('❌ YOLO detection failed:', error);
        throw error;
    }
}

// Legacy export for backward compatibility
export const processWithDocling = analyzeDocumentWithDocling;
