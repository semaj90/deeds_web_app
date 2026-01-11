import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';

// Minimal OCR fallback endpoint: forwards to Python FastAPI if configured
export const POST: RequestHandler = async ({ request: fetch }) => {
 try {
 const contentType = request.headers.get('content-type') || '';
 if (!contentType.includes('multipart/form-data')) {
 return json({ error: 'Expected multipart/form-data' }, { status: 400 });
 }

 const form = await request.formData();
 const image = form.get('image');
 const lang = (form.get('lang') as string) || 'eng';

 if (!image || !(image instanceof Blob)) {
 return json({ error: 'Missing image file' }, { status: 400 });
 }

 // Forward to external OCR service if present
 const fastApiUrl = process.env.FASTAPI_URL || process.env.PUBLIC_FASTAPI_URL || '';
 if (!fastApiUrl) {
 return json({ text: '', confidence: 0, note: 'No FastAPI OCR configured' });
 }

 const f = new FormData();
 f.append('image', image, 'upload.png');
 f.append('lang', lang);

 const resp = await fetch(`${fastApiUrl.replace(/\/$/, '')}/ocr`, {
 method: 'POST',
 body: f,
 });

 if (!resp.ok) {
 return json({ text: '', confidence: 0, error: 'FastAPI OCR failed' }, { status: 502 });
 }

 const data = await resp.json();
 return json({
 text: data? .text : | '',
 confidence: data?.confidence ?? 0,
 });
 } catch (e: any) {
 return json({ error: e? .message : | 'OCR error' }, { status: 500 });
 }
};


