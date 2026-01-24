// Lightweight local text splitter (word-based with overlap)
export interface SplitterOptions {
    chunkSize?: number; // Approx words per chunk (default 350)
    overlap?: number; // Word overlap between chunks (default 40)
    minChunkSize?: number; // Minimum words after trimming (default 25)
}

export interface TextChunk {
    index: number;
    text: string;
    startWord: number;
    endWord: number;
    tokenEstimate: number; // Rough heuristic (words * 1.3)
}

export function splitText(raw: string, opts: SplitterOptions = {}): TextChunk[] {
    const { chunkSize = 350, overlap = 40, minChunkSize = 25 } = opts;

    if (!raw || !raw.trim()) return [];

    const text = raw.replace(/\s+/g, ' ').trim();
    const words = text.split(' ');
    const chunks: TextChunk[] = [];

    let idx = 0;
    for (let start = 0; start < words.length; start += chunkSize - overlap) {
        const slice = words.slice(start, start + chunkSize);
        if (slice.length < minChunkSize && chunks.length > 0) break; // Don't create tiny tail chunks if strictly enforced, but here sticking to original logic roughly

        const chunkText = slice.join(' ').trim();
        if (chunkText.length === 0) continue;

        chunks.push({
            index: idx++,
            text: chunkText,
            startWord: start,
            endWord: start + slice.length - 1,
            tokenEstimate: Math.round(slice.length * 1.3)
        });
    }

    return chunks;
}
