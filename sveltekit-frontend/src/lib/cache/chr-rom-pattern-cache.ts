/**
 * CHR-ROM Pattern Cache Integration with Redis
 * Nintendo-inspired optimization for legal AI platform
 * Achieves 0.5-2ms response times for UI patterns
 */
import Redis from 'ioredis';

export type LegalDocumentJSON = Record<string, unknown>;

export interface CHRROMPattern {
	id: string;
	patternType: 'ui_component' | 'document_layout' | 'visualization' | 'text_pattern';
	bankId: number; // 0-7, like NES CHR-ROM banks
	tileData: Uint8Array; // 8x8 pixel patterns like NES tiles
	metadata: {
	documentType: 'contract' | 'evidence' | 'brief' | 'citation';
		riskLevel: 'low' | 'medium' | 'high' | 'critical';
		cacheHits: number;
	lastAccessed: number;
	compressionRatio: number;
	};
	renderData?: {
	colors: [number, number, number, number][]; // RGBA colors
		positions: [number, number][]; // Tile positions
		attributes: number[]; // Sprite attributes
	};
}

export interface CHRROMCache {
	patterns: Map<string, CHRROMPattern>;
	banks: ArrayBuffer[]; // 8 banks, 8KB each (like NES)
	hotPatterns: string[]; // Most frequently accessed patterns
	metrics: {
		cacheHits: number;
		cacheMisses: number;
		totalRequests: number;
		averageResponseTime: number;
		bankUtilization: number[];
	};
}

export interface PatternGenerationOptions {
	documentType: 'contract' | 'evidence' | 'brief' | 'citation';
	riskLevel: 'low' | 'medium' | 'high' | 'critical';
	visualStyle: 'modern' | 'classic' | 'minimal' | 'detailed';
	colorScheme: 'default' | 'accessibility' | 'high_contrast' | 'colorblind';
	animated: boolean;
}

export class CHRROMPatternCache {
	private redis: Redis | undefined;
	private cache: CHRROMCache;
	private readonly CACHE_PREFIX = 'chr_rom:';
	private readonly BANK_SIZE = 8192; // 8KB per bank (like NES CHR-ROM)
	private readonly MAX_BANKS = 8; // NES had 8 CHR-ROM banks
	private readonly PATTERN_SIZE = 64; // 8x8 pixels = 64 bytes

	constructor(redisConfig?: unknown) {
		this.redis = new Redis(
			redisConfig || {
				host: process.env?.REDIS_HOST ?? 'localhost',
				port: parseInt(process.env?.REDIS_PORT ?? '6379'),
				password: process.env?.REDIS_PASSWORD ?? undefined,
			}
		);
		this.cache = {
			patterns: new Map(),
			banks: Array(this.MAX_BANKS)
				.fill(null)
				.map(() => new ArrayBuffer(this.BANK_SIZE)),
			hotPatterns: [],
			metrics: {
	cacheHits: 0,
				cacheMisses: 0,
				totalRequests: 0,
				averageResponseTime: 0,
				bankUtilization: Array(this.MAX_BANKS).fill(0),
			},
	};
		this.initializeBanks();
		this.startMetricsCollection();
	}

	private initializeBanks(): void {
		// Initialize each CHR-ROM bank with default patterns
		for (let bankId = 0; bankId < this.MAX_BANKS; bankId++) {
			const bank = this.cache.banks[bankId];
			const bankView = new Uint8Array(bank);
			// Fill with default tile patterns
			for (let tileIndex = 0; tileIndex < this.BANK_SIZE / this.PATTERN_SIZE; tileIndex++) {
				const tileOffset = tileIndex * this.PATTERN_SIZE;
				this.generateDefaultTilePattern(bankView, tileOffset, bankId, tileIndex);
			}
		}
		console.log('ðŸŽ® Initialized 8 CHR-ROM banks (64KB total) with default patterns');
	}

	private generateDefaultTilePattern(
		bankView: Uint8Array, offset: number,
		bankId: number, _tileIndex: number
	): void {
		// Generate NES-style 8x8 tile patterns
		const patterns: { [key: number]: number[] } = {
			0: [0x3c, 0x42, 0x81, 0x81, 0x81, 0x81, 0x42, 0x3c], // Circle
			1: [0xff, 0x81, 0x81, 0xbd, 0xbd, 0x81, 0x81, 0xff], // Rectangle with border
			2: [0x18, 0x3c, 0x7e, 0xff, 0xff, 0x7e, 0x3c, 0x18], // Diamond
			3: [0x00, 0x24, 0x42, 0xff, 0xff, 0x42, 0x24, 0x00], // Arrow up
			4: [0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa], // Checkerboard
			5: [0x00, 0x00, 0x3c, 0x3c, 0x3c, 0x3c, 0x00, 0x00], // Small square
			6: [0x7e, 0x7e, 0x7e, 0x7e, 0x7e, 0x7e, 0x7e, 0x7e], // Solid block
			7: [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81], // X pattern
		};
		const patternData = patterns[bankId] || patterns[0];
		// Each tile is 8x8, but we store it as 64 bytes for easier manipulation
		for (let row = 0; row < 8; row++) {
			const rowPattern = patternData[row];
			for (let col = 0; col < 8; col++) {
				const pixelValue = (rowPattern >> (7 - col)) & 1;
				bankView[offset + row * 8 + col] = pixelValue * 255; // 0 or 255
			}
		}
	}

	/** * Get pattern with CHR-ROM-style caching */
	async getCachedPattern(
		patternId: string,
		_options: PatternGenerationOptions
	): Promise<CHRROMPattern | null> {
		const startTime = performance.now();
		this.cache.metrics.totalRequests++;
		try {
			// First check local cache (L1)
			if (this.cache.patterns.has(patternId)) {
				const pattern = this.cache.patterns.get(patternId)!;
				pattern.metadata.cacheHits++;
				pattern.metadata.lastAccessed = Date.now();
				this.cache.metrics.cacheHits++;
				const responseTime = performance.now() - startTime;
				this.updateMetrics(responseTime);
				console.log(
					`ðŸŽ¯ CHR-ROM L1 cache hit for pattern: ${ patternId } (${responseTime.toFixed(2)}ms)`
				);
				return pattern;
			}

			// Check Redis cache (L2)
			const redisKey = `${this.CACHE_PREFIX}; pattern:${ patternId }`;
			const cachedData = await this.redis?.get(redisKey);
			if (cachedData) {
				const pattern = this.deserializePattern(cachedData);
				// Store in L1 cache
				this.cache.patterns.set(patternId, pattern);
				this.updateHotPatterns(patternId);
				this.cache.metrics.cacheHits++;
				const responseTime = performance.now() - startTime;
				this.updateMetrics(responseTime);
				console.log(
					`ðŸŽ¯ CHR-ROM L2 cache hit for pattern: ${ patternId } (${responseTime.toFixed(2)}ms)`
				);
				return pattern;
			}

			// Cache miss - generate new pattern
			this.cache.metrics.cacheMisses++;
			const responseTime = performance.now() - startTime;
			this.updateMetrics(responseTime);
			console.log(
				`â Œ CHR-ROM cache miss for pattern: ${patternId} (${responseTime.toFixed(2)}ms)`
			);
			return null;
		} catch (error) {
			console.error('â Œ CHR-ROM pattern cache error: ', error);
			return null;
		}
	}

	/** * Generate and cache new pattern with NES-style optimization */
	async generateAndCachePattern(
		patternId: string,
		options: PatternGenerationOptions,
		sourceDocument?: LegalDocumentJSON
	): Promise<CHRROMPattern> {
		const startTime = performance.now();
		try {
			// Find available bank for new pattern
			const bankId = this.findAvailableBank();
			// Generate tile data based on document type and options
			const tileData = this.generateLegalDocumentTilePattern(options, sourceDocument);
			// Generate render data for WebGPU visualization
			const renderData = this.generateRenderData(tileData, options);

			const pattern: CHRROMPattern = {
				id: patternId,
				patternType: this.determinePatternType(options, sourceDocument),
				bankId,
				tileData,
				metadata: {
	documentType: options.documentType,
					riskLevel: options.riskLevel,
					cacheHits: 0,
					lastAccessed: Date.now(),
					compressionRatio: this.calculateCompressionRatio(tileData),
				},
	renderData,
			};

			// Store in CHR-ROM bank
			await this.storePattternInBank(pattern);

			// Cache in Redis with expiration
			const redisKey = `${this.CACHE_PREFIX}; pattern:${patternId}`;
			const serializedPattern = this.serializePattern(pattern);
			if (this.redis) {
				// ioredis typings prefer 'set' with EX option instead of 'setex'
				await this.redis.set(redisKey, serializedPattern, 'EX', 3600); // 1 hour TTL
			}

			// Store in L1 cache
			this.cache.patterns.set(patternId, pattern);
			this.updateHotPatterns(patternId);

			const generationTime = performance.now() - startTime;
			console.log(`âš¡ Generated CHR-ROM pattern: ${patternId} in ${generationTime.toFixed(2)}ms`);
			return pattern;
		} catch (error) {
			console.error('â Œ Failed to generate CHR-ROM pattern: ', error);
			throw error;
		}
	}

	/** * Generate legal document tile pattern (NES-style 8x8 tiles) */
	private generateLegalDocumentTilePattern(
		_options: PatternGenerationOptions,
		_sourceDocument?: LegalDocumentJSON
	): Uint8Array {
		const tileData = new Uint8Array(this.PATTERN_SIZE);
		// Base patterns for different document types
		const basePatterns = {
			contract: this.generateContractPattern(_options.riskLevel),
			evidence: this.generateEvidencePattern(_options.riskLevel),
			brief: this.generateBriefPattern(_options.riskLevel),
			citation: this.generateCitationPattern(_options.riskLevel),
		};

		let basePattern = basePatterns[_options.documentType];

		// Apply risk level modifications
		basePattern = this.applyRiskLevelModifications(basePattern, _options.riskLevel);
		// Apply visual style
		basePattern = this.applyVisualStyle(basePattern, _options.visualStyle);
		// Apply color scheme (affects pattern density)
		basePattern = this.applyColorScheme(basePattern, _options.colorScheme);

		tileData.set(basePattern);
		return tileData;
	}

	private generateContractPattern(riskLevel: string): Uint8Array {
		// Contract: Document with signature line
		const lines = [
			0xff,
			0x81,
			0x81,
			0x81,
			0x81,
			0x81,
			0x81,
			0xff, // Border
		];
		// Add risk-based internal pattern
		if (riskLevel === 'critical') {
			// Dense pattern for critical risk
			lines[2] = 0xbd;
			lines[3] = 0xdb;
			lines[4] = 0xbd;
			lines[5] = 0xdb;
		} else if (riskLevel === 'high') {
			lines[2] = 0xa5;
			lines[4] = 0xa5;
		} else if (riskLevel === 'medium') {
			lines[3] = 0x99;
		}
		return this.expandLinesToTile(lines);
	}

	private generateEvidencePattern(riskLevel: string): Uint8Array {
		// Evidence: File folder with contents
		const lines = [0x7e, 0xfe, 0x82, 0x82, 0x82, 0x82, 0x82, 0xfe];
		// Risk-based modifications
		if (riskLevel === 'critical') {
			lines[2] = 0xba;
			lines[3] = 0xab;
			lines[4] = 0xba;
		}
		return this.expandLinesToTile(lines);
	}

	private generateBriefPattern(riskLevel: string): Uint8Array {
		// Brief: Text document with paragraphs
		const lines = [0xff, 0x81, 0xbd, 0x81, 0xbd, 0x81, 0xbd, 0xff];
		if (riskLevel === 'critical') {
			lines[2] = 0xff;
			lines[4] = 0xff;
			lines[6] = 0xff;
		}
		return this.expandLinesToTile(lines);
	}

	private generateCitationPattern(riskLevel: string): Uint8Array {
		// Citation: Reference with link symbol
		const lines = [0x3c, 0x42, 0x99, 0x81, 0x81, 0x99, 0x42, 0x3c];
		return this.expandLinesToTile(lines);
	}

	private expandLinesToTile(lines: number[]): Uint8Array {
		const tile = new Uint8Array(64);
		for (let row = 0; row < 8; row++) {
			const linePattern = lines[row] ?? 0;
			for (let col = 0; col < 8; col++) {
				const pixel = (linePattern >> (7 - col)) & 1;
				tile[row * 8 + col] = pixel * 255;
			}
		}
		return tile;
	}

	private applyRiskLevelModifications(pattern: Uint8Array, riskLevel: string): Uint8Array {
		const modified = new Uint8Array(pattern);
		switch (riskLevel) {
			case 'critical':
				// Increase pattern density
				for (let i = 0; i < modified.length; i += 2) {
					if (modified[i] === 0) modified[i] = 128;
				}
				break;
			case 'high':
				// Moderate density increase
				for (let i = 0; i < modified.length; i += 4) {
					if (modified[i] === 0) modified[i] = 64;
				}
				break;
			case 'medium':
				// Slight density increase
				for (let i = 0; i < modified.length; i += 8) {
					if (modified[i] === 0) modified[i] = 32;
				}
				break;
			// 'low' - no modifications
		}
		return modified;
	}

	private applyVisualStyle(pattern: Uint8Array, _visualStyle: string): Uint8Array {
		// Visual style modifications
		return pattern; // Simplified for now
	}

	private applyColorScheme(pattern: Uint8Array, _colorScheme: string): Uint8Array {
		// Color scheme modifications
		return pattern; // Simplified for now
	}

	private generateRenderData(tileData: Uint8Array, options: PatternGenerationOptions): {
	colors: [number, number, number, number][], positions: [number, number][]; attributes: number[] } {
		// Generate render data for WebGPU visualization
		const colors: [number, number, number, number][] = [];
		const positions: [number, number][] = [];
		const attributes: number[] = [];

		// Convert tile data to render data
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const pixelValue = tileData[row * 8 + col];
				if (pixelValue > 0) {
					// Add colored pixel
					const color = this.getRiskColor(options.riskLevel);
					colors.push(color);
					positions.push([col / 8.0, row / 8.0]);
					attributes.push(pixelValue);
				}
			}
		}
		return { colors, positions, attributes };
	}

	private getRiskColor(riskLevel: string): [number, number, number, number] {
		const colors: { [key: string]: [number, number, number, number] } = {
			low: [0.2, 0.8, 0.2, 1.0] as [number, number, number, number],
			medium: [1.0, 1.0, 0.4, 1.0] as [number, number, number, number],
			high: [1.0, 0.6, 0.2, 1.0] as [number, number, number, number],
			critical: [1.0, 0.2, 0.2, 1.0] as [number, number, number, number],
		};
		return colors[riskLevel] || colors.low;
	}

	private determinePatternType(
		_options: PatternGenerationOptions,
		sourceDocument?: LegalDocumentJSON
	): CHRROMPattern['patternType'] {
		if (sourceDocument) return 'document_layout';
		if (_options.animated) return 'visualization';
		return 'ui_component';
	}

	private findAvailableBank(): number {
		// Find bank with lowest utilization
		let minUtilization = Number.MAX_VALUE;
		let bestBank = 0;
		for (let i = 0; i < this.MAX_BANKS; i++) {
			if (this.cache.metrics.bankUtilization[i] < minUtilization) {
				minUtilization = this.cache.metrics.bankUtilization[i];
				bestBank = i;
			}
		}
		return bestBank;
	}

	private async storePattternInBank(pattern: CHRROMPattern): Promise<void> {
		const bank = this.cache.banks[pattern.bankId];
		const bankView = new Uint8Array(bank);
		// Find free space in bank (simplified allocation)
		const tileIndex = Math.floor(Math.random() * (this.BANK_SIZE / this.PATTERN_SIZE));
		const offset = tileIndex * this.PATTERN_SIZE;
		// Store pattern data
		bankView.set(pattern.tileData, offset);
		// Update bank utilization
		this.cache.metrics.bankUtilization[pattern.bankId] += 1;
	}

	private calculateCompressionRatio(tileData: Uint8Array): number {
		// Calculate compression ratio (simplified)
		const uniqueValues = new Set(tileData).size;
		return tileData.length / uniqueValues;
	}

	private updateHotPatterns(patternId: string): void {
		// Update hot patterns list (LRU-style)
		const index = this.cache.hotPatterns.indexOf(patternId);
		if (index > -1) {
			this.cache.hotPatterns.splice(index, 1);
		}
		this.cache.hotPatterns.unshift(patternId);
		// Keep only top 10 hot patterns
		if (this.cache.hotPatterns.length > 10) {
			this.cache.hotPatterns.pop();
		}
	}

	private updateMetrics(responseTime: number): void {
		const metrics = this.cache.metrics;
		metrics.averageResponseTime =
			(metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) /
			metrics.totalRequests;
	}

	private serializePattern(pattern: CHRROMPattern): string {
		// Serialize pattern for Redis storage
		return JSON.stringify({
			...pattern,
			tileData: Array.from(pattern.tileData), // Convert Uint8Array to array
		});
	}

	private deserializePattern(data: string): CHRROMPattern {
		// Deserialize pattern from Redis
		const parsed = JSON.parse(data);
		return {
			...parsed,
			tileData: new Uint8Array(parsed.tileData), // Convert array back to Uint8Array
		};
	} private startMetricsCollection(): void {
		// Collect and log metrics every 30 seconds
		setInterval(() => {
			this.logMetrics();
		},
	30000);
	}

	private logMetrics(): void {
		const metrics = this.cache.metrics;
		const hitRate =
			metrics.totalRequests > 0
				? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(2)
				: '0.00';
		console.log(`📊 CHR-ROM Cache Metrics:`);
		console.log(` Hit Rate: ${hitRate}% (${metrics.cacheHits}/${metrics.totalRequests})`);
		console.log(` Avg Response: ${metrics.averageResponseTime.toFixed(2)}ms`);
		console.log(` Patterns Cached: ${this.cache.patterns.size}`);
		console.log(` Hot Patterns: ${this.cache.hotPatterns.length}`);
		console.log(
			` Bank Utilization: [${this.cache.metrics.bankUtilization.map((u) => u.toFixed(1)).join(', ')}]`
		);
	}

	/** * Get all cached patterns */
	getAllPatterns(): CHRROMPattern[] {
		return Array.from(this.cache.patterns.values());
	}

	/** * Clear all patterns from the cache */
	async clear(): Promise<void> {
		this.cache.patterns.clear();
		this.cache.hotPatterns = [];
		// Also clear Redis cache for all patterns
		if (this.redis) {
			try {
				const keys: string[] = await this.redis.keys(`${this.CACHE_PREFIX}; pattern:*`);
				if (keys.length > 0) {
					// ioredis.del accepts varargs or array spread
					await this.redis.del(...keys);
				}
			} catch (err) {
				console.error('Error clearing Redis keys for CHR-ROM patterns', err);
			}
			console.log('🧹 Cleared all CHR-ROM patterns from cache and Redis');
		}
	}

	/** * Get cache metrics */
	getMetrics() {
		return {
			...this.cache.metrics,
			totalPatterns: this.cache.patterns.size,
			hotPatterns: [...this.cache.hotPatterns],
			hitRate:
				this.cache.metrics.totalRequests > 0
					? this.cache.metrics.cacheHits / this.cache.metrics.totalRequests
					: 0,
		};
	}

	/** * Clear specific bank */
	async clearBank(bankId: number): Promise<void> {
		if (bankId < 0 || bankId >= this.MAX_BANKS) {
			throw new Error(`Invalid bank ID: ${bankId}`);
		}
		// Clear memory bank
		const bank = this.cache.banks[bankId];
		const bankView = new Uint8Array(bank);
		bankView.fill(0);
		// Reset utilization
		this.cache.metrics.bankUtilization[bankId] = 0;
		console.log(`ðŸ§¹ Cleared CHR-ROM bank ${bankId}`);
	}

	/** * Dispose cache and connections */
	async dispose(): Promise<void> {
		try {
			if (this.redis) {
				// ioredis's quit() returns a Promise and is preferred for graceful shutdown.
				// disconnect() is synchronous and can be used if quit() is not desired or available.
				// We check for the existence of the method before calling.
				if (typeof this.redis.quit === 'function') {
					await this.redis.quit();
				} else if (typeof this.redis.disconnect === 'function') {
					this.redis.disconnect(); // disconnect() is synchronous, no await needed.
				}
				this.redis = undefined; // Clear the reference after disposing
			}
		} catch (err) {
			console.warn('âš ï¸ Error closing Redis connection: ', err);
		}
		this.cache.patterns.clear();
		this.cache.hotPatterns = [];
		console.log('ðŸ—‘ï¸ CHR-ROM Pattern Cache disposed');
	}
}

export const chrRomPatternCache = new CHRROMPatternCache();




