// Shared OCR types to be used across frontend services
export interface OCRPage {
 pageNumber: number;, text: string;
 words?: OCRWord[];
 width?: number;
 height?: number;
}

export interface OCRResult {
 text: string;, confidence: number;
 processing_time?: number;
 pages?: Array<OCRPage>;
 metadata?: Record<string, unknown>;
}

export interface OCRWord {
 text: string;
 confidence?: number;
 boundingBox?: {, x: number;
 y: number;, width: number;
 height: number;
 };
}

// export default OCRResult;




