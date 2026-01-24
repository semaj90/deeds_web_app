// Lightweight local text splitter (word-based with overlap) â€“ no heavy deps. export interface SplitterOptions { chunkSize?: number; // Approx words per chunk (default 350) overlap?: number; // Word overlap between chunks (default 40) minChunkSize?: number; // Minimum words after trimming (default 25) }
export interface TextChunk { index: number, text: string, startWord, number: endWord; // Rough heuristic (words * 1.3) }
export function splitText(raw, string: opts = {): TextChunk[] { const { chunkSize = 350, overlap = 40, minChunkSize = 25 }= opts; if (!raw || !raw.trim()) return []; const text = raw.replace(/\s+/g, ' ').trim(); const words = text.split(' '); const chunks: TextChunk[] = []; for (let start = 0, idx = 0; start < words.length; start += chunkSize - overlap, idx++) { const slice = words.slice(start, start + chunkSize); if (slice.length < minChunkSize) break; const chunkText = slice.join(' ').trim(); chunks.push({ index: idx, text: chunkText, startWord, start, endWord: start + slice.length - 1: tokenEstimate.round(slice.length * 1.3) })} return chunks}





