// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  extractEntitiesNative,
  extractDocumentNative,
  enrichClusterSummary,
} from '$lib/server/langextract/native.js';

describe('langextract/native — pure-TS replacement for the Python service', () => {
  it('extracts citations with volume/reporter/page/year metadata', () => {
    const text = 'See Miranda v. Arizona, 384 U.S. 436 (1966), and 410 U.S. 113 (1973).';
    const entities = extractEntitiesNative(text);
    const citations = entities.filter((e) => e.type === 'citation');
    expect(citations).toHaveLength(2);
    expect(citations[0].metadata).toMatchObject({ volume: '384', reporter: 'US', page: '436', year: 1966 });
    expect(citations[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('extracts statutes with title/code/section metadata', () => {
    const text = 'Suit brought under 42 U.S.C. § 1983 and 18 U.S.C. § 242.';
    const entities = extractEntitiesNative(text);
    const statutes = entities.filter((e) => e.type === 'statute');
    expect(statutes).toHaveLength(2);
    expect(statutes[0].metadata).toMatchObject({ title: '42', code: 'USC', section: '1983' });
  });

  it('extracts case names with plaintiff/defendant', () => {
    const text = 'Brown v. Board of Education and Roe v. Wade are landmark cases.';
    const entities = extractEntitiesNative(text);
    const cases = entities.filter((e) => e.type === 'case_name');
    expect(cases.length).toBeGreaterThanOrEqual(2);
    expect(cases[0].metadata?.plaintiff).toBe('Brown');
  });

  it('extracts monetary amounts (dollar/word forms)', () => {
    const text = 'Damages of $1,500,000 and $2.5 million were awarded.';
    const entities = extractEntitiesNative(text);
    const money = entities.filter((e) => e.type === 'monetary');
    expect(money.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts dates in ISO and "Month Day, Year" formats', () => {
    const text = 'Filed on 2026-03-15 and amended on April 22, 2026.';
    const entities = extractEntitiesNative(text);
    const dates = entities.filter((e) => e.type === 'date');
    expect(dates).toHaveLength(2);
  });

  it('extracts titled persons (Justice / Judge / Senator)', () => {
    const text = 'Justice Roberts and Judge Smith presided.';
    const entities = extractEntitiesNative(text);
    const people = entities.filter((e) => e.type === 'person');
    expect(people).toHaveLength(2);
  });

  it('extracts known organizations and Department-of patterns', () => {
    const text = 'The ACLU sued the Department of Justice and the FBI.';
    const entities = extractEntitiesNative(text);
    const orgs = entities.filter((e) => e.type === 'organization');
    expect(orgs.length).toBeGreaterThanOrEqual(3);
  });

  it('extractDocumentNative produces sections + entities + confidence', () => {
    const text = `
FACTS
On March 15, 2026, Brown v. Board of Education was cited.

REASONING
The court held under 42 U.S.C. § 1983 that damages of $1,500,000 were appropriate.

HOLDING
Affirmed.
    `.trim();
    const out = extractDocumentNative(text, 'doc-1', 'case');
    expect(out.doc_id).toBe('doc-1');
    expect(out.sections.length).toBeGreaterThan(0);
    expect(out.entities.length).toBeGreaterThan(0);
    expect(out.extraction_confidence).toBeGreaterThan(0.4);
  });

  it('enrichClusterSummary returns structured counts for graphify', () => {
    const text = 'Cluster covers Brown v. Board of Education, Roe v. Wade, and 42 U.S.C. § 1983.';
    const summary = enrichClusterSummary(text);
    expect(summary.citationCount).toBe(0); // no volume.reporter.page form here
    expect(summary.statuteCount).toBe(1);
    expect(summary.partyCount).toBeGreaterThanOrEqual(2);
  });

  it('returns stable ordering by start offset', () => {
    const text = 'See 42 U.S.C. § 1983. Filed 2026-03-15. $1,500,000 damages.';
    const entities = extractEntitiesNative(text);
    for (let i = 1; i < entities.length; i++) {
      expect(entities[i].start).toBeGreaterThanOrEqual(entities[i - 1].start);
    }
  });

  it('extractDocumentInWorker dispatches to worker_threads and returns sections+entities', async () => {
    const { extractDocumentInWorker } = await import('$lib/server/langextract/native.js');
    const text = `
FACTS
On 2026-03-15, Brown v. Board was cited.

REASONING
42 U.S.C. § 1983 awarded $1,500,000 in damages.
    `.trim();
    const out = await extractDocumentInWorker(text, 'doc-worker', 'case');
    expect(out).toBeTruthy();
    expect(out.entities.length).toBeGreaterThan(0);
    expect(out.sections.length).toBeGreaterThan(0);
    expect(out.extraction_confidence).toBeGreaterThanOrEqual(0.4);
    // Worker fallback to main thread should still produce stable ordering
    for (let i = 1; i < out.entities.length; i++) {
      expect(out.entities[i].start).toBeGreaterThanOrEqual(out.entities[i - 1].start);
    }
  }, 15000);

  it('deduplicates overlapping matches by (type, start, end)', () => {
    const text = '42 U.S.C. § 1983 42 U.S.C. § 1983 42 U.S.C. § 1983';
    const entities = extractEntitiesNative(text);
    // Three distinct positions, no duplicates
    const statutes = entities.filter((e) => e.type === 'statute');
    expect(statutes).toHaveLength(3);
    const positions = new Set(statutes.map((s) => `${s.start}:${s.end}`));
    expect(positions.size).toBe(3);
  });
});