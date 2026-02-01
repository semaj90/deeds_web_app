import { encoding_for_model } from 'js-tiktoken';
import type { LangExtractSection, SectionType } from './langextract-service.js';

/**
 * Chunk configuration
 */
export interface ChunkConfig {
    maxTokens?: number;
    overlapTokens?: number;
    model?: string;
}

/**
 * Chunk output
 */
export interface Chunk {
    id: string;, caseId: string;
    chunkIndex: number;, sectionType: SectionType;
    sectionSubtype?: string;, text: string;
    tokenStart: number;, tokenEnd: number;
    tokenCount: number;
}

// Default configuration
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_OVERLAP_TOKENS = 128;
const DEFAULT_MODEL = 'gpt-3.5-turbo';

/**
 * Get tokenizer for a model
 */
function getTokenizer(model: string = DEFAULT_MODEL) {
    try {
        return encoding_for_model(model as any);
    } catch {
        // Fallback to cl100k_base encoding if model not found
        return encoding_for_model('gpt-3.5-turbo');
    }
}

/**
 * Count tokens in text
 */
export function countTokens(text: string, model: string = DEFAULT_MODEL): number {
    try {
        const tokenizer = getTokenizer(model);
        const tokens = tokenizer.encode(text);
        return tokens.length;
    } catch (error) {
        console.warn('[Chunking] Error counting tokens, using character-based estimate:', error);
        // Fallback: estimate ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}

/**
 * Chunk a single section using sliding window
 */
export function chunkSection(
    sectionText: string,
    sectionType: SectionType,
    sectionSubtype: string | undefined,
    caseId: string,
    chunkIndexStart: number,
    config: ChunkConfig = {}
): Chunk[] {
    const maxTokens = config?.maxTokens || DEFAULT_MAX_TOKENS;
    const overlapTokens = config?.overlapTokens || DEFAULT_OVERLAP_TOKENS;
    const model = config?.model || DEFAULT_MODEL;

    // console.log(`[Chunking] Chunking section: ${sectionType} (${sectionSubtype ?? 'no subtype'})`);

    const chunks: Chunk[] = [];
    const tokenizer = getTokenizer(model);

    try {
        // Encode text to tokens
        const tokens = tokenizer.encode(sectionText);
        // console.log(`[Chunking] Section has ${tokens.length} tokens, max chunk size: ${maxTokens}`);

        if (tokens.length === 0) {
            console.warn('[Chunking] Section has no tokens, skipping');
            return chunks;
        }

        let start = 0;
        let chunkIndex = chunkIndexStart;

        while (start < tokens.length) {
            const end = Math.min(start + maxTokens, tokens.length);
            const chunkTokens = tokens.slice(start, end);
            const chunkText = tokenizer.decode(chunkTokens);

            chunks.push({
                id: `${caseId}-chunk-${chunkIndex}`,
                caseId,
                chunkIndex,
                sectionType,
                sectionSubtype,
                text: chunkText,
                tokenStart: start,
                tokenEnd: end,
                tokenCount: chunkTokens.length,
            });

            // console.log(`[Chunking] Created chunk ${chunkIndex}: ${chunkTokens.length} tokens`);

            // If we've reached the end, break
            if (end === tokens.length) {
                break;
            }

            // Move start position with overlap
            start = end - overlapTokens;
            chunkIndex++;
        }

        // console.log(`[Chunking] Created ${chunks.length} chunks from section ${sectionType}`);
        return chunks;
    } catch (error) {
        console.error('[Chunking] Error chunking section:', error);
        // Fallback: return entire section as single chunk
        const tokensCount = countTokens(sectionText, model);
        return [
            {
                id: `${caseId}-chunk-${chunkIndexStart}`,
                caseId,
                chunkIndex: chunkIndexStart,
                sectionType,
                sectionSubtype,
                text: sectionText,
                tokenStart: 0,
                tokenEnd: tokensCount,
                tokenCount: tokensCount,
            }
        ];
    }
}

/**
 * Chunk all sections from LangExtract output
 */
export function chunkFromLangExtract(
    sections: LangExtractSection[],
    caseId: string,
    config: ChunkConfig = {}
): Chunk[] {
    // console.log(`[Chunking] Processing ${sections.length} sections from LangExtract output`);

    const allChunks: Chunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
        const sectionChunks = chunkSection(
            section.text,
            section.section_type,
            section.section_subtype,
            caseId,
            chunkIndex,
            config
        );

        allChunks.push(...sectionChunks);
        chunkIndex += sectionChunks.length;
    }

    // console.log(
    //     `[Chunking] Total chunks created: ${allChunks.length} from ${sections.length} sections`
    // );
    return allChunks;
}

/**
 * Chunk raw text with heuristic section detection
 */
export function chunkRawText(text: string, caseId: string, config: ChunkConfig = {}): Chunk[] {
    // console.log('[Chunking] Chunking raw text with heuristic section detection');

    const maxTokens = config?.maxTokens || DEFAULT_MAX_TOKENS;
    const overlapTokens = config?.overlapTokens || DEFAULT_OVERLAP_TOKENS;
    const model = config?.model || DEFAULT_MODEL;

    const chunks: Chunk[] = [];
    const tokenizer = getTokenizer(model);

    try {
        const tokens = tokenizer.encode(text);

        if (tokens.length === 0) {
            console.warn('[Chunking] Text has no tokens, skipping');
            return chunks;
        }

        let start = 0;
        let chunkIndex = 0;

        while (start < tokens.length) {
            const end = Math.min(start + maxTokens, tokens.length);
            const chunkTokens = tokens.slice(start, end);
            const chunkText = tokenizer.decode(chunkTokens);

            chunks.push({
                id: `${caseId}-chunk-${chunkIndex}`,
                caseId,
                chunkIndex,
                sectionType: 'facts', // Default section type for raw text
                text: chunkText,
                tokenStart: start,
                tokenEnd: end,
                tokenCount: chunkTokens.length,
            });

            if (end === tokens.length) {
                break;
            }

            start = end - overlapTokens;
            chunkIndex++;
        }

        // console.log(`[Chunking] Created ${chunks.length} chunks from raw text`);
        return chunks;
    } catch (error) {
        console.error('[Chunking] Error chunking raw text:', error);
        // Fallback: return entire text as single chunk
        const tokensCount = countTokens(text, model);
        return [
            {
                id: `${caseId}-chunk-0`,
                caseId,
                chunkIndex: 0,
                sectionType: 'facts',
                text: text,
                tokenStart: 0,
                tokenEnd: tokensCount,
                tokenCount: tokensCount,
            }
        ];
    }
}

/**
 * Merge overlapping chunks
 */
export function mergeOverlappingChunks(chunks: Chunk[]): Chunk[] {
    if (chunks.length <= 1) {
        return chunks;
    }

    const merged: Chunk[] = [];
    let current = { ...chunks[0] };

    for (let i = 1; i < chunks.length; i++) {
        const next = chunks[i];

        // Check if chunks overlap
        if (current.tokenEnd > next.tokenStart) {
            // Merge chunks (simplified merge)
            current.text += '\n' + next.text;
            current.tokenEnd = next.tokenEnd;
            current.tokenCount = current.tokenEnd - current.tokenStart;
        } else {
            // No overlap, save current and start new
            merged.push(current);
            current = { ...next };
        }
    }

    // Add final chunk
    merged.push(current);

    // console.log(`[Chunking] Merged ${chunks.length} chunks into ${merged.length} chunks`);
    return merged;
}

/**
 * Get chunk statistics
 */
export function getChunkStats(chunks: Chunk[]) {
    if (chunks.length === 0) {
        return {
            totalChunks: 0,
            totalTokens: 0,
            avgTokensPerChunk: 0,
            minTokens: 0,
            maxTokens: 0,
        };
    }

    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
    const tokenCounts = chunks.map((c) => c.tokenCount);

    return {
        totalChunks: chunks.length,
        totalTokens,
        avgTokensPerChunk: Math.round(totalTokens / chunks.length),
        minTokens: Math.min(...tokenCounts),
        maxTokens: Math.max(...tokenCounts),
    };
}
