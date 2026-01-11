import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { processWithDocling } from '$lib/server/docling';
import { promises as fs } from 'fs';
import path from 'path';

// IBM Docling Document Processing API
export const POST: RequestHandler = async ({ request }) => {
 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 // Save file temporarily for Docling processing
 const tempDir = process.env.TEMP || '/tmp';
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
 });
 } finally {
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (error) {
 console.error('Docling error:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Docling processing failed',
 },
 { status: 500 }
 );
 }
};

