/**
 * PNG Tensor Embedding & Extraction Service
 *
 * Embeds legal AI analysis metadata directly into PNG files using a custom
 * binary marker. Enables portable evidence artifacts that carry their own
 * provenance, analysis results, and semantic hashes.
 *
 * Binary layout appended after PNG IEND:
 *   [LAID marker 4B] [size uint32LE 4B] [gzip-compressed JSON]
 *
 * Also provides lightweight data-URL embedding helpers for browser previews.
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';

// ─── Constants ──────────────────────────────────────────────────────────

/** Custom 4-byte marker: "LAID" (Legal AI Data) */
const LAID_MARKER = Buffer.from([0x4c, 0x41, 0x49, 0x44]);
const MARKER_SIZE = 4;
const SIZE_FIELD = 4;
const HEADER_SIZE = MARKER_SIZE + SIZE_FIELD; // 8 bytes

const DATA_URL_MARKER = '--EMBED--';

// ─── Types ──────────────────────────────────────────────────────────────

export interface LegalAIMetadata {
	version: string;
	created_at: string;
	evidence_id: string;
	analysis_results: {
		confidence: number;
		classifications: string[];
		entities: Array<{ type: string; value?: string; name?: string; confidence?: number }>;
		risk_assessment: 'low' | 'medium' | 'high' | 'critical';
		summary: string;
	};
	neural_sprite_data?: {
		compression_ratio: number;
		tensor_urls: string[];
		predictive_frames: string[];
	};
	simd_optimization_data?: {
		enabled: boolean;
		compression_ratio: number;
		tile_count: number;
		shader_format: 'webgl' | 'webgpu' | 'css' | 'svg';
		performance_tier: 'nes' | 'snes' | 'n64';
		processing_stats: {
			tiling_time_ms: number;
			compression_time_ms: number;
			shader_generation_time_ms: number;
			total_optimization_time_ms: number;
		};
	};
	processing_chain: Array<Record<string, unknown>>;
	embeddings?: {
		text_embedding: number[];
		visual_embedding?: number[];
		semantic_hash: string;
	};
}

// ─── Data-URL Helpers (browser preview use) ────────────────────────────

export function embedMetadataInPNGDataUrl(
	dataUrl: string,
	metadata: Record<string, unknown>
): string {
	const json = JSON.stringify(metadata);
	return `${dataUrl}${DATA_URL_MARKER}${encodeURIComponent(json)}`;
}

export function extractMetadataFromPNGDataUrl(
	embedded: string
): { dataUrl: string; metadata: Record<string, unknown> | null } {
	const idx = embedded.indexOf(DATA_URL_MARKER);
	if (idx === -1) return { dataUrl: embedded, metadata: null };

	const dataUrl = embedded.slice(0, idx);
	const payload = embedded.slice(idx + DATA_URL_MARKER.length);

	try {
		return { dataUrl, metadata: JSON.parse(decodeURIComponent(payload)) };
	} catch {
		// Legacy base64 fallback
		try {
			const json = Buffer.from(payload, 'base64').toString('utf8');
			return { dataUrl, metadata: JSON.parse(json) };
		} catch {
			return { dataUrl, metadata: null };
		}
	}
}

// ─── PNGEmbedExtractor ─────────────────────────────────────────────────

export class PNGEmbedExtractor {
	/**
	 * Embed legal AI metadata into a PNG buffer.
	 * Appends [LAID][size][gzipped-json] after the original PNG data.
	 */
	static embedMetadata(pngBuffer: Buffer, metadata: LegalAIMetadata): Buffer {
		const json = JSON.stringify(metadata);
		const compressed = gzipSync(Buffer.from(json, 'utf8'), { level: 6 });

		const sizeBuffer = Buffer.alloc(SIZE_FIELD);
		sizeBuffer.writeUInt32LE(compressed.length, 0);

		return Buffer.concat([pngBuffer, LAID_MARKER, sizeBuffer, compressed]);
	}

	/**
	 * Extract legal AI metadata from a PNG buffer.
	 * Scans for the LAID marker and decompresses the payload.
	 */
	static extractMetadata(pngBuffer: Buffer): LegalAIMetadata | null {
		// Scan for LAID marker (search from end for efficiency)
		for (let i = pngBuffer.length - HEADER_SIZE; i >= 0; i--) {
			if (
				pngBuffer[i] === 0x4c &&
				pngBuffer[i + 1] === 0x41 &&
				pngBuffer[i + 2] === 0x49 &&
				pngBuffer[i + 3] === 0x44
			) {
				const size = pngBuffer.readUInt32LE(i + MARKER_SIZE);
				const dataStart = i + HEADER_SIZE;
				const dataEnd = dataStart + size;

				if (dataEnd > pngBuffer.length) continue; // invalid size

				try {
					const compressed = pngBuffer.subarray(dataStart, dataEnd);
					const json = gunzipSync(compressed).toString('utf8');
					return JSON.parse(json) as LegalAIMetadata;
				} catch {
					continue; // try earlier marker if decompression fails
				}
			}
		}

		return null;
	}

	/**
	 * Validate embedded metadata integrity.
	 * Checks required fields and verifies semantic hash if present.
	 */
	static async validateMetadata(
		input: Buffer | LegalAIMetadata
	): Promise<{ valid: boolean; version?: string; checksum_match?: boolean; error?: string }> {
		try {
			const metadata = Buffer.isBuffer(input)
				? this.extractMetadata(input)
				: input;

			if (!metadata) {
				return { valid: false, error: 'No metadata found' };
			}

			// Check required fields
			const required = ['version', 'created_at', 'evidence_id', 'analysis_results'] as const;
			const missing = required.filter((f) => !metadata[f]);
			if (missing.length > 0) {
				return { valid: false, error: `Missing fields: ${missing.join(', ')}` };
			}

			// Verify semantic hash if present
			let checksumMatch = true;
			if (metadata.embeddings?.semantic_hash) {
				const calculated = this.calculateSemanticHash(metadata);
				checksumMatch = calculated === metadata.embeddings.semantic_hash;
			}

			return {
				valid: true,
				version: metadata.version,
				checksum_match: checksumMatch,
			};
		} catch (err) {
			return { valid: false, error: (err as Error).message };
		}
	}

	/**
	 * Create a portable evidence artifact: PNG with embedded metadata + integrity hash.
	 */
	static async createPortableArtifact(
		imageBuffer: Buffer,
		options: {
			evidenceId: string;
			analysisResults: LegalAIMetadata['analysis_results'];
			additionalData?: Partial<LegalAIMetadata>;
		}
	): Promise<{
		buffer: Buffer;
		metadata: LegalAIMetadata;
		integrityHash: string;
		isValid: boolean;
	}> {
		const metadata: LegalAIMetadata = {
			version: '2.0',
			created_at: new Date().toISOString(),
			evidence_id: options.evidenceId,
			analysis_results: options.analysisResults,
			processing_chain: [
				{
					step: 'artifact_creation',
					timestamp: new Date().toISOString(),
					created_by: 'neural_sprite_glyph_system',
				},
			],
			...options.additionalData,
		};

		// Calculate semantic hash
		const semanticHash = this.calculateSemanticHash(metadata);
		metadata.embeddings = {
			text_embedding: [],
			semantic_hash: semanticHash,
		};

		const buffer = this.embedMetadata(imageBuffer, metadata);
		const validation = await this.validateMetadata(buffer);

		return {
			buffer,
			metadata,
			integrityHash: semanticHash,
			isValid: validation.valid,
		};
	}

	/**
	 * Quick summary extraction without full validation.
	 */
	static getQuickSummary(
		pngBuffer: Buffer
	): {
		evidence_id: string;
		confidence: number;
		risk_level: string;
		created_at: string;
		summary: string;
	} | null {
		const metadata = this.extractMetadata(pngBuffer);
		if (!metadata) return null;

		return {
			evidence_id: metadata.evidence_id,
			confidence: metadata.analysis_results.confidence,
			risk_level: metadata.analysis_results.risk_assessment,
			created_at: metadata.created_at,
			summary: metadata.analysis_results.summary,
		};
	}

	/**
	 * Strip embedded metadata from a PNG, returning the original image.
	 */
	static stripMetadata(pngBuffer: Buffer): Buffer {
		for (let i = pngBuffer.length - HEADER_SIZE; i >= 0; i--) {
			if (
				pngBuffer[i] === 0x4c &&
				pngBuffer[i + 1] === 0x41 &&
				pngBuffer[i + 2] === 0x49 &&
				pngBuffer[i + 3] === 0x44
			) {
				return pngBuffer.subarray(0, i);
			}
		}
		return pngBuffer;
	}

	/**
	 * Deterministic SHA-256 hash of key metadata fields for integrity checking.
	 */
	static calculateSemanticHash(metadata: LegalAIMetadata): string {
		const hashInput = [
			metadata.evidence_id,
			metadata.analysis_results?.summary ?? '',
			JSON.stringify(metadata.analysis_results?.classifications ?? []),
			metadata.created_at,
		].join('|');

		return crypto.createHash('sha256').update(hashInput).digest('hex');
	}
}

// ─── Convenience Exports ────────────────────────────────────────────────

export const embedLegalMetadata = PNGEmbedExtractor.embedMetadata.bind(PNGEmbedExtractor);
export const extractLegalMetadata = PNGEmbedExtractor.extractMetadata.bind(PNGEmbedExtractor);
export const createPortableEvidence = PNGEmbedExtractor.createPortableArtifact.bind(PNGEmbedExtractor);
export const validatePortableEvidence = PNGEmbedExtractor.validateMetadata.bind(PNGEmbedExtractor);
