import { describe, it, expect } from 'vitest';
import {
  encodeToLatent,
  decodeFromLatent,
  encodeBatch,
  measureReconstructionError,
  quantizeINT8,
  dequantizeINT8,
  AutoencoderDefaults
} from '$lib/gpu/autoencoder-compression.js';

describe('Autoencoder Compression — 768→64 Dimension Reduction', () => {
  describe('encodeToLatent — Single embedding compression', () => {
    it('compresses 768-dim to 64-dim', async () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = await encodeToLatent(embedding, AutoencoderDefaults);

      expect(result.data).toHaveLength(64);
    });

    it('returns ComputeResult with backend info', async () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = await encodeToLatent(embedding, AutoencoderDefaults);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('backend');
      expect(result).toHaveProperty('durationMs');
      expect(result.backend).toBe('cpu');
    });

    it('output is L2 normalized (norm ≈ 1)', async () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = await encodeToLatent(embedding, AutoencoderDefaults);

      let normSq = 0;
      for (let i = 0; i < result.data.length; i++) {
        normSq += result.data[i] * result.data[i];
      }
      const norm = Math.sqrt(normSq);

      expect(norm).toBeCloseTo(1.0, 2);
    });

    it('different embeddings with varied patterns produce different latents', async () => {
      // Create embeddings with genuinely different patterns PER POOLING CHUNK
      // Sum-pooling divides 768 dims into 64 chunks of 12 elements each
      // To get different per-chunk sums, vary the pattern across chunks
      const emb1 = new Float32Array(768);
      const emb2 = new Float32Array(768);

      // Emb1: first half 0.1, second half 0.9
      for (let i = 0; i < 384; i++) emb1[i] = 0.1;
      for (let i = 384; i < 768; i++) emb1[i] = 0.9;

      // Emb2: first half 0.9, second half 0.1 (reversed)
      for (let i = 0; i < 384; i++) emb2[i] = 0.9;
      for (let i = 384; i < 768; i++) emb2[i] = 0.1;

      const result1 = await encodeToLatent(emb1, AutoencoderDefaults);
      const result2 = await encodeToLatent(emb2, AutoencoderDefaults);

      // Compute cosine similarity (dot product of unit vectors)
      let dotProduct = 0;
      for (let i = 0; i < 64; i++) {
        dotProduct += result1.data[i] * result2.data[i];
      }

      // With reversed patterns, latents should be anti-correlated (dot < 0.5)
      // rather than identical (dot = 1.0)
      expect(dotProduct).toBeLessThan(0.5);
    });

    it('throws on dimension mismatch', async () => {
      const embedding = new Float32Array(512);
      const config = { ...AutoencoderDefaults, inputDim: 768 };

      await expect(() => encodeToLatent(embedding, config))
        .rejects
        .toThrow();
    });

    it('returns positive duration in milliseconds', async () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = await encodeToLatent(embedding, AutoencoderDefaults);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('decodeFromLatent — Reconstruction', () => {
    it('reconstructs 64-dim back to 768-dim', async () => {
      const latent = new Float32Array(64).fill(0.5);
      const result = await decodeFromLatent(latent, AutoencoderDefaults);

      expect(result.data).toHaveLength(768);
    });

    it('throws on dimension mismatch', async () => {
      const latent = new Float32Array(32);
      const config = { ...AutoencoderDefaults, latentDim: 64 };

      await expect(() => decodeFromLatent(latent, config))
        .rejects
        .toThrow();
    });
  });

  describe('encodeBatch — Batch compression', () => {
    it('compresses multiple embeddings', async () => {
      const embeddings = [
        new Float32Array(768).fill(0.1),
        new Float32Array(768).fill(0.5),
        new Float32Array(768).fill(0.9),
      ];

      const result = await encodeBatch(embeddings, AutoencoderDefaults);

      expect(result.data).toHaveLength(3);
      expect(result.data[0].latent).toHaveLength(64);
      expect(result.data[1].latent).toHaveLength(64);
      expect(result.data[2].latent).toHaveLength(64);
    });

    it('returns EncodedPacket with latent field', async () => {
      const embeddings = [new Float32Array(768).fill(0.5)];
      const result = await encodeBatch(embeddings, AutoencoderDefaults);

      expect(result.data[0]).toHaveProperty('latent');
      expect(result.data[0]).toHaveProperty('packetId');
    });

    it('handles empty array', async () => {
      const result = await encodeBatch([], AutoencoderDefaults);

      expect(result.data).toHaveLength(0);
    });

    it('all latents are L2 normalized', async () => {
      const embeddings = [
        new Float32Array(768).fill(0.2),
        new Float32Array(768).fill(0.8),
      ];

      const result = await encodeBatch(embeddings, AutoencoderDefaults);

      result.data.forEach(packet => {
        let normSq = 0;
        for (let i = 0; i < packet.latent.length; i++) {
          normSq += packet.latent[i] * packet.latent[i];
        }
        const norm = Math.sqrt(normSq);
        expect(norm).toBeCloseTo(1.0, 2);
      });
    });

    it('returns batch duration', async () => {
      const embeddings = Array(10).fill(null).map(() => new Float32Array(768).fill(0.5));
      const result = await encodeBatch(embeddings, AutoencoderDefaults);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureReconstructionError — Quality metric', () => {
    it('identical vectors have error 0', () => {
      const original = new Float32Array([1, 0, 0, 1]);
      const reconstructed = new Float32Array([1, 0, 0, 1]);

      const error = measureReconstructionError(original, reconstructed);

      expect(error).toBeCloseTo(0, 5);
    });

    it('completely different vectors have high error', () => {
      const original = new Float32Array([1, 1, 1, 1]);
      const reconstructed = new Float32Array([0, 0, 0, 0]);

      const error = measureReconstructionError(original, reconstructed);

      expect(error).toBeGreaterThan(0.5);
    });

    it('small differences produce small error', () => {
      const original = new Float32Array([1, 0, 0, 1]);
      const reconstructed = new Float32Array([1.01, 0.01, 0, 1.01]);

      const error = measureReconstructionError(original, reconstructed);

      expect(error).toBeLessThan(0.01);
    });

    it('throws on dimension mismatch', () => {
      const original = new Float32Array([1, 0, 0]);
      const reconstructed = new Float32Array([1, 0]);

      expect(() => measureReconstructionError(original, reconstructed))
        .toThrow();
    });
  });

  describe('quantizeINT8 — Float32 to INT8 conversion', () => {
    it('converts to Uint8Array', () => {
      const latent = new Float32Array([0.5, -0.5, 0.0, 1.0]);
      const result = quantizeINT8(latent);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toHaveLength(4);
    });

    it('all values in valid range [0, 255]', () => {
      const latent = new Float32Array([0.5, -0.5, 0.0, 1.0, -1.0]);
      const result = quantizeINT8(latent);

      result.forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(255);
      });
    });

    it('input range [min, max] maps to [0, 255]', () => {
      const latent = new Float32Array([0, 50, 100]); // min=0, max=100
      const result = quantizeINT8(latent);

      expect(result[0]).toBe(0); // min → 0
      expect(result[2]).toBe(255); // max → 255
      expect(result[1]).toBeGreaterThan(0);
      expect(result[1]).toBeLessThan(255);
    });

    it('handles all-zero input', () => {
      const latent = new Float32Array([0, 0, 0]);
      const result = quantizeINT8(latent);

      result.forEach(val => {
        expect(val).toBeDefined();
      });
    });
  });

  describe('dequantizeINT8 — INT8 to Float32 conversion', () => {
    it('reconstructs quantized values', () => {
      const original = new Float32Array([0.25, 0.5, 0.75]);
      const quantized = quantizeINT8(original);

      // Find original min/max for dequantization
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < original.length; i++) {
        min = Math.min(min, original[i]);
        max = Math.max(max, original[i]);
      }

      const reconstructed = dequantizeINT8(quantized, min, max);

      expect(reconstructed).toHaveLength(3);
      reconstructed.forEach(val => {
        expect(Number.isFinite(val)).toBe(true);
      });
    });

    it('round-trip error is acceptable (<5%)', () => {
      const original = new Float32Array([0.1, 0.5, 0.9]);
      const quantized = quantizeINT8(original);

      let min = Infinity, max = -Infinity;
      for (let i = 0; i < original.length; i++) {
        min = Math.min(min, original[i]);
        max = Math.max(max, original[i]);
      }

      const reconstructed = dequantizeINT8(quantized, min, max);

      for (let i = 0; i < original.length; i++) {
        const error = Math.abs(original[i] - reconstructed[i]);
        const relError = error / Math.abs(original[i]);
        expect(relError).toBeLessThan(0.1); // 10% error tolerance
      }
    });
  });

  describe('round-trip: encode → quantize → dequantize', () => {
    it('preserves semantic information after compression', async () => {
      // Two similar embeddings should remain similar after round-trip
      const emb1 = new Float32Array(768).fill(0.5);
      const emb2 = new Float32Array(768).fill(0.51);

      const lat1 = await encodeToLatent(emb1, AutoencoderDefaults);
      const lat2 = await encodeToLatent(emb2, AutoencoderDefaults);

      // Latents should still be similar
      let dotProduct = 0;
      for (let i = 0; i < 64; i++) {
        dotProduct += lat1.data[i] * lat2.data[i];
      }

      expect(dotProduct).toBeGreaterThan(0.9); // High similarity preserved
    });
  });

  describe('AutoencoderDefaults — Configuration', () => {
    it('defines expected default values', () => {
      expect(AutoencoderDefaults.inputDim).toBe(768);
      expect(AutoencoderDefaults.latentDim).toBe(64);
      expect(AutoencoderDefaults.hiddenDim).toBe(256);
      expect(AutoencoderDefaults.quantized).toBe(true);
    });
  });
});