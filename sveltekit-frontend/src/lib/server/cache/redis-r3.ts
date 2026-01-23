import type { EmbeddingResult, QuantizedEmbedding } from '$lib/shared/embedding-types';
import { createClient } from 'redis';

class RedisR3Cache {
	private client: any;

	constructor() {
		this.client = createClient({
			url: process.env?.REDIS_URL ?? 'redis://localhost:6379',
		});

		this.client.on('error', (err: any) => {
			console.error('[redis-r3] connection error:', err);
		});
	}

	async connect() {
		if (!this.client.isOpen) {
			await this.client.connect();
		}
	}

	async disconnect() {
		if (this.client.isOpen) {
			await this.client.disconnect();
		}
	}

	async storeEmbedding(docId: string, embeddingResult: EmbeddingResult): Promise<void> {
		await this.connect();
        const { float32, quant } = embeddingResult;
		const key = `embed:${docId}`;

		// Store Float32 as binary
		await this.client.set(`${key}:float32`, Buffer.from(float32.buffer));

		// Store quantized data
		await this.client.set(`${key}:uint8`, Buffer.from(quant.data.buffer));
		await this.client.set(`${key}:scale`, quant.scale.toString());
		await this.client.set(`${key}:offset`, quant.offset.toString());
		await this.client.set(`${key}:length`, quant.originalLength.toString());

		// Set expiration (24 hours)
		await this.client.expire(key, 86400);
	}

	async getEmbedding(docId: string): Promise<EmbeddingResult | null> {
		await this.connect();

		const key = `embed:${docId}`;

		try {
			// Get Float32
			const float32Buffer = await this.client.get(Buffer.from(`${key}:float32`));
			if (!float32Buffer) return null;

			const float32 = new Float32Array(float32Buffer.buffer);

			// Get quantized data
			const uint8Buffer = await this.client.get(Buffer.from(`${key}:uint8`));
			const scaleStr = await this.client.get(`${key}:scale`);
			const offsetStr = await this.client.get(`${key}:offset`);
			const lengthStr = await this.client.get(`${key}:length`);

			if (!uint8Buffer || !scaleStr || !offsetStr || !lengthStr) return null;

			const quant: QuantizedEmbedding = {
				data: new Uint8Array(uint8Buffer.buffer),
				scale: parseFloat(scaleStr),
				offset: parseFloat(offsetStr),
				originalLength: parseInt(lengthStr),
			};

			return { float32, quant };
		} catch (err) {
			console.error('[redis-r3] get error:', err);
			return null;
		}
	}

	async clearExpired() {
		// Redis handles expiration automatically
		// This method could be used for manual cleanup if needed
	}
}

export const redisR3 = new RedisR3Cache();
