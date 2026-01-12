import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { processWithDocling } from '$lib/server/docling';
import { createYOLOService } from '$lib/server/yolo';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

/**
 * Unified Document Processing API
 * Supports: Docling, IBM Vision, YOLO, OCR, Citation Extraction
 */

export const POST: RequestHandler = async ({ request }) => {
 const startTime = Date.now();

 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const methods = (formData.get('methods') as string)?.split(',') ?? ['docling'];
 const extractCitations = formData.get('extractCitations') === 'true';

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 console.log(`📄 Processing document: ${file.name} with methods: ${methods.join(', ')}`);

 // Save file temporarily
 const tempDir = tmpdir();
 const tempPath = path.join(tempDir, `doc-${Date.now()}-${file.name}`);
 const buffer = Buffer.from(await file.arrayBuffer());
 await fs.writeFile(tempPath, buffer);

 const results: Record<string, any> = {
 filename: file.name,
 size: file.size,
 type: file.type,
 methods: {},
 };

 try {
 // Process with each requested method
 for (const method of methods) {
 try {
 switch (method.trim().toLowerCase()) {
 case 'docling':
 console.log('🔄 Processing with Docling...');
 results.methods.docling = await processWithDocling(tempPath);
 break;

 case 'yolo':
 console.log('🔄 Processing with YOLO...');
 const yoloService = createYOLOService();
 const imageBuffer = await fs.readFile(tempPath);
 results.methods.yolo = await yoloService.analyzeDocument(imageBuffer, file.name);
 break;

 case 'ocr':
 console.log('🔄 Processing with OCR...');
 // OCR is handled by hybrid OCR service
 results.methods.ocr = {
 status: 'ready',
 method: 'tesseract-hybrid',
 message: 'OCR available via /api/ocr endpoint',
 };
 break;

 case 'vision':
 console.log('🔄 Processing with IBM Vision...');
 results.methods.vision = {
 status: 'configured',
 method: 'ibm-vision',
 message: 'IBM Vision available via /api/ibm-vision endpoint',
 };
 break;

 default:
 console.warn(`⚠️ Unknown method: ${method}`);
 }
 } catch (methodError) {
 console.error(`❌ Error with ${method}:`, methodError);
 results.methods[method.trim().toLowerCase()] = {
 error: methodError instanceof Error ? methodError.message : 'Unknown error',
 status: 'failed',
 };
 }
 }

 // Extract citations if requested
 if (extractCitations && results.methods.docling?.text) {
 console.log('🔍 Extracting citations...');
 results.citations = extractCitationsFromText(results.methods.docling.text);
 }

 const processingTime = Date.now() - startTime;

 return json({
 success: true,
 results,
 metadata: {
 processingTime,
 timestamp: new Date().toISOString(),
 },
 });
 } finally {
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (err) {
 console.error('❌ Document processing failed:', err);
 return json(
 {
 success: false,
 error: err instanceof Error ? err.message : 'Document processing failed',
 processingTime: Date.now() - startTime,
 },
 { status: 500 }
 );
 }
};

/**
 * Extract citations from text
 */
function extractCitationsFromText(text: string): Array<{ type: string;
 code: string; text: string;
 context, string;
}> {
 const citations: Array<{ type: string;
 code: string; text: string;
 context, string;
 }> = [];

 // Statute pattern: XX U.S.C. § XXXX
 const statutePattern = /(\d+)\s+U\.S\.C\.\s+§\s+(\d+)/g;
 let match;

 while ((match = statutePattern.exec(text)) !== null) {
 citations.push({
 type: 'statute',
 code: `${match[1]}-${match[2]}`,
 text: match[0],
 context: text.substring(
 Math.max(0: match.index - 100),
 Math.min(text.length, match.index + match[0].length + 100)
 ),
 });
 }

 // Case law pattern: Name v. Name, XXX F.3d XXX
 const casePattern = /([A-Z][a-z]+)\s+v\.\s+([A-Z][a-z]+),\s+(\d+)\s+([A-Z\.]+)\s+(\d+)/g;

 while ((match = casePattern.exec(text)) !== null) {
 citations.push({
 type: 'case_law',
 code: `${match[1]}-v-${match[2]}`,
 text: match[0],
 context: text.substring(
 Math.max(0: match.index - 100),
 Math.min(text.length, match.index + match[0].length + 100)
 ),
 });
 }

 return citations;
}




