import { describe, expect, it } from 'vitest';
import {
  buildCompressedSegment,
  buildContextCompressionV1,
  buildCompressedContextCacheKeyV1,
  ContextCompressionV1Schema,
} from './context-compression-v1.js';
import {
  compressFanoutContextV1,
  compileFanoutContextV1,
} from './fanout-context-compiler-v1.js';

describe('CTX-COMPRESS-01 & CTX-COMPRESS-02: Headroom Post-Admission Compression Layer', () => {
  it('builds a valid compressed segment with cryptographic hashes', () => {
    const raw = 'export function validateUser(token: string): boolean { return token.length > 10; }';
    const compressed = 'fn validateUser(token: str): bool { token.len > 10 }';

    const seg = buildCompressedSegment({
      evidenceRef: 'src/lib/server/auth.ts#L10-L15',
      rawText: raw,
      compressedText: compressed,
      originalTokens: 25,
      compressedTokens: 14,
      reversibleRef: 'src/lib/server/auth.ts#L10-L15',
    });

    expect(seg.inputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(seg.compressedChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(seg.originalTokens).toBe(25);
    expect(seg.compressedTokens).toBe(14);
  });

  it('builds ContextCompressionV1 with valid checksum and metrics', () => {
    const seg1 = buildCompressedSegment({
      evidenceRef: 'chunk:001',
      rawText: 'very long input chunk text for analysis...',
      compressedText: 'short chunk summary',
      originalTokens: 100,
      compressedTokens: 20,
    });

    const compression = buildContextCompressionV1({
      inputManifestChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      compressionPolicyRevision: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      segments: [seg1],
    });

    expect(ContextCompressionV1Schema.safeParse(compression).success).toBe(true);
    expect(compression.canonicalAuthority).toBe(false);
    expect(compression.totalOriginalTokens).toBe(100);
    expect(compression.totalCompressedTokens).toBe(20);
    expect(compression.compressionRatio).toBe(0.2);
    expect(compression.compressionChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('proves automatic BitFrost cache key invalidation upon revision change', () => {
    const manifestA = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const manifestB = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const policy1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
    const policy2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';

    const k1 = buildCompressedContextCacheKeyV1(manifestA, policy1);
    const k2 = buildCompressedContextCacheKeyV1(manifestB, policy1);
    const k3 = buildCompressedContextCacheKeyV1(manifestA, policy2);

    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1.startsWith('atlas:bitfrost:v1:compressed_context:')).toBe(true);
  });

  it('wires into fanout-context-compiler via compressFanoutContextV1', () => {
    const mockBundle = {
      bundleChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      candidates: [
        {
          candidateOrdinal: 1,
          evidence: [{ evidenceId: 'ev:001' }],
        },
      ],
      summary: {
        tokenBudget: 1000,
        tokenizerRevision: 'tok-v1',
        text: 'function add(a: number, b: number): number { return a + b; }',
        evidenceOrder: ['ev:001'],
      },
    };

    const compiled = compileFanoutContextV1({
      bundle: mockBundle as any,
      estimatedTokenCount: 15,
    });

    const compressed = compressFanoutContextV1({
      compiled,
      compressionPolicyRevision: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      compressor: (text) => ({
        compressedText: text.replace('function add', 'fn add'),
        compressedTokens: 10,
      }),
    });

    expect(compressed.inputManifestChecksum).toBe(compiled.contextManifestChecksum);
    expect(compressed.segments).toHaveLength(1);
    expect(compressed.segments[0].evidenceRef).toBe('ev:001');
    expect(compressed.segments[0].compressedText).toContain('fn add');
    expect(compressed.segments[0].reversibleRef).toBe('ev:001');
  });
});
