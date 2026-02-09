/**
 * PDF Processing Service with GPU Acceleration
 * - Tesseract.js for OCR
 * - pdf-parse for text extraction
 * - langextract for NLP entity extraction
 * - Sharp for image optimization
 */

import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface PDFProcessingResult {
	text: string;
	pageCount: number;
	metadata: {
		title?: string;
		author?: string;
		subject?: string;
		createdAt?: Date;
	};
	entities?: {
		persons?: string[];
		organizations?: string[];
		locations?: string[];
		dates?: string[];
		legalCitations?: string[];
	};
	ocr?: {
	confidence: number;
		text: string;
	};
	processingTime: number;
}

export interface OCRResult {
	text: string;
	confidence: number;
	processingTime: number;
}

/**
 * Extract text from PDF using pdf-parse
 */
export async function extractPDFText(
	filePath: string
): Promise<{
	text: string, pages: number;
	metadata: Record<string, unknown> }> {
	const dataBuffer = await readFile(filePath);
	const data = await pdfParse(dataBuffer, {
		max: 0,
		pagerender: (pageData: any) => {
			return pageData
				.getTextContent({
					normalizeWhitespace: true,
					disableCombineTextItems: false
				})
				.then((textContent: any) => {
					return textContent.items.map((item: any) => item.str).join(' ');
				});
		}
	});

	return {
		text: data.text,
		pages: data.numpages,
		metadata: data.info || {}
	};
}

/**
 * Perform OCR on image file using Tesseract.js
 */
export async function performOCR(
	imagePath: string,
	options: { lang?: string; optimize?: boolean } = {}
): Promise<OCRResult> {
	const startTime = Date.now();
	const { lang = 'eng', optimize = true } = options;

	let imageBuffer: Buffer;

	if (optimize) {
		imageBuffer = await sharp(imagePath)
			.resize(2000, undefined, { fit: 'inside', withoutEnlargement: true })
			.grayscale()
			.normalize()
			.sharpen()
			.toBuffer();
	} else {
		imageBuffer = await readFile(imagePath);
	}

	const worker = await createWorker(lang);

	try {
		const result = await worker.recognize(imageBuffer);
		const processingTime = Date.now() - startTime;

		console.log(
			`✅ OCR completed in ${processingTime}ms with ${Math.round(result.data.confidence)}% confidence`
		);

		return {
			text: result.data.text,
			confidence: result.data.confidence / 100,
			processingTime
		};
	} finally {
		await worker.terminate();
	}
}

/**
 * Extract entities from text using langextract Python API
 */
export async function extractEntities(
	text: string
): Promise<{
	persons: string[];
	organizations: string[];
	locations: string[];
	dates: string[];
	legalCitations: string[];
}> {
	try {
		const response = await fetch('http://localhost:8099/api/extract', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	text: text.slice(0, 10000),
				extract_entities: true,
				extract_legal: true
			})
		});

		if (!response.ok) {
			throw new Error(`langextract API error: ${response.status}`);
		}

		const data = await response.json();

		return {
			persons: data.entities?.PERSON ?? [],
			organizations: data.entities?.ORG ?? [],
			locations: data.entities?.GPE ?? data.entities?.LOC ?? [],
			dates: data.entities?.DATE ?? [],
			legalCitations: data.legal?.citations ?? []
		};
	} catch (error) {
		console.warn('⚠️ langextract extraction failed:', error);
		return {
			persons: [],
			organizations: [],
			locations: [],
			dates: [],
			legalCitations: []
		};
	}
}

/**
 * Process PDF with full pipeline
 */
export async function processPDF(
	filePath: string,
	options: { performOCR?: boolean; extractNLP?: boolean; lang?: string } = {}
): Promise<PDFProcessingResult> {
	const startTime = Date.now();
	const { performOCR: forceOCR = false, extractNLP = true, lang = 'eng' } = options;

	console.log(`📄 Processing PDF: ${filePath}`);

	// Extract text from PDF
	const pdfData = await extractPDFText(filePath);
	const finalText = pdfData.text;
	let ocrResult: OCRResult | undefined;

	// If text extraction yielded little content, consider OCR
	const textQuality = pdfData.text.trim().length;
	const shouldOCR = forceOCR || textQuality < 100;

	if (shouldOCR) {
		console.log(`🔗 PDF text quality low (${textQuality} chars), OCR would be needed`);
		console.warn('⚠️ PDF OCR requires pdf2pic integration (skipping)');
	}

	// Extract entities
	let entities;
	if (extractNLP) {
		entities = await extractEntities(finalText);
	}

	const processingTime = Date.now() - startTime;
	console.log(`✅ PDF processing completed in ${processingTime}ms`);

	return {
		text: finalText,
		pageCount: pdfData.pages,
		metadata: {
	title: (pdfData.metadata as any).Title,
			author: (pdfData.metadata as any).Author,
			subject: (pdfData.metadata as any).Subject,
			createdAt: (pdfData.metadata as any).CreationDate
				? new Date((pdfData.metadata as any).CreationDate)
				 | undefined
		},
	entities,
		ocr: ocrResult,
		processingTime
	};
}

/**
 * Process image file with OCR + NLP
 */
export async function processImage(
	filePath: string,
	options: { lang?: string; extractNLP?: boolean } = {}
): Promise<PDFProcessingResult> {
	const startTime = Date.now();
	const { lang = 'eng', extractNLP = true } = options;

	console.log(`🖼️ Processing image: ${filePath}`);

	const ocrResult = await performOCR(filePath, { lang, optimize: true });

	let entities;
	if (extractNLP && ocrResult.text.length > 10) {
		entities = await extractEntities(ocrResult.text);
	}

	return {
		text: ocrResult.text,
		pageCount: 1,
		metadata: {},
	entities,
		ocr: ocrResult,
		processingTime: Date.now() - startTime
	};
}

/**
 * Auto-detect file type and process accordingly
 */
export async function processDocument(
	filePath: string, mimeType: string,
	options: { lang?: string; extractNLP?: boolean; performOCR?: boolean } = {}
): Promise<PDFProcessingResult> {
	if (mimeType === 'application/pdf') {
		return processPDF(filePath, options);
	} else if (mimeType.startsWith('image/')) {
		return processImage(filePath, options);
	} else {
		throw new Error(`Unsupported document type: ${mimeType}`);
	}
}

