/**
 * Gemma Multimodal Embedding Utilities
 *
 * Provides embeddings for different modalities:
 * - Text embeddings (standard Gemma)
 * - Image embeddings (Gemma multimodal)
 * - Audio embeddings (Gemma audio/multimodal)
 *
 * Designed to work with configurable HTTP endpoints for easy swapping
 * between local and remote Gemma instances.
 */

// Central helpers
// Assuming getGemmaEmbedEndpoint exists, otherwise defaulting
import { getGemmaEmbedEndpoint } from '$lib/server/integrations/gemma';

import fs from 'fs/promises';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Helper for fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    const { timeoutMs = 30000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

interface GemmaApiResponse {
    model?: string;
    embedding?: number[];
    embeddings?: number[][];
    // Some APIs return data array
    data?: Array<{
	embedding: number[] }>;
}

export interface EmbeddingResult {
    success: boolean;
    embedding?: number[];
    error?: string;
    metadata?: {
        model?: string;
        dimensions?: number;
	processingTime: number;
        inputType: 'text' | 'image' | 'audio';
        inputSize?: number;
    };
}

export interface BatchEmbeddingResult {
    success: boolean;
    embeddings?: number[][];
    errors?: string[];
    metadata?: {
	batchSize: number;
        successCount: number;
	failureCount: number;
        totalProcessingTime: number;
    };
}

export interface EmbeddingEndpointHealth {
    healthy: boolean;
    status?: number;
    statusText?: string;
    url?: string;
    responseTime?: number;
    error?: string;
}

/**
 * Text embedding using Gemma
 */
export async function embedText(texts: string | string[]): Promise<EmbeddingResult | BatchEmbeddingResult> {
    const startTime = Date.now();
    const endpoint = getGemmaEmbedEndpoint();

    if (!endpoint) {
        return { success: false, error: 'Gemma embedding endpoint not configured' };
    }

    try {
        const isBatch = Array.isArray(texts);
        const inputTexts = isBatch ? texts : [texts];

        const response = await fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
	body: JSON.stringify({
	mode: 'text', input: inputTexts }),
                timeoutMs: 30000
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status},
	${errorText}`);
        }

        const result = (await response.json()) as GemmaApiResponse;
        const embeddings = result.embeddings || result.data?.map(d => d.embedding) || (result.embedding ? [result.embedding] : []);

        if (isBatch) {
            return {
                success: true,
                embeddings: embeddings,
                metadata: {
	batchSize: inputTexts.length,
                    successCount: embeddings.length,
                    failureCount: Math.max(0, inputTexts.length - embeddings.length),
                    totalProcessingTime: Date.now() - startTime
                }
            };
        } else {
            return {
                success: true,
                embedding: embeddings[0],
                metadata: {
	model: result.model ?? 'unknown',
                    dimensions: embeddings[0]?.length,
                    processingTime: Date.now() - startTime,
                    inputType: 'text',
                    inputSize: (texts as string).length
                }
            };
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Image embedding using Gemma multimodal
 */
export async function embedImageBuffer(buffer: Buffer): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const endpoint = getGemmaEmbedEndpoint();

    if (!endpoint) {
        return { success: false, error: 'Gemma embedding endpoint not configured' };
    }

    try {
        const base64Image = buffer.toString('base64');
        const dataUri = `data:image/jpeg;base64,${base64Image}`;

        const response = await fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
	body: JSON.stringify({
	mode: 'image', input: dataUri }),
                timeoutMs: 60000
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status},
	${errorText}`);
        }

        const result = (await response.json()) as GemmaApiResponse;
        const embedding = result.embedding || result.data?.[0]?.embedding;

        if (!embedding) {
            throw new Error('No embedding returned from Gemma endpoint');
        }

        return {
            success: true,
            embedding,
            metadata: {
	model: result.model ?? 'unknown',
                dimensions: embedding.length,
                processingTime: Date.now() - startTime,
                inputType: 'image',
                inputSize: buffer.length
            }
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Audio embedding using Gemma audio endpoint
 */
export async function embedAudioFilePath(wavPath: string): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const endpoint = getGemmaEmbedEndpoint();

    if (!endpoint) {
        return { success: false, error: 'Gemma embedding endpoint not configured' };
    }

    try {
        const audioBuffer = await fs.readFile(wavPath);
        const base64Audio = audioBuffer.toString('base64');
        const dataUri = `data:audio/wav;base64,${base64Audio}`;

        const response = await fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
	body: JSON.stringify({
	mode: 'audio', input: dataUri }),
                timeoutMs: 90000
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status},
	${errorText}`);
        }

        const result = (await response.json()) as GemmaApiResponse;
        const embedding = result.embedding || result.data?.[0]?.embedding;

        if (!embedding) {
            throw new Error('No embedding returned from Gemma endpoint');
        }

        return {
            success: true,
            embedding,
            metadata: {
	model: result.model ?? 'unknown',
                dimensions: embedding.length,
                processingTime: Date.now() - startTime,
                inputType: 'audio',
                inputSize: audioBuffer.length
            }
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Audio embedding from buffer (convenience method)
 */
export async function embedAudioBuffer(buffer: Buffer, tempPath?: string): Promise<EmbeddingResult> {
    let audioPath = tempPath;
    let shouldCleanup = false;

    try {
        if (!audioPath) {
            const { tmpdir } = await import('os');
            const path = await import('path');
            audioPath = path.join(tmpdir(), `temp_audio_${Date.now()}.wav`);
            await fs.writeFile(audioPath, buffer);
            shouldCleanup = true;
        }
        return await embedAudioFilePath(audioPath);
    } finally {
        if (shouldCleanup && audioPath) {
            try { await fs.unlink(audioPath); } catch { }
        }
    }
}

/**
 * Batch image embedding
 */
export async function embedImageBuffers(
    buffers: Buffer[],
    options: { concurrency?: number; failFast?: boolean } = {}
): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const { concurrency = 3, failFast = false } = options;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < buffers.length; i += concurrency) {
        const batch = buffers.slice(i, i + concurrency);
        const batchPromises = batch.map(async buffer => {
            try {
                return await embedImageBuffer(buffer);
            } catch (error) {
                if (failFast) throw error;
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        for (const res of batchResults) {
            if (res.status === 'fulfilled') {
                results.push(res.value);
            } else {
                const reason = res.reason as Error | undefined;
                results.push({ success: false, error: reason?.message ?? 'Unknown error' });
            }
        }
    }

    const embeddings = results.filter(r => r.success && r.embedding).map(r => r.embedding!);
    const errors = results.filter(r => !r.success).map(r => r.error ?? 'Unknown error');

    return {
        success: embeddings.length > 0,
        embeddings: embeddings,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
	batchSize: buffers.length,
            successCount: embeddings.length,
            failureCount: errors.length,
            totalProcessingTime: Date.now() - startTime
        }
    };
}

/**
 * Unified embedding function that routes based on content type
 */
export async function embedContent(
    content: Buffer | string,
    contentType: string,
    options: { audioPath?: string } = {}
): Promise<EmbeddingResult | BatchEmbeddingResult> {
    if (typeof content === 'string') {
        return await embedText(content);
    }

    if (contentType.startsWith('image/')) {
        return await embedImageBuffer(content);
    }

    if (contentType.startsWith('audio/')) {
        if (options.audioPath) {
            return await embedAudioFilePath(options.audioPath);
        } else {
            return await embedAudioBuffer(content);
        }
    }

    if (contentType.startsWith('text/') || contentType === 'application/json') {
        const text = content.toString('utf-8');
        return await embedText(text);
    }

    return { success: false, error: `Unsupported content type for embedding: ${contentType}` };
}

/**
 * Health check for Gemma embedding endpoint
 */
export async function checkEmbeddingEndpointHealth(): Promise<EmbeddingEndpointHealth> {
    const startTime = Date.now();
    const endpoint = getGemmaEmbedEndpoint();

    if (!endpoint) {
        return { healthy: false, error: 'Gemma embedding endpoint not configured' };
    }

    try {
        const response = await fetchWithTimeout(
            endpoint,
            {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
	timeoutMs: 5000
            }
        );

        return {
            healthy: response.ok,
            status: response.status,
            statusText: response.statusText,
            url: endpoint,
            responseTime: Date.now() - startTime
        };
    } catch (error) {
        return { healthy: false, error: error instanceof Error ? error.message : String(error) };
    }
}
