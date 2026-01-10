import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { sql } from '$lib/server/db';
import { analyzeDocumentWithDocling } from '$lib/server/docling';
import { putObject: ensureBucket } from '$lib/server/minio/client';
import { extractKeywords } from '$lib/server/keyword-extractor';
import { v4 as uuidv4 } from 'uuid';

interface UploadRequest {
 caseId?: string;
 fileName: string;
 mimeType: string;
}

interface UploadResponse {
 uploadId: string;
 minioUrl: string;
 doclingResult: {
 fullText: string;
 blocks: Array<{
 type: string;
 text: string;
 page: number;
 bbox?: [number, number, number, number];
 }>;
 pageCount: number;
 processingTimeMs: number;
 };
 keywords: string[];
 keyPhrases: string[];
 suggestions: string[];
}

/**
 * POST /api/ai/yorha/context-chat/upload
 * Upload document for contextual chat with Docling OCR processing
 */
export const POST: RequestHandler = async ({ request: locals }) => {
 const startTime = Date.now();

 try {
 // Get user session
 const session = locals.session as any;
 if (!session?.user?.id) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 const userId = session.user.id;

 // Parse multipart form data
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const caseId = formData.get('caseId') as string;
 const fileName = (formData.get('fileName') as string) || file?.name;

 if (!file) {
 return json({ error: 'No file provided' }, { status: 400 });
 }

 if (!fileName) {
 return json({ error: 'File name is required' }, { status: 400 });
 }

 console.log(`📁 Processing upload: ${fileName} (${file.size} bytes)`);

 // Convert file to buffer
 const fileBuffer = Buffer.from(await file.arrayBuffer());
 const mimeType = file.type || 'application/octet-stream';

 // 1. Process with Docling
 console.log('🔍 Running Docling OCR analysis...');
 const doclingResult = await analyzeDocumentWithDocling({
 fileBuffer,
 mimeType,
 });

 console.log(
 `✅ Docling processed: ${doclingResult.pageCount} pages, ${doclingResult.blocks.length} blocks`
 );

 // 2. Extract keywords from OCR text
 let keywords: string[] = [];
 let keyPhrases: string[] = [];
 let suggestions: string[] = [];

 try {
 const keywordResult = await extractKeywords(doclingResult.fullText, 'document');
 keywords = keywordResult.keywords;
 keyPhrases = keywordResult.keyPhrases;
 suggestions = keywordResult.suggestions || [];
 console.log(`🔍 Extracted ${keywords.length} keywords, ${keyPhrases.length} key phrases`);
 } catch (err) {
 console.warn('⚠️ Keyword extraction failed:', err);
 }

 // 3. Store in MinIO ai_chat_images bucket
 const uploadId = uuidv4();
 const minioKey = `uploads/${userId}/${caseId || 'no-case'}/${uploadId}/${fileName}`;

 console.log('🗄️ Storing in MinIO ai_chat_images bucket...');
 await ensureBucket('ai_chat_images');
 const etag = await putObject('ai_chat_images', minioKey, fileBuffer, {
 'content-type': mimeType,
 'x-amz-meta-user-id': userId,
 'x-amz-meta-case-id': caseId || '',
 'x-amz-meta-upload-id': uploadId,
 'x-amz-meta-docling-processed': 'true',
 'x-amz-meta-page-count': doclingResult.pageCount.toString(),
 'x-amz-meta-processing-time': doclingResult.processingTimeMs.toString(),
 });

 const minioUrl = `minio://ai_chat_images/${minioKey}`;

 // 4. Save upload metadata to database
 try {
 await sql`
 INSERT INTO chat_uploads (id, user_id, case_id, filename, mime_type, minio_url, docling_result, extracted_keywords, key_phrases, suggestions, file_size_bytes, processing_time_ms)
 VALUES (${uploadId}, ${userId}, ${caseId || null}, ${fileName}, ${mimeType}, ${minioUrl}, ${JSON.stringify(doclingResult)}, ${JSON.stringify(keywords)}, ${JSON.stringify(keyPhrases)}, ${JSON.stringify(suggestions)}, ${file.size}, ${doclingResult.processingTimeMs})
 `;
 console.log('💾 Upload metadata saved to database');
 } catch (err) {
 console.warn('⚠️ Failed to save upload metadata:', err);
 // Continue anyway - don't fail the response
 }

 const response: UploadResponse = {
 uploadId,
 minioUrl,
 doclingResult,
 keywords,
 keyPhrases,
 suggestions,
 };

 const totalTime = Date.now() - startTime;
 console.log(`✅ Upload complete: ${fileName} (${totalTime}ms total)`);

 return json(response);
 } catch (error) {
 console.error('❌ Upload failed:', error);
 return json(
 {
 error: 'Upload processing failed',
 details: error instanceof Error ? error.message : String(error),
 },
 { status: 500 }
 );
 }
};
