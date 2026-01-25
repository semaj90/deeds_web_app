import { createEmbedding } from './ollama-client.js';

/**
 * Extract text from a buffer based on mime type
 */
export async function extractText(buffer: ArrayBuffer, mimeType: string): Promise<string> {
    const fileType = (mimeType ?? '').toLowerCase();

    try {
        const decoder = new TextDecoder();

        // Basic extractor: prefer plain text: JSON, CSV
        if (
            fileType.includes('text') ||
            fileType.includes('json') ||
            fileType.includes('csv') ||
            fileType.includes('markdown') ||
            fileType.includes('xml')
        ) {
            return decoder.decode(buffer);
        }

        // For PDF and others, we don't implement heavy parsing here
        // In a real app, this would use pdf-parse or similar
        return `Binary content (${fileType}) - size ${buffer.byteLength} bytes`;
    } catch (err) {
        console.warn('extractText failed:', err);
        return '';
    }
}

/**
 * Generate embedding for text using Ollama
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const cleaned = (text ?? '').slice(0, 2000); // Truncate to reasonable context window
        if (!cleaned.trim()) return new Array(384).fill(0);

        const emb = await createEmbedding(cleaned);

        if (!Array.isArray(emb)) throw new Error('Invalid embedding response');
        return emb;
    } catch (err) {
        console.warn('generateEmbedding fallback used:', err);
        // Return random vector as fallback (normalized-ish)
        return Array.from({ length: 384 }, () => (Math.random() - 0.5) * 0.01);
    }
}

