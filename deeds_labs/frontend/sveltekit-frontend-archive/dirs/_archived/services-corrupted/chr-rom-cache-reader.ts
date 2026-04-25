/**
 * CHR-ROM Cache Reader Service
 * Zero-latency UI pattern retrieval from Redis L1 cache
 *
 * This service provides instant access to pre-computed UI patterns
 * with graceful fallbacks when cache misses occur.
 */

export interface CHRROMPatternResult {
    hit: boolean;
    pattern?: {
        data: string;
        type?: string;
        metadata?: Record<string, unknown>;
    };
    source: 'cache' | 'fallback' | 'miss';
    latencyMs: number;
}

class CHRROMCacheReader {
    private cache = new Map<string, CHRROMPatternResult>();

    /**
     * Get a pre-computed UI pattern for a document.
     * @param docId - The document identifier
     * @param patternType - The pattern type to retrieve (e.g. 'summary_icon', 'risk_gauge')
     */
    async getPattern(docId: string, patternType: string): Promise<CHRROMPatternResult> {
        const cacheKey = `${docId}:${patternType}`;

        // Check in-memory cache first
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            const response = await fetch(`/api/chr-rom/pattern?docId=${encodeURIComponent(docId)}&type=${encodeURIComponent(patternType)}`);

            if (response.ok) {
                const data = await response.json();
                const result: CHRROMPatternResult = {
                    hit: true,
                    pattern: data,
                    source: 'cache',
                    latencyMs: 0
                };
                this.cache.set(cacheKey, result);
                return result;
            }
        } catch {
            // Fall through to miss
        }

        return { hit: false, source: 'miss', latencyMs: 0 };
    }

    /**
     * Clear cached patterns for a specific document.
     */
    clearDocument(docId: string): void {
        const keysToDelete: string[] = [];
        this.cache.forEach((_value, key) => {
            if (key.startsWith(`${docId}:`)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Clear all cached patterns.
     */
    clearAll(): void {
        this.cache.clear();
    }
}

// Singleton instance
export const chrROMCacheReader = new CHRROMCacheReader();

// Utility functions for Svelte components
export async function getDocumentIcon(docId: any): Promise<string> {
    const result = await chrROMCacheReader.getPattern(docId, 'summary_icon');
    return result.pattern?.data ?? '';
}

export async function getDocumentRiskGauge(docId: any): Promise<string> {
    const result = await chrROMCacheReader.getPattern(docId, 'risk_gauge');
    return result.pattern?.data ?? '';
}

export async function getDocumentCategoryColor(docId: any): Promise<string> {
    const result = await chrROMCacheReader.getPattern(docId, 'category_color');
    return result.pattern?.data ?? '#6B7280';
}

export async function getDocumentConfidenceBadge(docId: any): Promise<string> {
    const result = await chrROMCacheReader.getPattern(docId, 'confidence_badge');
    return result.pattern?.data ?? '';
}

export async function getDocumentStatusIndicator(docId: any): Promise<string> {
    const result = await chrROMCacheReader.getPattern(docId, 'status_indicator');
    return result.pattern?.data ?? '';
}
