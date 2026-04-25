// src/lib/server/ocr/ocr-pipeline.ts
import Tesseract from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';

export interface OCRResult {
  text: string;
  confidence: number;
  layout: LayoutInfo;
  language: string;
}

export interface LayoutInfo {
  blocks: Array<{ bbox: any; text: string; confidence: number }>;
  tables: Array<any>; // Placeholder for table info
  headers: Array<any>; // Placeholder for header info
}

export class OCRPipeline {
  private tesseract = Tesseract;

  async extractFromPDF(pdfBuffer: Buffer): Promise<OCRResult[]> {
    // Convert PDF pages to images
    const images = await this.pdfToImages(pdfBuffer);

    // OCR each page
    const results = await Promise.all(
      images.map(img => this.ocrImage(img))
    );

    return results;
  }

  async extractFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    // Use Tesseract (fast, browser-compatible)
    const tesseractResult = await this.tesseract.recognize(imageBuffer, 'eng');

    if (tesseractResult.data.confidence > 70) {
      return {
        text: tesseractResult.data.text,
        confidence: tesseractResult.data.confidence / 100,
        layout: this.extractLayout(tesseractResult.data),
        language: 'en'
      };
    } else {
      // If Tesseract confidence is low, or if it failed, return a generic error or throw
      throw new Error('Tesseract OCR confidence too low or failed to extract text.');
    }
  }

  private async pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;

    const images: Buffer[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d')!;

      await page.render({ canvasContext: context, viewport }).promise;

      // Convert canvas to buffer
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const arrayBuffer = await blob.arrayBuffer();
      images.push(Buffer.from(arrayBuffer));
    }

    return images;
  }

  private extractLayout(tesseractData: any): LayoutInfo {
    const { blocks, lines, words } = tesseractData;

    return {
      blocks: blocks.map((b: any) => ({
        bbox: b.bbox,
        text: b.text,
        confidence: b.confidence
      })),
      tables: this.detectTables(lines),
      headers: this.detectHeaders(words)
    };
  }

  private detectTables(lines: any[]): any[] {
    // Placeholder for table detection logic
    console.warn('Table detection not implemented.');
    return [];
  }

  private detectHeaders(words: any[]): any[] {
    // Placeholder for header detection logic
    console.warn('Header detection not implemented.');
    return [];
  }
}
