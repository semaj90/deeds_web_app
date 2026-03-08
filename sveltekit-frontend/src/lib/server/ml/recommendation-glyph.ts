/**
 * Recommendation Glyph Encoder
 * Encodes recommendation data into NES-style 10-byte glyph format
 * for efficient transport + rendering in RetroRecommendationModal
 *
 * Glyph format (10 bytes):
 *   [0]     topicId       (0-14, 4 bits) + confidence bucket (4 bits)
 *   [1]     vectorScore   (0-255, quantized from 0.0-1.0)
 *   [2]     tagScore      (0-255, quantized)
 *   [3]     topicScore    (0-255, quantized)
 *   [4]     centralityScore (0-255, quantized)
 *   [5]     profileScore  (0-255, quantized)
 *   [6]     finalScore    (0-255, quantized composite)
 *   [7-8]   documentIdHash (16-bit hash for lookup)
 *   [9]     flags         (bit field: hasExplanation, isSaved, isNew, etc.)
 *
 * Usage:
 *   const glyphs = encodeRecommendations(rankedDocs);
 *   const decoded = decodeRecommendationGlyph(glyphs[0]);
 *   const stream = encodeRecommendationsToStream(rankedDocs);
 */

import type { RankedDocument } from './multi-modal-ranker.js';

export interface RecommendationGlyph {
	bytes: Uint8Array; // 10-byte encoded glyph
	documentId: string; // Original document ID for lookup
	topicId: number; // Cluster assignment
	chrRomBank: number; // CHR-ROM bank for NES rendering
}

export interface DecodedGlyph {
	topicId: number;
	confidenceBucket: number; // 0=marginal, 1=low, 2=medium, 3=high
	vectorScore: number;
	tagScore: number;
	topicScore: number;
	centralityScore: number;
	profileScore: number;
	finalScore: number;
	documentIdHash: number;
	flags: {
		hasExplanation: boolean;
		isSaved: boolean;
		isNew: boolean;
		isHighConfidence: boolean;
	};
}

export interface ValidGlyphResult extends DecodedGlyph {
	valid: true;
}

export interface GlyphDecodeError {
	valid: false;
	error: string;
}

export type GlyphDecodeResult = ValidGlyphResult | GlyphDecodeError;

/**
 * Quantize a float [0, 1] to a byte [0, 255]
 */
function quantizeScore(score: number): number {
	return Math.min(255, Math.max(0, Math.round(score * 255)));
}

/**
 * Dequantize a byte [0, 255] back to a float [0, 1]
 */
function dequantizeScore(byte: number): number {
	return byte / 255;
}

/**
 * Compute confidence bucket from score
 */
function confidenceBucket(score: number): number {
	if (score >= 0.85) return 3; // high
	if (score >= 0.70) return 2; // medium
	if (score >= 0.50) return 1; // low
	return 0; // marginal
}

/**
 * Hash a document ID to 16 bits for compact encoding
 */
function hashDocumentId(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		const char = id.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash) & 0xffff;
}

/**
 * Map topic ID (0-14) to CHR-ROM bank assignment
 * Each topic gets a unique NES pattern bank for themed rendering
 */
function topicToChrRomBank(topicId: number): number {
	// 4 banks per topic group (legal, evidence, procedural, analytical)
	const bankGroups = [
		0, 0, 0, 0, // Topics 0-3: Legal statutes bank
		1, 1, 1, 1, // Topics 4-7: Evidence documents bank
		2, 2, 2, // Topics 8-10: Procedural bank
		3, 3, 3, 3 // Topics 11-14: Analytical bank
	];
	return bankGroups[topicId] ?? 0;
}

/**
 * Encode a ranked document into a 10-byte NES glyph
 */
export function encodeRecommendationGlyph(
	doc: RankedDocument,
	topicId: number = 0
): RecommendationGlyph {
	const signals = doc.signals;
	const bytes = new Uint8Array(10);

	// Byte 0: topicId (high 4 bits) + confidence bucket (low 4 bits)
	bytes[0] = ((topicId & 0x0f) << 4) | (confidenceBucket(doc.score) & 0x0f);

	// Bytes 1-5: Individual signal scores (quantized 0-255)
	bytes[1] = quantizeScore(signals.vectorSimilarity);
	bytes[2] = quantizeScore(signals.tagOverlap);
	bytes[3] = quantizeScore(signals.topicAffinity);
	bytes[4] = quantizeScore(signals.graphCentrality);
	bytes[5] = quantizeScore(signals.profileMatch);

	// Byte 6: Final composite score
	bytes[6] = quantizeScore(doc.score);

	// Bytes 7-8: Document ID hash (16-bit)
	const idHash = hashDocumentId(doc.documentId);
	bytes[7] = (idHash >> 8) & 0xff;
	bytes[8] = idHash & 0xff;

	// Byte 9: Flags
	let flags = 0;
	if (doc.explanationTokens.length > 0) flags |= 0x01; // hasExplanation
	if (doc.score >= 0.85) flags |= 0x08; // isHighConfidence
	bytes[9] = flags;

	return {
		bytes,
		documentId: doc.documentId,
		topicId,
		chrRomBank: topicToChrRomBank(topicId)
	};
}

/**
 * Decode a 10-byte glyph back to readable recommendation data.
 * Returns raw DecodedGlyph (legacy API, no validation).
 */
export function decodeRecommendationGlyph(bytes: Uint8Array): DecodedGlyph {
	return {
		topicId: (bytes[0] >> 4) & 0x0f,
		confidenceBucket: bytes[0] & 0x0f,
		vectorScore: dequantizeScore(bytes[1]),
		tagScore: dequantizeScore(bytes[2]),
		topicScore: dequantizeScore(bytes[3]),
		centralityScore: dequantizeScore(bytes[4]),
		profileScore: dequantizeScore(bytes[5]),
		finalScore: dequantizeScore(bytes[6]),
		documentIdHash: (bytes[7] << 8) | bytes[8],
		flags: {
			hasExplanation: !!(bytes[9] & 0x01),
			isSaved: !!(bytes[9] & 0x02),
			isNew: !!(bytes[9] & 0x04),
			isHighConfidence: !!(bytes[9] & 0x08)
		}
	};
}

/**
 * Validated decode — checks byte array length = 10 and returns descriptive error for malformed input.
 * Non-fatal: returns GlyphDecodeError instead of throwing.
 */
export function safeDecodeGlyph(bytes: Uint8Array | number[]): GlyphDecodeResult {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

	if (arr.length !== 10) {
		return {
			valid: false,
			error: `Expected 10-byte glyph, got ${arr.length} bytes`
		};
	}

	// Validate topicId range (0-14)
	const topicId = (arr[0] >> 4) & 0x0f;
	if (topicId > 14) {
		return {
			valid: false,
			error: `Invalid topicId ${topicId} (expected 0-14)`
		};
	}

	const decoded = decodeRecommendationGlyph(arr);
	return { ...decoded, valid: true as const };
}

/**
 * Batch encode recommendations into compact glyph array
 * Returns Uint8Array of N * 10 bytes (one glyph per recommendation)
 */
export function encodeRecommendations(
	docs: RankedDocument[],
	topicAssignments?: Map<string, number>
): RecommendationGlyph[] {
	return docs.map((doc) => {
		const topicId = topicAssignments?.get(doc.documentId) ?? 0;
		return encodeRecommendationGlyph(doc, topicId);
	});
}

/**
 * Streaming encode — encodes recommendations into a ReadableStream of glyph bytes.
 * Each chunk is a single 10-byte glyph. Useful for SSE/streaming transport.
 */
export function encodeRecommendationsToStream(
	docs: RankedDocument[],
	topicAssignments?: Map<string, number>
): ReadableStream<Uint8Array> {
	let index = 0;

	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index >= docs.length) {
				controller.close();
				return;
			}

			const doc = docs[index];
			const topicId = topicAssignments?.get(doc.documentId) ?? 0;
			const glyph = encodeRecommendationGlyph(doc, topicId);
			controller.enqueue(glyph.bytes);
			index++;
		}
	});
}

/**
 * Convenience one-liner: ranked docs + optional topic map → glyphs + base64.
 * Returns both the glyph array and the base64 transport string.
 */
export function toGlyph(
	rankedDocs: RankedDocument[],
	topicMap?: Map<string, number>
): { glyphs: RecommendationGlyph[]; base64: string } {
	const glyphs = encodeRecommendations(rankedDocs, topicMap);
	const base64 = glyphsToBase64(glyphs);
	return { glyphs, base64 };
}

/**
 * Serialize glyphs to base64 for HTTP transport
 */
export function glyphsToBase64(glyphs: RecommendationGlyph[]): string {
	const totalBytes = glyphs.length * 10;
	const buffer = new Uint8Array(totalBytes);
	for (let i = 0; i < glyphs.length; i++) {
		buffer.set(glyphs[i].bytes, i * 10);
	}

	// Convert to base64 (Node.js Buffer)
	return Buffer.from(buffer).toString('base64');
}

/**
 * Deserialize base64 back to decoded glyphs.
 * Uses safe decode for each glyph — malformed entries are skipped with warning.
 */
export function base64ToGlyphs(base64: string): DecodedGlyph[] {
	const buffer = Buffer.from(base64, 'base64');
	const glyphs: DecodedGlyph[] = [];

	for (let i = 0; i + 10 <= buffer.length; i += 10) {
		const bytes = new Uint8Array(buffer.slice(i, i + 10));
		const result = safeDecodeGlyph(bytes);
		if (result.valid === false) {
			console.warn(
				`[Glyph] Skipping malformed glyph at offset ${i}: ${result.error}`
			);
			continue;
		}
		const { valid: _, ...glyph } = result;
		glyphs.push(glyph);
	}

	return glyphs;
}
