/**
 * OCR Client - Stub
 *
 * This file was corrupted (minified incorrectly) and has been stubbed.
 * The original had 415 TypeScript errors due to malformed syntax.
 *
 * TODO: Rewrite with proper OCR service integration
 */

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: OCRBlock[];
  processingTime: number;
}

export interface OCRBlock {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface OCROptions {
  language?: string;
  enhanceImage?: boolean;
  detectLayout?: boolean;
}

/**
 * OCR Client for document text extraction
 */
export class OCRClient {
  private endpoint: string;

  constructor(endpoint: string = 'http://localhost:8080/ocr') {
    this.endpoint = endpoint;
  }

  /**
   * Process image and extract text
   */
  async processImage(imageData: Blob | ArrayBuffer, options?: OCROptions): Promise<OCRResult> {
    console.log('[OCR Stub] processImage called with options:', options);

    // Stub response
    return {
      text: '[OCR Stub] No text extracted - implement real OCR service',
      confidence: 0,
      blocks: [],
      processingTime: 0,
    };
  }

  /**
   * Process PDF and extract text from all pages
   */
  async processPDF(pdfData: Blob | ArrayBuffer, options?: OCROptions): Promise<OCRResult[]> {
    console.log('[OCR Stub] processPDF called');

    return [{
      text: '[OCR Stub] No PDF processed - implement real OCR service',
      confidence: 0,
      blocks: [],
      processingTime: 0,
    }];
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<boolean> {
    console.log('[OCR Stub] healthCheck called');
    return false;
  }
}

// Default instance
export const ocrClient = new OCRClient();
export default ocrClient;
