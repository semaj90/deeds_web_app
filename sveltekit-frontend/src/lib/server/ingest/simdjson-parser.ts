/**
 * Large JSON Processing with simdjson-wasm
 *
 * High-performance JSON parsing for large files using WASM-based simdjson.
 * Falls back to native JSON.parse for smaller files or when simdjson fails.
 */

export async function parseLargeJsonWithSimd(jsonString: string): Promise<any> {
    const startTime = Date.now();
    const originalSize = jsonString.length;
    let parsedData: any;
    let parser: 'simdjson' | 'native' = 'native';

    // Use simdjson for large files (>1MB)
    if (originalSize > 1024 * 1024) {
        try {
            // @ts-ignore
            const { build } = await import('simdjson-wasm');
            const simd = await build();
            parsedData = simd.parse(jsonString);
            parser = 'simdjson';
        } catch (simdjsonError) {
            console.warn('simdjson-wasm failed, falling back to native parser: ', simdjsonError);
            parsedData = JSON.parse(jsonString);
        }
    } else {
        parsedData = JSON.parse(jsonString);
    }

    // Extract text fields for embedding
    const textFields: string[] = [];

    function extractTextFields(obj: any, maxDepth = 10, currentDepth = 0): void {
        if (currentDepth >= maxDepth || !obj) return;

        if (typeof obj === 'string') {
            if (obj.length > 10) {
                textFields.push(obj);
            }
        } else if (Array.isArray(obj)) {
            for (let i = 0; i < Math.min(obj.length, 100); i++) {
                extractTextFields(obj[i], maxDepth, currentDepth + 1);
            }
        } else if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            for (let i = 0; i < Math.min(keys.length, 50); i++) {
                const key = keys[i];
                extractTextFields(obj[key], maxDepth, currentDepth + 1);
            }
        }
    }

    try {
        extractTextFields(parsedData);
        // Combine text fields
        const extractedText = textFields.slice(0, 100).join('\n\n');

        return {
            success: true,
            data: parsedData,
            extractedText,
            metadata: {
                parser,
                originalSize,
                textFieldsCount: textFields.length,
                processingTime: Date.now() - startTime
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            metadata: {, parser: 'native',
                originalSize,
                textFieldsCount: 0,
                processingTime: Date.now() - startTime
            }
        };
    }
}

/**
 * Streaming JSON parser for very large files
 * Processes JSON in chunks to avoid memory issues
 */
export async function parseJsonStream(
    jsonString: string,
    chunkSize = 1024 * 1024 // 1MB chunks
): Promise<any> {
    try {
        const chunks: string[] = [];
        const extractedTexts: string[] = [];

        // Split into chunks
        for (let i = 0; i < jsonString.length; i += chunkSize) {
            chunks.push(jsonString.slice(i, i + chunkSize));
        }

        // Process each chunk
        for (const chunk of chunks) {
            try {
                // Naive line-based processing for streaming stub
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            const texts = extractTextFromObject(parsed);
                            extractedTexts.push(...texts);
                        } catch {
                            // Skip invalid JSON lines
                        }
                    }
                }
            } catch (error) {
                console.warn('Error processing chunk: ', error);
            }
        }

        return {
            success: true,
            extractedTexts: extractedTexts.slice(0, 1000), // Limit results
            totalChunks: chunks.length
        };
    } catch (error) {
        return {
            success: false,
            extractedTexts: [],
            totalChunks: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function extractTextFromObject(obj: any): string[] {
    const texts: string[] = [];
    function walk(value: any, depth = 0): void {
        if (depth > 5) return;
        if (typeof value === 'string' && value.length > 10) {
            texts.push(value);
        } else if (Array.isArray(value)) {
            value.slice(0, 20).forEach(item => walk(item, depth + 1));
        } else if (value && typeof value === 'object') {
            Object.values(value).slice(0, 20).forEach(item => walk(item, depth + 1));
        }
    }
    walk(obj);
    return texts;
}

// Export compat alias
export const parseJsonWithSimd = parseLargeJsonWithSimd;
