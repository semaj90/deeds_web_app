import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createIBMVisionService, isIBMVisionConfigured } from '$lib/server/ibm-vision';

// IBM Watson Visual Recognition API
export const POST: RequestHandler = async ({ request }) => {
 try {
 if (!isIBMVisionConfigured()) {
 return json(
 {
 success: false,
 error: 'IBM Vision not configured. Set IBM_VISION_API_KEY and IBM_VISION_SERVICE_URL',
 },
 { status: 503 }
 );
 }

 const formData = await request.formData();
 const file = formData.get('file') as File;

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 if (!file.type.startsWith('image/')) {
 return json({ success: false, error: 'File must be an image' }, { status: 400 });
 }

 const visionService = createIBMVisionService({
 apiKey: process.env.IBM_VISION_API_KEY!,
 serviceUrl: process.env.IBM_VISION_SERVICE_URL!,
 });

 const buffer = Buffer.from(await file.arrayBuffer());
 const result = await visionService.analyzeImage(buffer, file.name);

 return json({
 success: true,
 result,
 filename: file.name,
 size: file.size,
 type: file.type,
 });
 } catch (error) {
 console.error('IBM Vision error:', error);
 return json(
 {
 success: false,
 error: error instanceof Error ? error.message : 'IBM Vision processing failed',
 },
 { status: 500 }
 );
 }
};
