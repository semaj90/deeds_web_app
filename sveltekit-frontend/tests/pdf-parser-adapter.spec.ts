// @vitest-environment node
/**
 * Canonical pdf-parse v2 adapter tests (PDF_PARSE_V2_REPO_MIGRATION).
 * Exercises src/lib/server/pdf/pdf-parser.ts against the real installed
 * pdf-parse 2.4.5 package — no mocking, since the whole point of the
 * adapter is to insulate callers from that package's real API shape.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePdfBuffer, PdfParseError } from '../src/lib/server/pdf/pdf-parser';

const FIXTURE_PDF = path.resolve(__dirname, 'complaint.pdf');
const MULTI_PAGE_FIXTURE_PDF = path.resolve(__dirname, 'multi-page.pdf');

describe('parsePdfBuffer', () => {
  it('extracts text from a valid single-page PDF', async () => {
    const buffer = await readFile(FIXTURE_PDF);
    const result = await parsePdfBuffer(buffer);

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.pageCount).toBe(1);
  });

  it('extracts text from every page of a multi-page PDF (generated fixture, pdf-lib)', async () => {
    const buffer = await readFile(MULTI_PAGE_FIXTURE_PDF);
    const result = await parsePdfBuffer(buffer);

    expect(result.pageCount).toBe(3);
    expect(result.text).toContain('Page 1 content marker 1');
    expect(result.text).toContain('Page 2 content marker 2');
    expect(result.text).toContain('Page 3 content marker 3');
  });

  it('accepts a Uint8Array in addition to Buffer', async () => {
    const buffer = await readFile(FIXTURE_PDF);
    const result = await parsePdfBuffer(new Uint8Array(buffer));

    expect(result.text.length).toBeGreaterThan(0);
  });

  it('normalizes info/metadata into plain objects or null', async () => {
    const buffer = await readFile(FIXTURE_PDF);
    const result = await parsePdfBuffer(buffer);

    expect(result.info === null || typeof result.info === 'object').toBe(true);
    expect(result.metadata === null || typeof result.metadata === 'object').toBe(true);
  });

  it('rejects with a normalized PdfParseError on invalid bytes', async () => {
    const garbage = Buffer.from('not a pdf file at all, just plain text bytes');

    await expect(parsePdfBuffer(garbage)).rejects.toBeInstanceOf(PdfParseError);
    try {
      await parsePdfBuffer(garbage);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PdfParseError);
      expect((err as PdfParseError).code).toBe('INVALID_PDF');
    }
  });

  it('rejects with a normalized PdfParseError on empty input', async () => {
    await expect(parsePdfBuffer(Buffer.alloc(0))).rejects.toBeInstanceOf(PdfParseError);
  });

  it('does not throw on a caller providing multi-call sequential parses (parser lifecycle isolation)', async () => {
    const buffer = await readFile(FIXTURE_PDF);
    const first = await parsePdfBuffer(buffer);
    const second = await parsePdfBuffer(buffer);

    expect(first.text).toBe(second.text);
    expect(first.pageCount).toBe(second.pageCount);
  });
});
