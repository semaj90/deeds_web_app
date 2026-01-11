import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createYOLOService } from '$lib/server/yolo';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

/**
 * YOLO Object Detection Endpoint
 * Detects stamps, signatures, form fields, redactions, and document layout
 */

export const POST: RequestHandler = async ({ request }) => {
 const startTime = Date.now();

 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const confidence = parseFloat((formData.get('confidence') as string) || '0.5');
 const iouThreshold = parseFloat((formData.get('iouThreshold') as string) || '0.45');

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 console.log(`🎯 YOLO: Processing ${file.name} (confidence: ${confidence})`);

 // Save file temporarily
 const tempDir = tmpdir();
 const tempPath = path.join(tempDir, `yolo-${Date.now()}-${file.name}`);
 const buffer = Buffer.from(await file.arrayBuffer());
 await fs.writeFile(tempPath, buffer);

 try {
 const yoloService = createYOLOService({
 confidence,
 iouThreshold,
 });

 const result = await yoloService.analyzeDocument(buffer, file.name);

 return json({
 success: true,
 result,
 filename: file.name,
 size: file.size,
 type: file.type,
 config: {
 confidence,
 iouThreshold,
 },
 processingTime: Date.now() - startTime,
 timestamp: new Date().toISOString(),
 });
 } finally {
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (error) {
 console.error('❌ YOLO error:', error);
 return json(
 {
 success: false,
 error: error instanceof Error ? error.message : 'YOLO processing failed',
 processingTime: Date.now() - startTime,
 },
 { status: 500 }
 );
 }
};
