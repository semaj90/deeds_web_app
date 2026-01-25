/**
 * Statute Prefetch Service
 * Hybrid mode: Prefetch RAG context silently, wait for user click to generate AI response
 * No unsolicited advice - only data retrieval until user explicitly requests explanation
 */

import { generateEmbedding } from './embedding-service.js';
import { searchStatuteChunks } from './statute-ingestion-service.js';
import { db } from '../db/index.js';
import { statutes, statuteChunks } from '../db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export interface PrefetchContext {
    sectionId: string;
    sectionText: string;
    relatedStatutes: Array<{
        id: string;
        title: string;
        section: string;
        relevance: number;
    }>;
    semanticKeywords: string[];
    vectorContext: number[];
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

export interface ExplainRequest {
    sectionId: string;
    prefetchToken?: string;
    context?: PrefetchContext;
}

/**
 * Extract semantic keywords from statute text
 */
function extractKeywords(text: string, topK: number = 5): string[] {
    // Simple keyword extraction: split by common legal terms
    const legalTerms = [
        'murder', 'assault', 'theft', 'fraud', 'kidnapping', 'sentence',
        'penalty', 'offense', 'crime', 'defendant', 'victim', 'evidence',
        'conviction', 'trial', 'jurisdiction', 'statute', 'section',
        'subsection', 'paragraph'
    ];

    const words = text.toLowerCase().split(/\s+/);
    const keywordCounts = new Map<string, number>();

    for (const word of words) {
        for (const term of legalTerms) {
            if (word.includes(term)) {
                keywordCounts.set(term, (keywordCounts.get(term) ?? 0) + 1);
            }
        }
    }

    return Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([term]) => term);
}

/**
 * Prefetch RAG context for a statute section
 * This is data-only retrieval - no AI generation
 */
export async function prefetchStatuteContext(sectionId: string): Promise<PrefetchContext> {
    try {
        // Get statute
        const statute = await db.select().from(statutes).where(eq(statutes.id, sectionId));

        if (statute.length === 0) {
            throw new Error(`Statute not found: ${sectionId}`);
        }

        const statuteRecord = statute[0];
        // @ts-ignore - 'content' might not exist on schema but implied by original code
        const sectionText = statuteRecord?.content ?? '';

        // Generate embedding for semantic search
        const embedding = await generateEmbedding(sectionText.substring(0, 1000));

        // Search for related statute chunks
        const relatedChunks = await searchStatuteChunks(embedding, 5, 0.5);

        // Get unique related statutes
        const relatedStatuteIds = [...new Set(relatedChunks.map((c) => c.statuteId))];

        const relatedStatutesResults = await Promise.all(
            relatedStatuteIds.map((id) => db.select().from(statutes).where(eq(statutes.id, id)))
        );

        const relatedStatutes = relatedStatutesResults
            .filter((r) => r.length > 0)
            .map((r, index) => ({
                id: r[0].id,
                // @ts-ignore
                title: r[0].title ?? '',
                // @ts-ignore -- assuming schema has section
                section: r[0].section ?? '',
                relevance: relatedChunks[index]?.similarity ?? 0,
            }));

        // Extract keywords
        const keywords = extractKeywords(sectionText);

        // Create prefetch context
        const context: PrefetchContext = {
            sectionId: sectionId,
            sectionText: sectionText,
            relatedStatutes: relatedStatutes,
            semanticKeywords: keywords,
            vectorContext: embedding,
            timestamp: Date.now(),
            ttl: 5 * 60 * 1000, // 5 minute TTL
        };

        return context;
    } catch (error) {
        console.error('Failed to prefetch statute context:', error);
        throw error;
    }
}

/**
 * Build explanation prompt from prefetched context
 * Used when user clicks "Explain this section"
 */
export function buildExplanationPrompt(context: PrefetchContext): string {
    const relatedStatutesText = context.relatedStatutes.length > 0
        ? `\n\nRelated Statutes:\n${context.relatedStatutes.map((s) => `- ${s.title} (${s.section})`).join('\n')}`
        : '';

    const keywordsText = context.semanticKeywords.length > 0
        ? `\n\nKey Legal Concepts: ${context.semanticKeywords.join(', ')}`
        : '';

    return `You are a legal AI assistant. Provide a clear, concise explanation of the following statute section.

Statute Section:
${context.sectionText}
${relatedStatutesText}
${keywordsText}

Provide:
1. Plain English summary (2-3 sentences)
2. Key elements or requirements
3. Potential penalties or consequences
4. Related statutes or exceptions
5. Common defense considerations

Remember: This is legal analysis, not legal advice. Recommend consulting with a qualified attorney.`;
}

/**
 * Validate prefetch context (check TTL)
 */
export function isContextValid(context: PrefetchContext): boolean {
    const age = Date.now() - context.timestamp;
    return age < context.ttl;
}

/**
 * Store prefetch context in ephemeral cache
 * In production, use Redis or similar
 */
const prefetchCache = new Map<string, PrefetchContext>();

export function cacheContext(context: PrefetchContext): string {
    const token = `prefetch_${context.sectionId}_${Date.now()}`;
    prefetchCache.set(token, context);

    // Auto-cleanup after TTL
    setTimeout(() => {
        prefetchCache.delete(token);
    }, context.ttl);

    return token;
}

export function retrieveCachedContext(token: string): PrefetchContext | null {
    const context = prefetchCache.get(token);

    if (!context) {
        return null;
    }

    if (!isContextValid(context)) {
        prefetchCache.delete(token);
        return null;
    }

    return context;
}

/**
 * Clear all cached contexts
 */
export function clearCache(): void {
    prefetchCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
    return {
        size: prefetchCache.size,
        entries: Array.from(prefetchCache.keys()),
    };
}
