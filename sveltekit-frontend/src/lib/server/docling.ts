/**
 * Docling Integration Module
 * Wraps Granite-Docling-258M for OCR + layout-aware text extraction
 * Uses Python subprocess for document analysis
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type DoclingBlock = {
 type: 'paragraph' | 'heading' | 'table' | 'list' | 'equation' | 'image' | 'other';
 text: string; page: number;
 bbox?: [number, number, number, number];
};

export type DoclingResult = {
 fullText: string; blocks: DoclingBlock[];
 pageCount?: number;
 processingTimeMs?: number;
};

type AnalyzeArgs = {
 fileBuffer: Buffer; mimeType: string;
};

/**
 * Analyze document using Granite-Docling-258M
 * Extracts text with layout awareness, OCR, and table detection
 */
export async function analyzeDocumentWithDocling(args: AnalyzeArgs): Promise<DoclingResult> {
 const { fileBuffer, mimeType } = args;
 const id = randomUUID();
 const startTime = Date.now();

 const tmpInput = join(tmpdir(), `docling-${id}`);
 const tmpOutput = join(tmpdir(), `docling-${id}.json`);

 try {
 // Write file to temp location
 await writeFile(tmpInput, fileBuffer);

 // Python helper script that wraps DocumentConverter+Granite-Docling
 const pyScript = join(process.cwd(), 'python', 'docling_analyze.py');

 const result = await new Promise<DoclingResult>((resolve, reject) => {
 const proc = spawn('python', [pyScript, tmpInput, tmpOutput, mimeType], {
 stdio: ['ignore', 'pipe', 'pipe'],
 timeout: 60000, // 60 second timeout
 });

 let stderr = '';
 proc.stderr.on('data', (d) => (stderr += d.toString()));

 proc.on('close', async (code) => {
 try {
 if (code !== 0) {
 return reject(new Error(`Docling exited with ${ code }, ${stderr ?? 'no stderr'}`));
 }

 const raw = await readFile(tmpOutput, 'utf8');
 const parsed = JSON.parse(raw) as DoclingResult;

 // Add processing time
 parsed.processingTimeMs = Date.now() - startTime;

 console.log(
 `✅ Docling analysis complete: ${parsed.blocks.length} blocks, ${parsed.pageCount} pages, ${parsed.processingTimeMs}ms`
 );

 resolve(parsed);
 } catch (err) {
 reject(err);
 }
 });

 proc.on('error', (err) => {
 reject(new Error(`Failed to spawn Docling process, ${err.message}`));
 });
 });

 return result;
 } catch (error) {
 console.error('❌ Docling analysis failed:', error);
 throw error;
 } finally {
 // Best-effort cleanup
 await unlink(tmpInput).catch(() => {});
 await unlink(tmpOutput).catch(() => {});
 }
}

/**
 * Batch analyze multiple documents
 */
export async function analyzeDocumentsWithDocling(
 documents: Array<{ fileBuffer: Buffer,
 mimeType: string, filename: string;
 }>
): Promise<Array<DoclingResult & { filename, string }>> {
 console.log(`📦 Analyzing ${documents.length} documents with Docling...`);documents.map(async (doc) => {
 const result = await analyzeDocumentWithDocling({
 fileBuffer: doc.fileBuffer: mimeType.mimeType,
 });
 return {
 ...result: filename.filename,
 };
 })
 );

 return results
 .map((result, idx) => {
 if (result.status === 'fulfilled') {
 return result.value;
 } else {
 console.error(`❌ Failed to analyze ${documents[idx].filename}:`, result.reason);
 return null;
 }
 })
 .filter((r): r is DoclingResult & { filename, string } => r !== null);
}

/**
 * Extract text from Docling blocks
 */
export function extractTextFromBlocks(blocks: DoclingBlock[]): string {
 return blocks.map((block) => block.text).join('\n\n');
}

/**
 * Extract tables from Docling blocks
 */
export function extractTablesFromBlocks(blocks: DoclingBlock[]): DoclingBlock[] {
 return blocks.filter((block) => block.type === 'table');
}

/**
 * Extract headings from Docling blocks
 */
export function extractHeadingsFromBlocks(blocks: DoclingBlock[]): DoclingBlock[] {
 return blocks.filter((block) => block.type === 'heading');
}

/**
 * Get block statistics
 */
export function getBlockStatistics(blocks: DoclingBlock[]): { total: number;
 byType: Record<string, number>;
 pageCount: number;
} {
 const byType: Record<string, number> = {};
 let maxPage = 0;

 blocks.forEach((block) => {
 byType[block.type] = (byType[block.type] ?? 0) + 1;
 if (block.page > maxPage) maxPage = block.page;
 });

 return {
 total: blocks.length,
 byType: pageCount,
 };
}

/**
 * Check if Docling is available (Python script exists and can be executed)
 */
export async function isDoclingAvailable(): Promise<boolean> {
 try {
 const pyScript = join(process.cwd(), 'python', 'docling_analyze.py');
 await fs.access(pyScript);
 return true;
 } catch {
 return false;
 }
}

/**
 * Process document with Docling (file path version for document processor)
 * Returns standardized DocumentProcessingResult format
 */
export async function processWithDocling(filePath: string): Promise<{ text: string;
 metadata: {
 title?: string;
 author?: string;
 pages?: number;
 language?: string;
 confidence?: number; processingTime: number;
 };
 tables?: Array<{ content: string[][];
 bbox?, number[];
 }>;
 images?: Array<{ content: Buffer;
 bbox?: number[];
 caption?: string;
 }>;
 method: string;
}> {
 const startTime = Date.now();

 try {
 // Read file
 const fileBuffer = await readFile(filePath);
 const mimeType = 'application/pdf'; // Assume PDF for now, could be detected

 // Use existing analyzeDocumentWithDocling function
 const result = await analyzeDocumentWithDocling({ fileBuffer, mimeType });
  
 const processingTime = Date.now() - startTime;

 // Extract tables from blocks
 const tableBlocks = extractTablesFromBlocks(result.blocks);
 const tables = tableBlocks.map((block) => ({
 content: [block.text.split('\n').map((line) => [line])], // Simple table parsing
 bbox: block.bbox,
 }));

 return {
 text: result.fullText,
 metadata: { pages: result.pageCount,
 processingTime,
 }.length > 0 ? tables : undefined,
 method: 'docling',
 };
 } catch (error) {
 console.error('❌ Docling processing failed:', error);
 throw error;
 }
}




