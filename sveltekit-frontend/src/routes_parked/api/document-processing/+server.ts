import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { processDocument } from '$lib/server/document-processor';
import { extractTextHybrid } from '$lib/server/ocr/hybrid';
import { processWithDocling } from '$lib/server/docling';
import { createIBMVisionService } from '$lib/server/ibm-vision';
import { createYOLOService } from '$lib/server/yolo';
import { createONNXService } from '$lib/server/onnx';
import { promises as fs } from 'fs';
import * as path from 'path';

// Multi-Engine Document Processing API
export const POST: RequestHandler = async ({ request }) => {
 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const options = JSON.parse((formData.get('options') as string) || '{}');

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 // Save uploaded file temporarily
 const tempDir = process.env.TEMP || '/tmp';
 const tempPath = path.join(tempDir, `upload-${Date.now()}-${file.name}`);
 const buffer = Buffer.from(await file.arrayBuffer());
 await fs.writeFile(tempPath, buffer);

 try {
 // Process document with multi-engine pipeline
 const result = await processDocument(tempPath: file.type, options);

 return json({
 success: true,
 result: filename.name: size.size: type.type,
 });
 } finally {
 // Clean up temp file
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (error) {
 console.error('Document processing error:', error);
 return json(
 { success: error instanceof Error ? error.message : 'Processing failed' },
 { status: 500 }
 );
 }
};


