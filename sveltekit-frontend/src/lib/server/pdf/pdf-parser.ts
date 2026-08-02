/**
 * Canonical pdf-parse adapter (PDF_PARSE_V2_REPO_MIGRATION).
 *
 * pdf-parse 2.4.5 replaced the v1 callable default export
 * (`const pdfParse = require('pdf-parse'); await pdfParse(buffer)`) with a
 * `PDFParse` class (`new PDFParse({ data }); await parser.getText(); await parser.destroy()`).
 * Every server-side PDF consumer in this repo must go through this module —
 * never import `pdf-parse` directly — so the v2 lifecycle (constructor +
 * destroy), error normalization, and result-shape mapping live in one place.
 */
import { PDFParse, PasswordException, InvalidPDFException } from 'pdf-parse';

export type PdfParseErrorCode = 'PASSWORD_PROTECTED' | 'INVALID_PDF' | 'UNKNOWN';

export class PdfParseError extends Error {
  readonly code: PdfParseErrorCode;
  readonly cause?: unknown;

  constructor(code: PdfParseErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PdfParseError';
    this.code = code;
    this.cause = cause;
  }
}

/** Repository-owned result shape. Preserves the fields v1 callers relied on. */
export interface CanonicalPdfParseResult {
  /** Concatenated text across all parsed pages. */
  text: string;
  /** Number of pages in the document (v1: `numpages`). */
  pageCount: number;
  /** PDF 'Info' dictionary (v1: `info`), or null when unavailable. */
  info: Record<string, unknown> | null;
  /** Document metadata (v1: `metadata`), or null when unavailable. */
  metadata: Record<string, unknown> | null;
}

/**
 * Parse a PDF buffer using the pdf-parse 2.x class API and normalize the
 * result into the repository's canonical shape.
 *
 * Always releases the underlying parser via `destroy()`, on both success and
 * failure paths, per the v2 lifecycle contract.
 */
export async function parsePdfBuffer(data: Buffer | Uint8Array): Promise<CanonicalPdfParseResult> {
  const parser = new PDFParse({ data });
  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo().catch(() => null),
    ]);

    return {
      text: textResult.text,
      pageCount: textResult.total,
      info: (infoResult?.info as Record<string, unknown> | undefined) ?? null,
      metadata: (infoResult?.metadata as unknown as Record<string, unknown> | undefined) ?? null,
    };
  } catch (err) {
    if (err instanceof PasswordException) {
      throw new PdfParseError('PASSWORD_PROTECTED', 'PDF is password-protected', err);
    }
    if (err instanceof InvalidPDFException) {
      throw new PdfParseError('INVALID_PDF', 'File is not a valid PDF document', err);
    }
    throw new PdfParseError('UNKNOWN', err instanceof Error ? err.message : String(err), err);
  } finally {
    await parser.destroy();
  }
}
