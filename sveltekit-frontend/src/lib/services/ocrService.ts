import { writable, type Writable } from 'svelte/store';
import { createWorker, type Worker } from 'tesseract.js';
import { z } from 'zod';
import { getOllamaEndpoint } from '$lib/services/get-ollama-endpoint';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Types
export interface BoundingBox {
  x: number;
	y: number;
  width: number;
	height: number;
  text: string;
	confidence: number;
}

export interface ExtractedField {
  fieldName: string;
	value: string;
  confidence: number;
	boundingBox: BoundingBox;
  fieldType: FieldType;
	validationStatus: 'valid' | 'invalid' | 'needs_review';
}

export type FieldType =
  | 'name'
  | 'date'
  | 'address'
  | 'phone'
  | 'email'
  | 'case_number'
  | 'jurisdiction'
  | 'monetary_amount'
  | 'legal_entity'
  | 'signature'
  | 'checkbox'
  | 'text_block';

export interface OCRMetadata {
  filename: string;
	fileSize: number;
  dimensions: {
	width: number; height: number };
  pageCount: number;
	language: string;
  documentType: string;
	processingDate: number;
}

export interface OCRResult {
  id: string;
	text: string;
  confidence: number;
	boundingBoxes: BoundingBox[];
  extractedFields: ExtractedField[];
	metadata: OCRMetadata;
  processingTime: number;
}

export interface FormField {
  name: string;
	type: FieldType;
  label: string;
  value?: string;
  confidence?: number;
	required: boolean;
  validation?: z.ZodSchema;
  suggestions?: string[];
}

// Field extraction patterns for different document types
const FIELD_PATTERNS = {
  legal_document: {
	case_number: /case\s*(?:no\.?|number)?\s*:\s*([A-Z0-9-]+)/i,
    date: /(?:date|filed|executed):\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,
    jurisdiction: /(?:jurisdiction|court|county):\s*([^,\n]+)/i,
    plaintiff: /plaintiff:\s*([^,\n]+)/i,
    defendant: /defendant:\s*([^,\n]+)/i,
    attorney: /attorney\s*(?:for)?:\s*([^,\n]+)/i,
    amount: /(?:amount|damages?)\s*:\s*\$?([\d,]+\.?\d*)/i,
  },
	contract: {
	party_1: /(?:party|contractor)\s*(?:1|one|first)?:\s*([^,\n]+)/i,
    party_2: /(?:party|contractor)\s*(?:2|two|second)?:\s*([^,\n]+)/i,
    effective_date: /effective\s*date:\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,
    term: /term:\s*([^,\n]+)/i,
    amount: /(?:amount|payment|fee):\s*\$?([\d,]+\.?\d*)/i,
    signature_1: /signature.*?([A-Za-z\s]{2,30})/i,
    signature_2: /signature.*?([A-Za-z\s]{2,30})/i,
  },
	form: {
	name: /(?:name|full\s*name):\s*([A-Za-z\s]{2,100})/i,
    address: /(?:address|street):\s*([^,\n]{5,200})/i,
    city: /city:\s*([A-Za-z\s]{2,50})/i,
    state: /state:\s*([A-Za-z]{2,20})/i,
    zip: /(?:zip|postal):\s*(\d{5}(?:-\d{4})?)/i,
    phone: /(?:phone|tel):\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
    email: /email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    ssn: /(?:ssn|social):\s*(\d{3}-?\d{2}-?\d{4})/i,
  },
	} as const;

export type DocumentType = keyof typeof FIELD_PATTERNS;

const fieldValidationSchemas: Partial<Record<FieldType, z.ZodSchema>> = {
  email: z.string().email(),
  phone: z.string().regex(/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/),
  date: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/),
  monetary_amount: z.string().regex(/^\$?[\d,]+\.?\d*$/),
  case_number: z.string().min(1),
  name: z.string().min(2).max(200),
};

export class OCRService {
  private worker: Worker | null = null;
  private isInitialized = false;

  public processing$: Writable<boolean> = writable(false);
  public progress$: Writable<number> = writable(0);
  public currentResult$: Writable<OCRResult | null> = writable(null);
  public extractedFields$: Writable<ExtractedField[]> = writable([]);

  constructor() {
    // Initialization should be handled explicitly or when first needed
  }

  private async initializeWorker(): Promise<void> {
    if (this.isInitialized && this.worker) return;

    try {
      console.log('🔧 Initializing OCR worker...');
      this.worker = await createWorker({
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            this.progress$.set(Math.round(m.progress * 100));
          }
        },
	});

      await this.worker.load();
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      await this.worker.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:!? -)()[0]{}/@#$%^&*+=<>\\~`"\' \n\t',
        preserve_interword_spaces: '1',
      });

      this.isInitialized = true;
      console.log('✅ OCR worker initialized');
    } catch (error) {
      console.error('❌ OCR worker failed:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  public async processDocument(
    file: File,
    options: {
      documentType?: DocumentType | 'auto';
      extractFields?: boolean;
      language?: string;
      qualityEnhancement?: boolean;
    } = {}
  ): Promise<OCRResult> {
    await this.initializeWorker();
    if (!this.worker) throw new Error('OCR worker not available');

    const startTime = Date.now();
    this.processing$.set(true);
    this.progress$.set(0);

    try {
      console.log(`🔍 Processing document: ${file.name}`);

      let processedImage: string | File | Blob = file;
      if (options.qualityEnhancement) {
        processedImage = await this.enhanceImageQuality(file);
      }

      const { data } = await this.worker.recognize(processedImage);
      const boundingBoxes = this.extractBoundingBoxes(data);
      const detectedType =
        options.documentType === 'auto' || !options.documentType
          ? await this.detectDocumentType(data.text || '')
          : options.documentType;

      const extractedFields =
        options.extractFields === false
          ? []
          : await this.extractFields(data.text || '', detectedType, boundingBoxes);

      const result: OCRResult = {
        id: `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        text: data.text || '',
        confidence: data.confidence || 0,
        boundingBoxes,
        extractedFields,
        metadata: {
	filename: file.name,
          fileSize: file.size,
          dimensions: {
	width: 0, height: 0 },
	pageCount: 1,
          language: options.language || 'eng',
          documentType: detectedType,
          processingDate: Date.now(),
        },
	processingTime: Date.now() - startTime,
      };

      this.currentResult$.set(result);
      this.extractedFields$.set(extractedFields);
      this.processing$.set(false);
      this.progress$.set(100);

      console.log(
        `✅ OCR completed in ${result.processingTime}ms with ${extractedFields.length} fields extracted`
      );
      return result;
    } catch (error) {
      console.error('❌ OCR failed:', error);
      this.processing$.set(false);
      this.progress$.set(0);
      throw error;
    }
  }

  private async enhanceImageQuality(file: File): Promise<File> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.15 + 128 + 8));
          data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.15 + 128 + 8));
          data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.15 + 128 + 8));
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: file.type }));
            } else {
              resolve(file);
            }
          },
	file.type || 'image/png',
          0.92
        );
      };

      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  private extractBoundingBoxes(data: {
    words?: Array<{
      bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
      text?: string;
      confidence?: number;
    }>;
  }): BoundingBox[] {
    const boxes: BoundingBox[] = [];
    if (data && data.words && Array.isArray(data.words)) {
      for (const word of data.words) {
        const bbox = word.bbox || {};
        boxes.push({
          x: bbox.x0 || 0,
          y: bbox.y0 || 0,
          width: Math.max(0, (bbox.x1 || 0) - (bbox.x0 || 0)),
          height: Math.max(0, (bbox.y1 || 0) - (bbox.y0 || 0)),
          text: word.text || '',
          confidence: word.confidence || 0,
        });
      }
    }
    return boxes;
  }

  private async detectDocumentType(text: string): Promise<DocumentType> {
    try {
      const prompt = `Analyze this document text and determine its type. Text: "${text.substring(0, 1000)}..."
Return only one of: legal_document, contract, form.`;

      const base = getOllamaEndpoint().replace(/\/$/, '');
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: 'gemma3-legal:latest',
          prompt,
          stream: false,
        }),
      });

      if (!res.ok) throw new Error('LLM not available');
      const body = await res.json();
      const candidate = String(body?.response || '')
        .trim()
        .toLowerCase();

      if (candidate === 'legal_document' || candidate === 'contract' || candidate === 'form') {
        return candidate as DocumentType;
      }
    } catch (e) {
      console.warn('LLM document type detection failed, falling back to heuristics');
    }

    const lower = text.toLowerCase();
    if (/\b(plaintiff|defendant|court|filed|motion)\b/.test(lower)) return 'legal_document';
    if (/\b(contract|agreement|party of the first part|term of service)\b/.test(lower))
      return 'contract';
    return 'form';
  }

  private async extractFields(
    text: string,
    documentType: DocumentType,
    boundingBoxes: BoundingBox[]
  ): Promise<ExtractedField[]> {
    const fields: ExtractedField[] = [];
    const patterns = FIELD_PATTERNS[documentType] || FIELD_PATTERNS.form;

    for (const [fieldName, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern as RegExp);
      if (match && match[1]) {
        const value = match[1].trim();
        const fieldType = this.determineFieldType(fieldName, value);
        const boundingBox = this.findBoundingBox(value, boundingBoxes);

        fields.push({
          fieldName,
          value,
          confidence: 0.8,
          boundingBox: boundingBox || {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            text: value,
            confidence: 0,
          },
	fieldType,
          validationStatus: this.validateField(fieldType, value),
        });
      }
    }

    try {
      const enhanced = await this.enhanceFieldsWithLLM(text, documentType, fields);
      return [...fields, ...enhanced];
    } catch {
      return fields;
    }
  }

  private determineFieldType(fieldName: string, value: string): FieldType {
    const lowerName = fieldName.toLowerCase();
    if (lowerName.includes('email') || /@/.test(value)) return 'email';
    if (lowerName.includes('phone') || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(value)) return 'phone';
    if (lowerName.includes('date') || /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(value))
      return 'date';
    if (lowerName.includes('amount') || /^\$?[\d,]+\.?\d*$/.test(value)) return 'monetary_amount';
    if (lowerName.includes('case') || lowerName.includes('number')) return 'case_number';
    if (lowerName.includes('address') || lowerName.includes('street')) return 'address';
    if (lowerName.includes('name')) return 'name';
    if (lowerName.includes('jurisdiction') || lowerName.includes('court')) return 'jurisdiction';
    return 'text_block';
  }

  private validateField(fieldType: FieldType, value: string): 'valid' | 'invalid' | 'needs_review' {
    const schema = fieldValidationSchemas[fieldType];
    if (!schema) return 'needs_review';

    try {
      schema.parse(value);
      return 'valid';
    } catch {
      return 'invalid';
    }
  }

  private findBoundingBox(text: string, boundingBoxes: BoundingBox[]): BoundingBox | null {
    const words = text.split(/\s+/);
    if (words.length === 0) return null;

    const firstWord = words[0].toLowerCase();
    for (const box of boundingBoxes) {
      if (box.text.toLowerCase().includes(firstWord)) {
        return box;
      }
    }
    return null;
  }

  private async enhanceFieldsWithLLM(
    text: string,
    documentType: DocumentType,
    existingFields: ExtractedField[]
  ): Promise<ExtractedField[]> {
    const existingNames = new Set(existingFields.map((f) => f.fieldName.toLowerCase()));
    const enhanced: ExtractedField[] = [];

    try {
      const prompt = `Extract additional fields from this ${documentType} that weren't found by pattern matching.
Existing fields: ${Array.from(existingNames).join(', ')}
Text: "${text.substring(0, 2000)}"
Return JSON array of objects with: fieldName, value, fieldType`;

      const base = getOllamaEndpoint().replace(/\/$/, '');
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: 'gemma3-legal:latest',
          prompt,
          stream: false,
          format: 'json',
        }),
      });

      if (!res.ok) return enhanced;

      const body = await res.json();
      const parsed = JSON.parse(body?.response || '[]');

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.fieldName && item.value && !existingNames.has(item.fieldName.toLowerCase())) {
            enhanced.push({
              fieldName: item.fieldName,
              value: item.value,
              confidence: 0.6,
              boundingBox: {
	x: 0, y: 0, width: 0, height: 0, text: item.value, confidence: 0 },
	fieldType: item.fieldType || 'text_block',
              validationStatus: 'needs_review',
            });
          }
        }
      }
    } catch {
      // LLM enhancement failed, return empty
    }

    return enhanced;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

// Singleton instance
let ocrServiceInstance: OCRService | null = null;

export function getOCRService(): OCRService {
  if (!ocrServiceInstance) {
    ocrServiceInstance = new OCRService();
  }
  return ocrServiceInstance;
}

export default OCRService;
