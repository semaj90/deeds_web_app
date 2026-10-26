import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateDocumentScore,
  encodeDocumentScoresCpu,
  packDocFeatures,
  type DocFeatures,
} from './schema-encoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('WebGPU Schema Encoder & CPU Reference', () => {
  const sampleDocs: DocFeatures[] = [
    {
      trustTier: 1.0,
      somCluster: 3.0,
      karpathyBlend: 0.8,
      pagerank: 0.75,
      riskScore: 0.1,
    },
    {
      trustTier: 0.5,
      somCluster: 1.0,
      karpathyBlend: 0.4,
      pagerank: 0.2,
      riskScore: 0.9,
    },
    {
      trustTier: 0.0,
      somCluster: 0.0,
      karpathyBlend: 0.0,
      pagerank: 0.0,
      riskScore: 0.0,
    },
  ];

  it('verifies schema-encoder.wgsl shader exists on disk and contains valid entry point', () => {
    const wgslPath = resolve(__dirname, 'schema-encoder.wgsl');
    expect(existsSync(wgslPath)).toBe(true);
    const content = readFileSync(wgslPath, 'utf8');
    expect(content).toContain('struct DocFeatures');
    expect(content).toContain('@compute @workgroup_size(64)');
    expect(content).toContain('fn main(');
    expect(content).toContain('scores[row] = (doc.trust_tier * 0.3) + (doc.karpathy_blend * 0.5) + ((1.0 - doc.risk_score) * 0.2)');
  });

  it('packs document features into Float32Array with 5-float stride', () => {
    const packed = packDocFeatures(sampleDocs);
    expect(packed.length).toBe(sampleDocs.length * 5);

    // Verify first document
    expect(packed[0]).toBeCloseTo(1.0);
    expect(packed[1]).toBeCloseTo(3.0);
    expect(packed[2]).toBeCloseTo(0.8);
    expect(packed[3]).toBeCloseTo(0.75);
    expect(packed[4]).toBeCloseTo(0.1);

    // Verify second document
    expect(packed[5]).toBeCloseTo(0.5);
    expect(packed[6]).toBeCloseTo(1.0);
    expect(packed[7]).toBeCloseTo(0.4);
    expect(packed[8]).toBeCloseTo(0.2);
    expect(packed[9]).toBeCloseTo(0.9);
  });

  it('calculates document score correctly according to weighted formula', () => {
    // doc 0: (1.0 * 0.3) + (0.8 * 0.5) + ((1.0 - 0.1) * 0.2)
    // = 0.3 + 0.4 + 0.18 = 0.88
    const score0 = calculateDocumentScore(sampleDocs[0]);
    expect(score0).toBeCloseTo(0.88, 5);

    // doc 1: (0.5 * 0.3) + (0.4 * 0.5) + ((1.0 - 0.9) * 0.2)
    // = 0.15 + 0.20 + 0.02 = 0.37
    const score1 = calculateDocumentScore(sampleDocs[1]);
    expect(score1).toBeCloseTo(0.37, 5);

    // doc 2: (0.0 * 0.3) + (0.0 * 0.5) + ((1.0 - 0.0) * 0.2)
    // = 0.0 + 0.0 + 0.20 = 0.20
    const score2 = calculateDocumentScore(sampleDocs[2]);
    expect(score2).toBeCloseTo(0.20, 5);
  });

  it('executes batched scoring matching the array output', () => {
    const scores = encodeDocumentScoresCpu(sampleDocs);
    expect(scores.length).toBe(sampleDocs.length);
    expect(scores[0]).toBeCloseTo(0.88, 5);
    expect(scores[1]).toBeCloseTo(0.37, 5);
    expect(scores[2]).toBeCloseTo(0.20, 5);
  });

  it('computes document scores in worker thread with zero-copy SharedArrayBuffer', async () => {
    const { getComputePool } = await import('../server/workers/compute-pool.js');
    const pool = getComputePool();
    const packed = packDocFeatures(sampleDocs);
    const sharedFeatures = new SharedArrayBuffer(packed.byteLength);
    new Float32Array(sharedFeatures).set(packed);

    const scores = await pool.encodeDocumentScores(sharedFeatures, sampleDocs.length);
    expect(scores.length).toBe(sampleDocs.length);
    expect(scores[0]).toBeCloseTo(0.88, 5);
    expect(scores[1]).toBeCloseTo(0.37, 5);
    expect(scores[2]).toBeCloseTo(0.20, 5);
  });
});
