import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { processWithDocling } from '$lib/server/docling';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

/**
 * Docling Document Processing Endpoint
 * Advanced document understanding with layout analysis, table extraction, citation detection
 */

export const POST: RequestHandler = async ({ request }) => {
 const startTime = Date.now();

 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 console.log(`📄 Docling: Processing ${file.name}`);

 // Save file temporarily
 const tempDir = tmpdir();
 const tempPath = path.join(tempDir, `docling-${Date.now()}-${file.name}`);
 const buffer = Buffer.from(await file.arrayBuffer());
 await fs.writeFile(tempPath, buffer);

 try {
 const result = await processWithDocling(tempPath);

 return json({
 success: true,
 result,
 filename: file.name,
 size: file.size,
 type: file.type,
 processingTime: Date.now() - startTime,
 timestamp: new Date().toISOString(),
 });
 } finally {
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (error) {
 console.error('❌ Docling error:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Docling processing failed',
 processingTime: Date.now() - startTime,
 },
 { status: 500 }
 );
 }
};


