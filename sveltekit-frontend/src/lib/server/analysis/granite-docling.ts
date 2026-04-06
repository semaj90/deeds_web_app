/**
 * Granite-Docling-258M Integration
 *
 * IBM's 258M-param document understanding VLM via Ollama multimodal API.
 * Converts document images to structured DocTags output preserving layout,
 * tables, code, equations, and reading order.
 *
 * Vision encoder: SigLIP2-base-patch16-512 (512x512 native resolution)
 * Ollama handles internal image resize — no preprocessing needed.
 *
 * Uses the same Ollama fetch pattern as vlm-evidence-analyzer.ts.
 *
 * PDF support: Renders PDF pages to images via pdfjs-dist + @napi-rs/canvas,
 * then sends each page through Granite-Docling for structured extraction.
 */

import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import type { DoclingBlock, DoclingResult } from '$lib/server/docling.js';

const GRANITE_DOCLING_TIMEOUT = 120_000;
const PDF_RENDER_SCALE = 2.0; // 2x scale → ~150dpi for standard US Letter

// ── Availability Check (cached 60s) ──────────────────────────────────────

let cachedAvailable: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

export async function isGraniteDoclingAvailable(): Promise<boolean> {
	if (!ENV.GRANITE_DOCLING_ENABLED) return false;

	const now = Date.now();
	if (cachedAvailable !== null && now - cacheTimestamp < CACHE_TTL) {
		return cachedAvailable;
	}

	try {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) {
			cachedAvailable = false;
			cacheTimestamp = now;
			return false;
		}
		const data = await res.json();
		const models: string[] = data.models?.map((m: any) => m.name) ?? [];
		cachedAvailable = models.some(
			(name) => name.includes('granite-docling') || name.includes('granite_docling')
		);
		cacheTimestamp = now;
		return cachedAvailable;
	} catch {
		cachedAvailable = false;
		cacheTimestamp = now;
		return false;
	}
}

// ── DocTags Parser ───────────────────────────────────────────────────────

/**
 * Map DocTags element names to existing DoclingBlock type enum.
 * Granite-Docling outputs tags like: section_header_level_1, text,
 * unordered_list, list_item, table, otsl, code, formula, caption, etc.
 */
function mapTagType(tagName: string): DoclingBlock['type'] {
	if (tagName.startsWith('section_header')) return 'heading';
	if (tagName === 'text' || tagName === 'paragraph') return 'paragraph';
	if (tagName === 'table' || tagName === 'otsl') return 'table';
	if (tagName === 'formula') return 'equation';
	if (tagName === 'code') return 'other';
	if (tagName === 'caption' || tagName === 'footnote') return 'paragraph';
	if (tagName === 'page_header') return 'heading';
	if (tagName === 'page_footer') return 'other';
	if (tagName === 'list_item') return 'list';
	if (tagName === 'unordered_list' || tagName === 'ordered_list') return 'list';
	if (tagName === 'picture' || tagName === 'figure') return 'image';
	return 'other';
}

/** Strip <loc_NNN> bounding box tags from text content */
function stripLocTags(text: string): string {
	return text.replace(/<loc_\d+>/g, '').trim();
}

/**
 * Parse Granite-Docling DocTags output into DoclingBlock array.
 *
 * Real output format (from Ollama):
 * <doctag>
 *   <section_header_level_1><loc_25><loc_19>CONTRACT AGREEMENT</section_header_level_1>
 *   <text><loc_24><loc_61>Parties: John Smith v. Acme Corp</text>
 *   <unordered_list><list_item><loc_25><loc_203>(a) Payment...</list_item></unordered_list>
 * </doctag>
 */
function parseDocTags(raw: string, pageNumber = 1): DoclingBlock[] {
	const blocks: DoclingBlock[] = [];

	// Extract bounding box from loc tags: <loc_x1><loc_y1><loc_x2><loc_y2>
	const extractBbox = (s: string): [number, number, number, number] | undefined => {
		const locs = [...s.matchAll(/<loc_(\d+)>/g)].map((m) => Number(m[1]));
		if (locs.length >= 4) return [locs[0], locs[1], locs[2], locs[3]];
		return undefined;
	};

	// Match leaf-level content tags (tags that directly contain text, not wrapper tags)
	// Handles: section_header_level_1, text, list_item, table, code, formula, caption, etc.
	const leafPattern =
		/<(section_header(?:_level_\d+)?|text|paragraph|list_item|table|otsl|code|formula|caption|footnote|page_header|page_footer|picture|figure|checkbox)>([\s\S]*?)<\/\1>/g;

	let match: RegExpExecArray | null;
	let foundTags = false;

	while ((match = leafPattern.exec(raw)) !== null) {
		foundTags = true;
		const tagName = match[1];
		const innerRaw = match[2];
		const content = stripLocTags(innerRaw);
		if (!content) continue;

		blocks.push({
			type: mapTagType(tagName),
			text: content,
			page: pageNumber,
			bbox: extractBbox(innerRaw),
		});
	}

	// If no tags found, treat entire response as paragraph (fallback)
	if (!foundTags && raw.trim()) {
		const cleaned = stripLocTags(raw.replace(/<\/?doctag>/g, '').trim());
		if (cleaned) {
			blocks.push({
				type: 'paragraph',
				text: cleaned,
				page: pageNumber,
			});
		}
	}

	return blocks;
}

// ── PDF Page Rendering ──────────────────────────────────────────────────

/**
 * Render a single PDF page to a PNG buffer using pdfjs-dist + @napi-rs/canvas.
 * Both packages are already in the dependency tree (pdfjs-dist for PDFViewer,
 * @napi-rs/canvas as pdfjs-dist peer dependency).
 */
async function renderPdfPageToImage(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const { createCanvas } = await import('@napi-rs/canvas');

	const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
	if (pageNumber > pdfDoc.numPages) {
		throw new Error(`Page ${pageNumber} exceeds PDF page count (${pdfDoc.numPages})`);
	}

	const page = await pdfDoc.getPage(pageNumber);
	const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
	const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
	const ctx = canvas.getContext('2d');

	// White background (scanned docs may have transparent BG)
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	await page.render({ canvasContext: ctx as any, viewport }).promise;
	const pngBuffer = canvas.toBuffer('image/png');

	// Cleanup
	page.cleanup();
	pdfDoc.destroy();

	return Buffer.from(pngBuffer);
}

/**
 * Get the number of pages in a PDF.
 */
async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
	const count = pdfDoc.numPages;
	pdfDoc.destroy();
	return count;
}

// ── Main Analysis Functions ─────────────────────────────────────────────

/**
 * Analyze a document image using Granite-Docling-258M via Ollama.
 *
 * Supported instructions:
 *   "Convert this page to docling."  — full page (default)
 *   "<chart>"                         — chart to table
 *   "<formula>"                       — formula to LaTeX
 *   "<code>"                          — code extraction
 *   "<otsl>"                          — table to OTSL
 *
 * @param imageBuffer - Raw image buffer (PNG, JPG, TIFF, BMP, WebP)
 * @param instruction - Docling instruction (default: full page conversion)
 * @returns DoclingResult matching the existing docling.ts interface
 */
export async function analyzeImageWithGraniteDocling(
	imageBuffer: Buffer,
	instruction = 'Convert this page to docling.'
): Promise<DoclingResult> {
	const startTime = Date.now();
	const base64Image = imageBuffer.toString('base64');
	const model = ENV.GRANITE_DOCLING_MODEL;

	const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			prompt: instruction,
			images: [base64Image],
			stream: false,
			options: { temperature: 0, num_predict: 8192 },
		}),
		signal: AbortSignal.timeout(GRANITE_DOCLING_TIMEOUT),
	});

	if (!ollamaRes.ok) {
		const errText = await ollamaRes.text().catch(() => '');
		throw new Error(`Granite-Docling Ollama error (${ollamaRes.status}): ${errText}`);
	}

	const data = await ollamaRes.json();
	const rawResponse: string = data.response ?? '';
	const blocks = parseDocTags(rawResponse);
	const fullText = blocks.map((b) => b.text).join('\n\n');

	return {
		fullText,
		blocks,
		pageCount: 1,
		processingTimeMs: Date.now() - startTime,
	};
}

/**
 * Analyze a PDF document using Granite-Docling-258M.
 *
 * Renders each page to an image via pdfjs-dist + @napi-rs/canvas,
 * then sends each page through Granite-Docling for structured extraction.
 *
 * @param pdfBuffer - Raw PDF file buffer
 * @param maxPages - Maximum pages to process (default: 10, prevents runaway on huge PDFs)
 * @returns DoclingResult with blocks from all pages, page numbers preserved
 */
export async function analyzePdfWithGraniteDocling(
	pdfBuffer: Buffer,
	maxPages = 10
): Promise<DoclingResult> {
	const startTime = Date.now();
	const totalPages = await getPdfPageCount(pdfBuffer);
	const pagesToProcess = Math.min(totalPages, maxPages);
	const allBlocks: DoclingBlock[] = [];

	console.log(`[Granite-Docling] Processing ${pagesToProcess}/${totalPages} PDF pages`);

	for (let i = 1; i <= pagesToProcess; i++) {
		try {
			const pageImage = await renderPdfPageToImage(pdfBuffer, i);
			const base64 = pageImage.toString('base64');

			const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: ENV.GRANITE_DOCLING_MODEL,
					prompt: 'Convert this page to docling.',
					images: [base64],
					stream: false,
					options: { temperature: 0, num_predict: 8192 },
				}),
				signal: AbortSignal.timeout(GRANITE_DOCLING_TIMEOUT),
			});

			if (!ollamaRes.ok) {
				console.warn(`[Granite-Docling] Page ${i} failed (${ollamaRes.status}), skipping`);
				continue;
			}

			const data = await ollamaRes.json();
			const rawResponse: string = data.response ?? '';
			const pageBlocks = parseDocTags(rawResponse, i);
			allBlocks.push(...pageBlocks);

			console.log(`[Granite-Docling] Page ${i}/${pagesToProcess}: ${pageBlocks.length} blocks`);
		} catch (err) {
			console.warn(`[Granite-Docling] Page ${i} error:`, err);
			continue;
		}
	}

	const fullText = allBlocks.map((b) => b.text).join('\n\n');

	return {
		fullText,
		blocks: allBlocks,
		pageCount: totalPages,
		processingTimeMs: Date.now() - startTime,
	};
}