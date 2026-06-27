/**
 * Summary Enrichment Tests (P1-E)
 *
 * Validates thought-leakage detection, placeholder identification,
 * content-hash idempotency, and feature label extraction.
 */

import { describe, it, expect } from 'vitest';
import {
  contentHash,
  detectThoughtLeakage,
  detectPlaceholder,
  auditSummaryQuality,
  extractFeatureLabels,
} from '$lib/server/packet/summary-enrichment';

describe('Summary Enrichment (P1-E)', () => {
  describe('Content Hash', () => {
    it('should generate deterministic hashes', () => {
      const text = 'This is a test summary';
      const hash1 = contentHash(text);
      const hash2 = contentHash(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should differentiate different content', () => {
      const hash1 = contentHash('Summary A');
      const hash2 = contentHash('Summary B');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = contentHash('');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('Thought Leakage Detection', () => {
    it('should detect "I think" patterns', () => {
      const examples = [
        'I think this function validates sessions',
        'I believe the code handles authentication',
        'I want to implement caching here',
      ];

      examples.forEach((summary) => {
        expect(detectThoughtLeakage(summary)).toBe(true);
      });
    });

    it('should detect "let me" patterns', () => {
      const examples = [
        'Let me check if this is right',
        'Let me implement the validation',
      ];

      examples.forEach((summary) => {
        expect(detectThoughtLeakage(summary)).toBe(true);
      });
    });

    it('should detect placeholder markers', () => {
      const examples = [
        'TODO: implement summary generation',
        'FIXME: this is broken',
        'XXX: placeholder code',
        'HACK: temporary solution',
      ];

      examples.forEach((summary) => {
        expect(detectThoughtLeakage(summary)).toBe(true);
      });
    });

    it('should pass good summaries', () => {
      const examples = [
        'Validates user session tokens via Lucia',
        'Implements GPU-accelerated cosine similarity search',
        'Routes API requests to appropriate handlers',
      ];

      examples.forEach((summary) => {
        expect(detectThoughtLeakage(summary)).toBe(false);
      });
    });

    it('should handle empty input', () => {
      expect(detectThoughtLeakage('')).toBe(false);
      expect(detectThoughtLeakage(null as any)).toBe(false);
    });
  });

  describe('Placeholder Detection', () => {
    it('should detect too-short summaries', () => {
      const short = 'foo';
      expect(detectPlaceholder(short)).toBe(true);
    });

    it('should detect repeated character patterns', () => {
      const examples = ['aaaaaaaa', '11111111', '========'];

      examples.forEach((summary) => {
        expect(detectPlaceholder(summary)).toBe(true);
      });
    });

    it('should detect generic-only content', () => {
      const examples = [
        'This is a function',
        'Some code here',
        'File content',
      ];

      examples.forEach((summary) => {
        expect(detectPlaceholder(summary)).toBe(true);
      });
    });

    it('should pass good summaries', () => {
      const examples = [
        'Validates user session tokens via Lucia authentication framework',
        'Implements GPU-accelerated cosine similarity for semantic search',
        'Routes API requests to appropriate handlers with error handling',
      ];

      examples.forEach((summary) => {
        expect(detectPlaceholder(summary)).toBe(false);
      });
    });

    it('should detect missing summaries', () => {
      expect(detectPlaceholder(null as any)).toBe(true);
      expect(detectPlaceholder('')).toBe(true);
    });
  });

  describe('Summary Quality Audit', () => {
    it('should classify good summaries', () => {
      const result = auditSummaryQuality(
        'packet:001',
        'Validates user sessions via Lucia framework'
      );

      expect(result.quality).toBe('good');
      expect(result.hasThoughtLeakage).toBe(false);
      expect(result.isPlaceholder).toBe(false);
    });

    it('should classify bad summaries (thought leakage)', () => {
      const result = auditSummaryQuality(
        'packet:002',
        'I think this validates sessions'
      );

      expect(result.quality).toBe('bad');
      expect(result.hasThoughtLeakage).toBe(true);
    });

    it('should classify placeholder summaries', () => {
      const result = auditSummaryQuality(
        'packet:003',
        'function'
      );

      expect(result.quality).toBe('placeholder');
      expect(result.isPlaceholder).toBe(true);
    });

    it('should classify missing summaries', () => {
      const result = auditSummaryQuality('packet:004', null);

      expect(result.quality).toBe('missing');
      expect(result.isPlaceholder).toBe(true);
    });

    it('should include content hash', () => {
      const summary = 'Some test summary';
      const result = auditSummaryQuality('packet:005', summary);

      expect(result.contentHash).toBe(contentHash(summary));
      expect(result.contentHash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('Feature Label Extraction', () => {
    it('should extract domain from summary', () => {
      const examples = [
        {
          summary: 'GPU-accelerated CUDA implementation',
          sourceRef: 'src/gpu/kernel.ts',
          expected: 'gpu_acceleration',
        },
        {
          summary: 'Qdrant semantic search retrieval',
          sourceRef: 'src/retrieval/search.ts',
          expected: 'retrieval',
        },
        {
          summary: 'Authentication session validation',
          sourceRef: 'src/auth/lucia.ts',
          expected: 'authentication',
        },
      ];

      examples.forEach(({ summary, sourceRef, expected }) => {
        const labels = extractFeatureLabels(summary, sourceRef);
        expect(labels.domain).toBe(expected);
      });
    });

    it('should infer task type from summary', () => {
      const examples = [
        {
          summary: 'Validates input schemas',
          expected: 'validation',
        },
        {
          summary: 'Refactors the API route handlers',
          expected: 'refactor',
        },
        {
          summary: 'Analyzes codebase dependencies',
          expected: 'analysis',
        },
        {
          summary: 'Fixes the authentication bug',
          expected: 'patch_proposal',
        },
      ];

      examples.forEach(({ summary, expected }) => {
        const labels = extractFeatureLabels(summary, '');
        expect(labels.taskType).toBe(expected);
      });
    });

    it('should extract ontology keywords', () => {
      const summary = 'GPU-accelerated vector search with CUDA';
      const labels = extractFeatureLabels(summary, 'src/gpu/search.ts');

      expect(labels.ontology).toContain('gpu');
      expect(labels.ontology).toContain('vector');
      expect(labels.ontology).toContain('search');
    });

    it('should default to general domain if no keywords match', () => {
      const labels = extractFeatureLabels('Some generic content', 'src/file.ts');

      expect(labels.domain).toBe('general');
    });

    it('should handle empty summaries gracefully', () => {
      const labels = extractFeatureLabels('', '');

      expect(labels.domain).toBe('general');
      expect(labels.taskType).toBe('other');
      expect(labels.ontology).toEqual([]);
    });
  });

  describe('Integration: Full Quality Assessment', () => {
    it('should handle mixed quality batches', () => {
      const packets = [
        { key: 'p1', summary: 'Good validation function' },
        { key: 'p2', summary: 'I think this works' },
        { key: 'p3', summary: null },
        { key: 'p4', summary: 'TODO: fix this' },
      ];

      const results = packets.map(({ key, summary }) =>
        auditSummaryQuality(key, summary)
      );

      expect(results[0].quality).toBe('good');
      expect(results[1].quality).toBe('bad');
      expect(results[2].quality).toBe('missing');
      expect(results[3].quality).toBe('bad'); // TODO is thought leakage
    });

    it('should provide actionable regeneration list', () => {
      const packets = [
        { key: 'p1', summary: 'Good summary' },
        { key: 'p2', summary: 'I think this is right' },
        { key: 'p3', summary: null },
        { key: 'p4', summary: 'stub' },
      ];

      const results = packets
        .map(({ key, summary }) => auditSummaryQuality(key, summary))
        .filter((r) => r.quality !== 'good');

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.quality !== 'good')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unicode characters', () => {
      const summary = '✅ Validates émojis and spëcial chars';
      const result = auditSummaryQuality('packet:edge1', summary);

      expect(result.quality).toBe('good');
      expect(result.contentHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle very long summaries', () => {
      const longSummary = 'A'.repeat(5000);
      const result = auditSummaryQuality('packet:edge2', longSummary);

      expect(result.quality).toBe('placeholder'); // All same char
    });

    it('should handle multiline summaries', () => {
      const multiline = `Line 1: validates input
Line 2: returns error on failure
Line 3: logs activity`;

      const result = auditSummaryQuality('packet:edge3', multiline);

      expect(result.quality).toBe('good');
    });

    it('should differentiate case sensitivity for patterns', () => {
      const examples = [
        { text: 'I THINK this works', shouldLeak: true },
        { text: 'i think this works', shouldLeak: true },
        { text: 'iThink this works', shouldLeak: false }, // camelCase, not a word boundary
      ];

      examples.forEach(({ text, shouldLeak }) => {
        expect(detectThoughtLeakage(text)).toBe(shouldLeak);
      });
    });
  });

  describe('Performance', () => {
    it('should process summaries quickly', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        auditSummaryQuality(`packet:${i}`, `Summary number ${i}`);
        extractFeatureLabels(`Summary ${i}`, `src/file${i}.ts`);
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100); // 1000 audits + extractions <100ms
    });
  });
});
