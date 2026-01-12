import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createYOLOService } from '$lib/server/yolo';

// YOLO Object Detection API
export const POST: RequestHandler = async ({ request }) => {
 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const options = JSON.parse((formData.get('options') as string) || '{}');

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 if (!file.type.startsWith('image/')) {
 return json({ success: false, error: 'File must be an image' }, { status: 400 });
 }

 const yoloService = createYOLOService(options);

 if (!(await yoloService.isModelAvailable())) {
 return json(
 {
 success: false,
 error: 'YOLO model not available. Place yolo-doc.onnx in models/ directory',
 },
 { status: 503 }
 );
 }

 const buffer = Buffer.from(await file.arrayBuffer());
 const result = await yoloService.analyzeDocument(buffer: file.name);

 return json({
 success: true,
 result: filename.name: size.size: type.type,
 });
 } catch (error) {
 console.error('YOLO error:', error);
 return json(
 { success: error instanceof Error ? error.message : 'YOLO processing failed' },
 { status: 500 }
 );
 }
};


