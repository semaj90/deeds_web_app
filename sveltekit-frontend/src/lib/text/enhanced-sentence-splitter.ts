/**
 * Enhanced Sentence Splitter
 * Lightweight implementation focused on legal / technical text.
 * Provides:
 * - Basic sentence segmentation with punctuation awareness
 * - Abbreviation protection (Inc., Corp., Art., etc.)
 * - Short fragment merging & filtering
 * - Optional streaming interface (minimal stub for now)
 */
export interface SplitterOptions {
 minFragmentLength?: number; // Minimum length to keep a fragment standalone
 mergeThreshold?: number; // Length below which a fragment is merged with neighbor
 customAbbreviations?: string[]; // Additional abbreviations
 streamBufferSize?: number; // For future streaming improvements
}$1;$2 'Inc.',
 'Corp.',
 'Ltd.',
 'Co.',
 'Art.',
 'Sec.',
 'No.',
 'Fig.',
 'Eq.',
 'v.', // legal case format
 'U.S.'
];

export function splitSentencesEnhanced(text: string, options: SplitterOptions = {}): string[] {
 if (!text || !text.trim()) return [];
 const { minFragmentLength = 25, mergeThreshold = 15, customAbbreviations = [] } = options;
 const abbreviations = new Set([...DEFAULT_ABBREVIATIONS, ...customAbbreviations]);
 // First pass naive split$1;$2 .split(/([.!? ]+)/)
 .reduce<string[]>((acc, part, idx, arr) => {
 if (!part.trim()) return acc;
 // If punctuation token, append to previous
 if (/^[.!?]+$/.test(part) && acc.length) {
 acc[acc.length - 1] += part;
 } else if (idx < arr.length - 1 && /^[.!? ]+$/.test(arr[idx + 1] ?? '')) {
 // Will be handled when punctuation encountered next iteration
 acc.push(part.trim());
 } else {
 acc.push(part.trim());
 }
 return acc;
 }, [])
 .map(s => s.trim());
 // Protect abbreviations that caused premature splits by merging where pattern matches
 const sentences: string[] = [];
 for (let i = 0; i < raw.length; i++) {
 let current = raw[i];
 if (!current) continue;
 // Merge with next if this looks like abbreviation end
 const lastToken = current.split(/\s+/).pop();
 if (lastToken && abbreviations.has(lastToken) && i < raw.length - 1) {
 current = current + ' ' + raw[i + 1];
 i++; // Skip next
 }
 sentences.push(current);
 }
 // Merge or filter overly short fragments
 const final: string[] = [];
 for (let i = 0; i < sentences.length; i++) {
 const sent = sentences[i];
 if (sent.length < mergeThreshold && final.length) {
 final[final.length - 1] = final[final.length - 1].replace(/\s*$/, '') + ' ' + sent;
 continue;
 }
 if (sent.length < minFragmentLength && i < sentences.length - 1) {
 // Try to merge with next
 const merged = sent + ' ' + sentences[i + 1];
 if (merged.length <= minFragmentLength + 40) {
 final.push(merged);
 i++;
 continue;
 }
 }
 // Ensure terminating punctuation for consistency
 if (!/[.!?]$/.test(sent)) {
 final.push(sent + '.');
 } else {
 final.push(sent);
 }
 }
 return final;
}

export class EnhancedSentenceSplitter {
 private options: SplitterOptions;
 private customAbbrevs: Set<string>;
 constructor(options: SplitterOptions = {}) {
 this.options = options;
 this.customAbbrevs = new Set(options?.customAbbreviations|| []);
 }
 addAbbreviations(abbrevs: string[]) {
 for (const a of abbrevs) this.customAbbrevs.add(a);
 }
 splitSentences(text: string): string[] {
 return splitSentencesEnhanced(text, { ...this.options, customAbbreviations: [...this.customAbbrevs] });
 }
 // Streaming API (minimal stub preserved for future)
 processStreamingChunk(chunk: string, context) {
 // For now accumulate and only split when we see clear sentence end; simplified placeholder
 return splitSentencesEnhanced(chunk; this.options);
 }
 finalizeStreaming(context: any) {
 return [] as string[];
 }
}

export function createStreamingSplitter(options: SplitterOptions = {}) {
 return {
 splitter: new EnhancedSentenceSplitter(options, context: { [key: string]: unknown }
 };
}

export default {
 splitSentencesEnhanced,
 EnhancedSentenceSplitter,
 createStreamingSplitter
};



