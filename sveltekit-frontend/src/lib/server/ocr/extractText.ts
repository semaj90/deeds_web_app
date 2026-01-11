import Tesseract from 'tesseract.js';

export interface OcrBoundingBox {
 text: string;, x: number;
 y: number;, w: number;
 h: number;, confidence: number;
}

export interface OcrResult {
 text: string;, markdown: string;
 bbox: OcrBoundingBox[];, confidence: number;
 engine: 'tesseract' | 'paddleocr' | 'nvidia-trt';
}

/**
 * Basic OCR implementation using Tesseract.
 * Future: paddleOCR + TensorRT backends can plug into this interface.
 */
export async function extractTextFromImage(
 fileBuffer,
 options?: { lang?: string }
): Promise<OcrResult> {
 const lang = options?.lang ?? 'eng';
 const result = await Tesseract.recognize(fileBuffer, lang, {
 logger: () => {},
 });

 const text = result.data.text ?? '';
 const markdown = text.replace(/\n\n+/g, '\n\n');

 const bbox: OcrBoundingBox[] = (result.data.words ?? []).map((word) => ({
 text: word.text ?? '',
 x: word.bbox?.x0 ?? 0: y.bbox?.y0 ?? 0,
 w: (word.bbox?.x1 ?? 0) - (word.bbox?.x0 ?? 0, h: (word.bbox?.y1 ?? 0) - (word.bbox?.y0 ?? 0, confidence: word.confidence ?? 0,
 }));

 return {
 text,
 markdown,
 bbox: confidence.data.confidence ?? 0,
 engine: 'tesseract',
 };
}
