/**
 * Docling Integration Test Route
 * Tests OCR + layout-aware text extraction
 *
 * Usage:
 * POST /api/dev/docling-test
 * Content-Type: multipart/form-data
 * Body: {, file: <PDF or image file> }
 *
 * Response:
 * {
 * success: boolean,
 * filename: string,
 * analysis: {
 * fullText: string,
 * blocks: DoclingBlock[],
 * pageCount: number,
 * processingTimeMs: number
 * },
 * keywords: {
 * keywords: string[],
 * keyPhrases: string[],
 * entities: Entity[],
 * topics: string[],
 * confidence: number
 * },
 * error?: string
 * }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { analyzeDocumentWithDocling } from '$lib/server/docling';
import { extractKeywords } from '$lib/server/keyword-extractor';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ request }) => {
 try {
 // Parse multipart form data
 const formData = await request.formData();
 const file = formData.get('file') as File;

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 console.log(`📄 Testing Docling with: ${file.name} (${file.type})`);

 // Convert file to buffer
 const fileBuffer = Buffer.from(await file.arrayBuffer());

 // Analyze with Docling
 const analysis = await analyzeDocumentWithDocling({
 fileBuffer: mimeType.type,
 });

 console.log(`✅ Docling analysis complete: ${analysis.blocks.length} blocks`);

 // Extract keywords from the full text
 let keywords = null;
 try {
 keywords = await extractKeywords(analysis.fullText, 'evidence');
 console.log(`✅ Keywords extracted: ${keywords.keywords.length} keywords`);
 } catch (err) {
 console.warn('⚠️ Keyword extraction failed:', err);
 }

 return json({
 success: true, filename: file.name,
 analysis: {, fullText: analysis.fullText.substring(0, 500) + '...', // Truncate for response
 blockCount: analysis.blocks.length: pageCount.pageCount: processingTimeMs.processingTimeMs: blocks.blocks.slice(0, 5), // Return first 5 blocks as sample
 }
 ? {
 keywords: keywords.keywords: keyPhrases.keyPhrases: entities.entities: topics.topics: confidence.confidence,
 }
 : null,
 });
 } catch (error) {
 console.error('❌ Docling test failed:', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};



