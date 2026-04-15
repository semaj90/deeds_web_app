/**
 * Glyph Diffusion Service
 *
 * Tensor-cached diffusion service for legal evidence visualization.
 * Implements GPU tensor caching with MinIO persistence, HMAC integrity
 * verification, and PNG embedding for portable evidence artifacts.
 *
 * Pipeline:
 *   1. Load/generate prompt embedding tensor
 *   2. Load/generate style conditioning tensor
 *   3. Run diffusion generation (currently mock — plug real model later)
 *   4. Neural Sprite compression (optional)
 *   5. PNG tensor embedding for distribution
 *   6. Store in MinIO + index in PostgreSQL
 */

import crypto from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────

/** Methods used by glyph-diffusion-service that are not on the public MinIOService API */
interface MinIOExtended {
	getFileBuffer(bucket: string, key: string): Promise<Buffer>;
	uploadBuffer(data: Buffer, key: string, opts?: { bucket?: string; contentType?: string }): Promise<void>;
	getFileUrl(bucket: string, key: string, ttl?: number): Promise<string>;
	deleteFile(bucket: string, key: string): Promise<void>;
}

export interface TensorManifest {
	id: string;
	model: string;
	input_hash: string;
	shape: number[];
	dtype: 'fp16' | 'fp32' | 'int8';
	layout: 'NCHW' | 'NHWC';
	provenance: {
		hmac: string;
		signer: string;
		created_at: string;
	};
	compression: 'none' | 'zlib' | 'brotli';
	metadata: Record<string, unknown>;
}

export interface GlyphRequest {
	evidence_id: number;
	prompt: string;
	style: 'detective' | 'corporate' | 'forensic' | 'legal';
	dimensions: [number, number];
	seed?: number;
	conditioning_tensors?: string[];
	neural_sprite_config?: {
		enable_compression: boolean;
		predictive_frames: number;
		ui_layout_compression?: boolean;
		target_compression_ratio?: number;
	};
}

export interface GlyphResponse {
	success: boolean;
	glyph_url: string;
	tensor_ids: string[];
	generation_time_ms: number;
	cache_hits: number;
	preview_with_tensors?: string;
	neural_sprite_results?: {
		compressed_tensor_url?: string;
		compression_ratio?: number;
		predictive_frames?: string[];
		ui_layout_metrics?: {
			originalSize: number;
			compressedSize: number;
			compressionRatio: number;
			accuracy: number;
		};
	};
}

interface CachedTensor {
	data: Buffer;
	manifest: TensorManifest;
	last_access: number;
}

// ─── GPU Tensor Cache ───────────────────────────────────────────────────

class GPUTensorCache {
	private cache = new Map<string, CachedTensor>();
	private maxCacheSize = 2 * 1024 * 1024 * 1024; // 2GB
	private currentSize = 0;

	async get(tensorId: string): Promise<{ data: Buffer; manifest: TensorManifest } | null> {
		const cached = this.cache.get(tensorId);
		if (cached) {
			cached.last_access = Date.now();
			return { data: cached.data, manifest: cached.manifest };
		}

		// Try loading from MinIO
		try {
			const { minioService } = await import('$lib/server/storage/minio-service.js');
			const [manifestData, tensorData] = await Promise.all([
				minioService.getFileBuffer('tensor-cache', `${tensorId}.meta.json`),
				minioService.getFileBuffer('tensor-cache', `${tensorId}.tensor`),
			]);

			const manifest = JSON.parse(manifestData.toString()) as TensorManifest;

			// Verify HMAC integrity
			const secret = process.env.TENSOR_SECRET ?? 'dev-secret';
			const expectedHmac = crypto.createHmac('sha256', secret).update(tensorData).digest('hex');
			if (manifest.provenance.hmac !== expectedHmac) {
				throw new Error(`Tensor HMAC verification failed for ${tensorId}`);
			}

			// Cache in memory if space available
			if (tensorData.length < this.maxCacheSize - this.currentSize) {
				this.cache.set(tensorId, {
					data: tensorData,
					manifest,
					last_access: Date.now(),
				});
				this.currentSize += tensorData.length;
				this.evictIfNeeded();
			}

			return { data: tensorData, manifest };
		} catch {
			return null;
		}
	}

	async store(tensorId: string, data: Buffer, manifest: TensorManifest): Promise<void> {
		// Generate HMAC for integrity
		const secret = process.env.TENSOR_SECRET ?? 'dev-secret';
		manifest.provenance.hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
		manifest.provenance.created_at = new Date().toISOString();

		// Store in MinIO for durability
		try {
			const { minioService } = await import('$lib/server/storage/minio-service.js');
			await Promise.all([
				minioService.uploadBuffer(
					Buffer.from(JSON.stringify(manifest, null, 2)),
					`${tensorId}.meta.json`,
					{ bucket: 'tensor-cache', contentType: 'application/json' }
				),
				minioService.uploadBuffer(data, `${tensorId}.tensor`, {
					bucket: 'tensor-cache',
					contentType: 'application/octet-stream',
				}),
			]);
		} catch (err) {
			console.warn(`MinIO tensor store failed for ${tensorId}:`, err);
		}

		// Cache in memory
		if (data.length < this.maxCacheSize - this.currentSize) {
			this.cache.set(tensorId, { data, manifest, last_access: Date.now() });
			this.currentSize += data.length;
			this.evictIfNeeded();
		}

		// Index in PostgreSQL for searchability
		try {
			const { db } = await import('$lib/server/db/client');
			const { sql } = await import('drizzle-orm');
			await db.execute(sql`
				INSERT INTO tensor_cache (id, manifest, created_at)
				VALUES (${tensorId}, ${JSON.stringify(manifest)}::jsonb, NOW())
				ON CONFLICT (id) DO UPDATE SET
					manifest = ${JSON.stringify(manifest)}::jsonb,
					updated_at = NOW()
			`);
		} catch {
			// Non-fatal — table may not exist yet
		}
	}

	private evictIfNeeded(): void {
		while (this.currentSize > this.maxCacheSize * 0.8) {
			let oldestKey = '';
			let oldestTime = Date.now();
			for (const [key, value] of this.cache.entries()) {
				if (value.last_access < oldestTime) {
					oldestTime = value.last_access;
					oldestKey = key;
				}
			}
			if (!oldestKey) break;
			const evicted = this.cache.get(oldestKey);
			if (evicted) this.currentSize -= evicted.data.length;
			this.cache.delete(oldestKey);
		}
	}
}

// ─── PNG Tensor Embedder ────────────────────────────────────────────────

class PNGTensorEmbedder {
	/**
	 * Embed tensor references into PNG as metadata.
	 * In production, would use proper PNG chunk insertion (custom 'yoRH' chunk).
	 * For now, logs metadata and returns the original PNG.
	 */
	static embedTensorsInPNG(
		originalPNG: Buffer,
		tensors: Array<{ id: string; data: Buffer; manifest: TensorManifest }>,
		neuralSpriteData?: GlyphResponse['neural_sprite_results']
	): Buffer {
		const metadata = {
			embedded_tensors: tensors.map((t) => ({
				id: t.id,
				manifest: t.manifest,
				size: t.data.length,
			})),
			neural_sprite: neuralSpriteData
				? {
						enabled: true,
						compressed_tensor_url: neuralSpriteData.compressed_tensor_url,
						compression_ratio: neuralSpriteData.compression_ratio,
						predictive_frames_count: neuralSpriteData.predictive_frames?.length ?? 0,
					}
				: { enabled: false },
			created_at: new Date().toISOString(),
			version: '2.0',
		};

		// Append metadata as JSON comment after PNG IEND
		const metaBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
		return Buffer.concat([originalPNG, metaBuffer]);
	}

	static extractTensorsFromPNG(
		_pngWithTensors: Buffer
	): Array<{ id: string; manifest: TensorManifest }> {
		// Placeholder — would extract 'yoRH' chunks in production
		return [];
	}
}

// ─── Glyph Diffusion Service ────────────────────────────────────────────

export class GlyphDiffusionService {
	private tensorCache = new GPUTensorCache();
	private generationQueue = new Map<string, Promise<GlyphResponse>>();

	/**
	 * Generate legal evidence glyph with tensor caching and dedup.
	 */
	async generateGlyph(request: GlyphRequest): Promise<GlyphResponse> {
		const requestHash = crypto
			.createHash('sha256')
			.update(JSON.stringify(request))
			.digest('hex');

		// Deduplicate in-flight identical requests
		const existing = this.generationQueue.get(requestHash);
		if (existing) return existing;

		const promise = this.performGeneration(request, requestHash);
		this.generationQueue.set(requestHash, promise);

		try {
			return await promise;
		} finally {
			this.generationQueue.delete(requestHash);
		}
	}

	private async performGeneration(
		request: GlyphRequest,
		requestHash: string
	): Promise<GlyphResponse> {
		const startTime = Date.now();
		let cacheHits = 0;
		const tensorIds: string[] = [];

		// 1. Load conditioning tensors if provided
		if (request.conditioning_tensors) {
			for (const tensorId of request.conditioning_tensors) {
				const cached = await this.tensorCache.get(tensorId);
				if (cached) cacheHits++;
			}
		}

		// 2. Generate/cache prompt embedding tensor
		const promptHash = crypto.createHash('md5').update(request.prompt).digest('hex');
		const promptEmbeddingId = `prompt_embedding_${promptHash}`;
		let promptEmbedding = await this.tensorCache.get(promptEmbeddingId);

		if (!promptEmbedding) {
			const embeddingData = this.generateMockEmbedding(request.prompt, 768);
			const manifest: TensorManifest = {
				id: promptEmbeddingId,
				model: 'text-encoder-v1',
				input_hash: crypto.createHash('sha256').update(request.prompt).digest('hex'),
				shape: [768],
				dtype: 'fp16',
				layout: 'NCHW',
				provenance: { hmac: '', signer: 'glyph-diffusion-service', created_at: '' },
				compression: 'none',
				metadata: { prompt: request.prompt, style: request.style },
			};
			await this.tensorCache.store(promptEmbeddingId, embeddingData, manifest);
			promptEmbedding = { data: embeddingData, manifest };
		} else {
			cacheHits++;
		}
		tensorIds.push(promptEmbeddingId);

		// 3. Generate/cache style conditioning tensor
		const styleDimKey = `${request.style}_${request.dimensions.join('x')}`;
		const styleId = `style_${styleDimKey}`;
		let styleConditioning = await this.tensorCache.get(styleId);

		if (!styleConditioning) {
			const styleData = this.generateMockStyleConditioning(request.style, request.dimensions);
			const manifest: TensorManifest = {
				id: styleId,
				model: 'style-encoder-v1',
				input_hash: crypto.createHash('sha256').update(request.style).digest('hex'),
				shape: [request.dimensions[0], request.dimensions[1], 3],
				dtype: 'fp16',
				layout: 'NHWC',
				provenance: { hmac: '', signer: 'glyph-diffusion-service', created_at: '' },
				compression: 'zlib',
				metadata: { style: request.style, dimensions: request.dimensions },
			};
			await this.tensorCache.store(styleId, styleData, manifest);
			styleConditioning = { data: styleData, manifest };
		} else {
			cacheHits++;
		}
		tensorIds.push(styleId);

		// 4. Generate the glyph image (mock diffusion — plug real model here)
		const glyphData = this.generateMockGlyph(request);

		// 5. Store generated glyph in MinIO
		let glyphUrl = `/generated-glyphs/glyph_${requestHash}.png`;
		try {
			const { minioService } = await import('$lib/server/storage/minio-service.js');
				await minioService.uploadBuffer(glyphData, `glyph_${requestHash}.png`, {
					bucket: 'generated-glyphs',
				contentType: 'image/png',
			});
				glyphUrl = await minioService.getFileUrl(
				'generated-glyphs',
				`glyph_${requestHash}.png`,
				3600
			);
		} catch (err) {
			console.warn('MinIO glyph upload failed, using fallback URL:', err);
		}

		// 6. Index generation in PostgreSQL
		try {
			const { db } = await import('$lib/server/db/client');
			const { sql } = await import('drizzle-orm');
			await db.execute(sql`
				INSERT INTO glyph_generations (
					id, evidence_id, prompt, style, dimensions,
					tensor_ids, glyph_url, generation_time_ms, cache_hits, created_at
				) VALUES (
					${requestHash}, ${request.evidence_id}, ${request.prompt},
					${request.style}, ${request.dimensions}::integer[],
					${tensorIds}::text[], ${glyphUrl},
					${Date.now() - startTime}, ${cacheHits}, NOW()
				)
			`);
		} catch {
			// Non-fatal — table may not exist yet
		}

		// 7. Create PNG with embedded tensors for distribution
		let previewWithTensors: string | undefined;
		try {
			const tensorsToEmbed = [
				{ id: promptEmbedding.manifest.id, data: promptEmbedding.data, manifest: promptEmbedding.manifest },
				{ id: styleConditioning.manifest.id, data: styleConditioning.data, manifest: styleConditioning.manifest },
			];
			const embeddedPNG = PNGTensorEmbedder.embedTensorsInPNG(glyphData, tensorsToEmbed);

			const { minioService } = await import('$lib/server/storage/minio-service.js');
			const embeddedFilename = `glyph_${requestHash}_embedded.png`;
				await minioService.uploadBuffer(embeddedPNG, embeddedFilename, {
				bucket: 'generated-glyphs',
				contentType: 'image/png',
			});
				previewWithTensors = await minioService.getFileUrl(
				'generated-glyphs',
				embeddedFilename,
				3600
			);
		} catch {
			// Non-fatal
		}

		return {
			success: true,
			glyph_url: glyphUrl,
			tensor_ids: tensorIds,
			generation_time_ms: Date.now() - startTime,
			cache_hits: cacheHits,
			preview_with_tensors: previewWithTensors,
		};
	}

	/**
	 * Search for cached tensors by query.
	 */
	async searchSimilarTensors(limit = 10): Promise<Array<Record<string, unknown>>> {
		try {
			const { db } = await import('$lib/server/db/client');
			const { sql } = await import('drizzle-orm');
			const results = await db.execute(sql`
				SELECT id, manifest, created_at, access_count
				FROM tensor_cache
				WHERE manifest->>'dtype' = 'fp16'
				ORDER BY created_at DESC
				LIMIT ${limit}
			`);
			return results.rows as Array<Record<string, unknown>>;
		} catch {
			return [];
		}
	}

	/**
	 * Cleanup old cached tensors from DB and MinIO.
	 */
	async cleanupTensorCache(
		olderThanDays = 30
	): Promise<{ deleted: number; freed_bytes: number }> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - olderThanDays);

		try {
			const { db } = await import('$lib/server/db/client');
			const { sql } = await import('drizzle-orm');
			const results = await db.execute(sql`
				DELETE FROM tensor_cache
				WHERE created_at < ${cutoff.toISOString()}::timestamptz
				  AND access_count < 5
				RETURNING id
			`);

			let freedBytes = 0;
			const { minioService } = await import('$lib/server/storage/minio-service.js');
			for (const row of results.rows as Array<{ id: string }>) {
				try {
					await minioService.deleteFile('tensor-cache', `${row.id}.tensor`);
					await minioService.deleteFile('tensor-cache', `${row.id}.meta.json`);
					freedBytes += 1024; // Estimate
				} catch {
					// Continue cleanup
				}
			}

			return { deleted: results.rows.length, freed_bytes: freedBytes };
		} catch {
			return { deleted: 0, freed_bytes: 0 };
		}
	}

	// ─── Mock Generators (replace with real model inference) ────────────

	private generateMockEmbedding(text: string, dimensions: number): Buffer {
		const embedding = new Float32Array(dimensions);
		const hash = crypto.createHash('sha256').update(text).digest();
		for (let i = 0; i < dimensions; i++) {
			embedding[i] = (hash[i % hash.length] - 128) / 128.0;
		}
		return Buffer.from(embedding.buffer);
	}

	private generateMockStyleConditioning(
		style: string,
		dimensions: [number, number]
	): Buffer {
		const [width, height] = dimensions;
		const totalSize = width * height * 3;
		const data = new Float32Array(totalSize);
		const seeds: Record<string, number> = {
			detective: 0.1,
			corporate: 0.3,
			forensic: 0.7,
			legal: 0.9,
		};
		const seed = seeds[style] ?? 0.5;
		for (let i = 0; i < totalSize; i++) {
			data[i] = Math.sin(i * seed) * 0.5 + 0.5;
		}
		return Buffer.from(data.buffer);
	}

	private generateMockGlyph(request: GlyphRequest): Buffer {
		const [width, height] = request.dimensions;
		const colors: Record<string, string> = {
			detective: '#2C3E50',
			corporate: '#34495E',
			forensic: '#E74C3C',
			legal: '#8E44AD',
		};
		const color = colors[request.style] ?? '#95A5A6';
		const mockPNG = Buffer.alloc(1024);
		mockPNG.write(`Mock ${width}x${height} ${request.style} glyph - ${color}`);
		return mockPNG;
	}
}

// ─── Singleton Export ───────────────────────────────────────────────────

export const glyphDiffusionService = new GlyphDiffusionService();
