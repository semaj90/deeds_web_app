/**
 * VLM Document Analyzer — vision/image branch of the document extraction pipeline.
 *
 * Lifted from the VLM-specific paths in `evidence/upload/+server.ts` into a named
 * module so document-processor.ts can call it without knowing the Gemma4 VLM internals.
 *
 * Depends on: model-router.ts (Layer 1.2) — uses MODELS.LEGAL_VLM constant.
 *
 * Backends tried in order:
 *   1. Granite-Docling (analyzeDocumentWithDocling) — SigLIP2 vision encoder, rich DocTags
 *   2. Granite-Docling image path (analyzeImageWithGraniteDocling) — images/scanned PDFs
 *   3. Gemma4 VLM fallback (analyzeEvidenceImage) — direct Ollama vision call
 */

export interface VlmAnalysisResult {
  /** Extracted plain text (may be empty if image analysis produced only structured blocks) */
  text: string;
  /** Granite-Docling structured blocks (present when Docling succeeded) */
  doclingBlocks?: Record<string, unknown>[];
  /** Which backend produced this result */
  method: 'granite-docling' | 'granite-docling-image' | 'gemma4-vlm' | 'none';
  /** Confidence 0-1 (1 = structured DocTags blocks present, 0 = fallback description only) */
  confidence: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function tryGraniteDoclingDocument(buffer: Buffer, mimeType: string): Promise<VlmAnalysisResult | null> {
  try {
    const { analyzeDocumentWithDocling, isDoclingAvailable } = await import(
      '$lib/server/docling.js'
    );
    if (!(await isDoclingAvailable())) return null;

    const result = await analyzeDocumentWithDocling({ fileBuffer: buffer, mimeType });
    if (!result?.fullText) return null;

    return {
      text: result.fullText,
      doclingBlocks: result.blocks as unknown as Record<string, unknown>[],
      method: 'granite-docling',
      confidence: result.blocks?.length ? 1 : 0.7,
    };
  } catch {
    return null;
  }
}

async function tryGraniteDoclingImage(buffer: Buffer): Promise<VlmAnalysisResult | null> {
  try {
    const { analyzeImageWithGraniteDocling } = await import(
      '$lib/server/analysis/granite-docling.js'
    );
    const result = await analyzeImageWithGraniteDocling(buffer);
    if (!result?.fullText) return null;

    return {
      text: result.fullText,
      doclingBlocks: result.blocks as unknown as Record<string, unknown>[],
      method: 'granite-docling-image',
      confidence: result.blocks?.length ? 0.9 : 0.6,
    };
  } catch {
    return null;
  }
}

async function tryGemma4Vlm(buffer: Buffer, mimeType: string): Promise<VlmAnalysisResult | null> {
  try {
    const { analyzeEvidenceImage } = await import(
      '$lib/server/analysis/vlm-evidence-analyzer.js'
    );
    const vlmResult = await analyzeEvidenceImage({ buffer, fileName: '' });
    if (!vlmResult?.summary) return null;

    const text = [vlmResult.summary, ...(vlmResult.keyFindings ?? [])].join('\n');
    return { text, method: 'gemma4-vlm', confidence: 0.5 };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a document or image with VLM — tries Granite-Docling first, then Gemma4 VLM.
 *
 * @param buffer    Raw file bytes
 * @param fileName  Original filename (used for MIME detection inside Docling)
 * @param mimeType  MIME type string (e.g. 'image/png', 'application/pdf')
 */
export async function analyzeWithVlm(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<VlmAnalysisResult> {
  void fileName; // Docling uses mimeType directly; fileName kept for API symmetry
  const isImage = mimeType.startsWith('image/');

  if (isImage) {
    const doclingImg = await tryGraniteDoclingImage(buffer);
    if (doclingImg) return doclingImg;
  } else {
    const doclingDoc = await tryGraniteDoclingDocument(buffer, mimeType);
    if (doclingDoc) return doclingDoc;
  }

  const vlm = await tryGemma4Vlm(buffer, mimeType);
  if (vlm) return vlm;

  return { text: '', method: 'none', confidence: 0 };
}

/**
 * Score the quality of VLM analysis result — used by the upload route for
 * section reranking decisions (only rerank when DocTags blocks are present).
 */
export function isHighQualityVlmResult(result: VlmAnalysisResult): boolean {
  return result.confidence >= 0.7 && (result.doclingBlocks?.length ?? 0) > 0;
}
