import { describe, expect, it } from 'vitest';
import {
  ACQUISITION_ROUTING_MAX_CANDIDATES,
  AcquisitionRoutingPlanV1Schema,
  planAcquisitionRoutingV1,
} from './search-acquisition-routing-v1.js';

function result(url: string) {
  return { title: 't', url, snippet: 's', source: 'searxng' as const };
}

const baseSnapshot = { snapshotChecksum: 'x'.repeat(64) };

describe('planAcquisitionRoutingV1 (DISCOVERY-03)', () => {
  it('accepts ordinary public https URLs as ELIGIBLE', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [result('https://example.com/article'), result('https://example.org/doc.html')],
    });
    expect(plan.eligibleCount).toBe(2);
    expect(plan.rejectedCount).toBe(0);
    expect(plan.candidates.every((c) => c.status === 'ELIGIBLE')).toBe(true);
    expect(() => AcquisitionRoutingPlanV1Schema.parse(plan)).not.toThrow();
  });

  it('rejects malformed URLs as INVALID_URL', () => {
    const plan = planAcquisitionRoutingV1({ ...baseSnapshot, results: [result('not a url')] });
    expect(plan.candidates[0]!.status).toBe('REJECTED');
    expect(plan.candidates[0]!.rejectionReason).toBe('INVALID_URL');
  });

  it('rejects non-http(s) schemes as UNSUPPORTED_SCHEME', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [result('ftp://example.com/file'), result('mailto:someone@example.com'), result('javascript:alert(1)')],
    });
    expect(plan.candidates.every((c) => c.rejectionReason === 'UNSUPPORTED_SCHEME')).toBe(true);
  });

  it('reuses the existing SSRF/allowlist check for private and internal hosts', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [
        result('http://127.0.0.1/admin'),
        result('http://169.254.169.254/latest/meta-data/'),
        result('http://localhost:8080/'),
        result('http://redis:6379/'),
      ],
    });
    expect(plan.candidates.every((c) => c.status === 'REJECTED')).toBe(true);
    expect(plan.candidates.every((c) => c.rejectionReason === 'SSRF_BLOCKED')).toBe(true);
  });

  it('rejects duplicate normalized URLs, keeping only the first occurrence eligible', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [
        result('https://Example.com:443/Doc#section-2'),
        result('https://example.com/Doc'),
      ],
    });
    expect(plan.candidates[0]!.status).toBe('ELIGIBLE');
    expect(plan.candidates[1]!.status).toBe('REJECTED');
    expect(plan.candidates[1]!.rejectionReason).toBe('DUPLICATE_NORMALIZED_URL');
    // Case-insensitive host + explicit default port + fragment are all
    // normalized away before the duplicate comparison runs.
    expect(plan.candidates[0]!.normalizedUrl).toBe('https://example.com/Doc');
  });

  it('rejects URLs whose extension has no existing acquisition owner', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [
        result('https://example.com/photo.jpg'),
        result('https://example.com/video.mp4'),
        result('https://example.com/archive.zip'),
        result('https://example.com/installer.exe'),
      ],
    });
    expect(plan.candidates.every((c) => c.rejectionReason === 'UNOWNED_CONTENT_TYPE')).toBe(true);
  });

  it('treats extension-less and document-shaped URLs as owned (ELIGIBLE)', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [
        result('https://example.com/blog/2026/09/some-post'),
        result('https://example.com/whitepaper.pdf'),
        result('https://example.com/notes.md'),
      ],
    });
    expect(plan.eligibleCount).toBe(3);
  });

  it('bounds evaluation to ACQUISITION_ROUTING_MAX_CANDIDATES and reports truncation', () => {
    const many = Array.from({ length: ACQUISITION_ROUTING_MAX_CANDIDATES + 5 }, (_, i) =>
      result(`https://example.com/page-${i}`),
    );
    const plan = planAcquisitionRoutingV1({ ...baseSnapshot, results: many });
    expect(plan.candidates.length).toBe(ACQUISITION_ROUTING_MAX_CANDIDATES);
    expect(plan.truncated).toBe(true);
  });

  it('does not report truncation when results fit within the bound', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [result('https://example.com/a')],
    });
    expect(plan.truncated).toBe(false);
  });

  it('preserves original snapshot order via sourceRank', () => {
    const plan = planAcquisitionRoutingV1({
      ...baseSnapshot,
      results: [result('https://example.com/first'), result('https://example.com/second')],
    });
    expect(plan.candidates[0]!.sourceRank).toBe(0);
    expect(plan.candidates[1]!.sourceRank).toBe(1);
  });

  it('carries the snapshotChecksum through unchanged for traceability', () => {
    const plan = planAcquisitionRoutingV1({ ...baseSnapshot, results: [result('https://example.com/a')] });
    expect(plan.snapshotChecksum).toBe(baseSnapshot.snapshotChecksum);
  });
});
