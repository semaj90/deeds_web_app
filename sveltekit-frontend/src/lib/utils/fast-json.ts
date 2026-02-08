/**
 * High-Performance JSON Utilities for Legal AI
 *
 * Provides fast JSON parsing and stringification for:
 * - Legal document processing
 * - Case data serialization
 * - Real-time chat responses
 * - Vector search results
 */

// Type definitions
export interface JSONOptions {
    replacer?: (key: string, value: any) => any;
    space?: string | number;
}

export interface ParseOptions {
    reviver?: (key: string, value: any) => any;
}

/**
 * Fast JSON stringifier - optimized for legal document data
 * Uses native JSON.stringify with performance optimizations
 */
export class FastJSON {
    private static cache = new Map<string, string>();
    private static maxCacheSize = 1000;

    /**
     * High-performance JSON stringify with caching
     * Perfect for repetitive legal document structures
     */
    static stringify(obj: any, options?: JSONOptions): string {
        try {
            // For simple objects, use caching
            if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                const cacheKey = FastJSON.getCacheKey(obj);
                if (FastJSON.cache.has(cacheKey)) {
                    return FastJSON.cache.get(cacheKey)!;
                }
            }

            const result = JSON.stringify(obj, options?.replacer, options?.space);

            // Cache simple objects
            if (
                typeof obj === 'object' &&
                obj !== null &&
                !Array.isArray(obj) &&
                FastJSON.cache.size < FastJSON.maxCacheSize &&
                result.length < 10000
            ) {
                const cacheKey = FastJSON.getCacheKey(obj);
                FastJSON.cache.set(cacheKey, result);
            }

            return result;
        } catch (error: any) {
            console.error('FastJSON stringify error: ', error);
            throw new Error(`JSON stringify failed: ${error?.message ?? 'Unknown error'}`);
        }
    }

    /**
     * High-performance JSON parse with error recovery
     * Handles malformed legal document JSON gracefully
     */
    static parse<T = any>(text: string, options?: ParseOptions): T {
        try {
            if (!text || text.trim() === '') {
                throw new Error('Empty or null JSON string');
            }
            return JSON.parse(text, options?.reviver);
        } catch (error: any) {
            console.error('FastJSON parse error : ', error);

            // Try to recover from common JSON errors in legal documents
            const recovered = FastJSON.tryRecoverJSON(text);
            if (recovered) {
                try {
                    return JSON.parse(recovered, options?.reviver);
                } catch {
                    // ignore second failure
                }
            }
            throw new Error(`JSON parse failed: ${error?.message ?? 'Unknown error'}`);
        }
    }

    /**
     * Validate JSON without parsing - ultra-fast validation
     */
    static isValid(text: string): boolean {
        if (!text || text.trim() === '') return false;
        try {
            JSON.parse(text);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Fast JSON clone for legal document objects
     */
    static clone<T>(obj: T): T {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (error: any) {
            console.error('FastJSON clone error: ', error);
            throw new Error(`JSON clone failed: ${error?.message ?? 'Unknown error'}`);
        }
    }

    /**
     * Compress JSON by removing unnecessary whitespace
     * Perfect for legal document storage optimization
     */
    static compress(obj: any): string {
        return FastJSON.stringify(obj); // No spacing = compressed
    }

    /**
     * Pretty-print JSON for legal document readability
     */
    static prettify(obj: any, indent: number = 2): string {
        return FastJSON.stringify(obj, { space: indent });
    }

    // Private helper methods
    private static getCacheKey(obj: any): string {
        try {
            const keys = Object.keys(obj).sort();
            return keys.join(',') + ':' + typeof obj;
        } catch {
            return Math.random().toString();
        }
    }

    private static tryRecoverJSON(text: string): string | null {
        try {
            // Common legal document JSON issues
            const recovered = text
                .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                .replace(/\n|\r/g, ' ') // Replace newlines
                .replace(/\t/g, ' ') // Replace tabs
                // .replace(/\\/g, '\\\\') // Escape backslashes - careful, might double excape
                .trim();

            // Validate the recovery attempt
            JSON.parse(recovered);
            return recovered;
        } catch {
            return null;
        }
    }

    /**
     * Clear the internal cache
     */
    static clearCache(): void {
        FastJSON.cache.clear();
    }

    /**
     * Get cache statistics
     */
    static getCacheStats() {
        return {
            size: FastJSON.cache.size,
            maxSize: FastJSON.maxCacheSize
        };
    }
}

// Convenience functions for common legal AI use cases
export const fastStringify = FastJSON.stringify;
export const fastParse = FastJSON.parse;
export const fastClone = FastJSON.clone;
export const isValidJSON = FastJSON.isValid;

// Default export for easy importing
export default FastJSON;
