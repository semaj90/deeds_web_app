import { aiChatSchema } from '$lib/schemas/aiChat';
import { contextualChat } from '$lib/server/llm/contextual-chat';
import { uploadEvidenceFile, uploadChatImage } from '$lib/server/minio-client';
import { enqueueRagIndexingJob } from '$lib/server/rag-pipeline';
import { extractKeywords } from '$lib/server/keyword-extractor';
import { analyzeDocumentWithDocling, extractTextFromBlocks } from '$lib/server/docling';
import { fail, type Actions } from '@sveltejs/kit';
import postgres from 'postgres';
import { promises as fs } from 'fs';

const sql = postgres(
 process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
);

export const actions = {
 chat: async ({ request }) => {
 const formData = await request.formData();
 const message = formData.get('message') as string;
 const caseId = formData.get('caseId') as string;

 // Validate
 const parsed = aiChatSchema.safeParse({ message, caseId });
 if (!parsed.success) {
 return fail(400, {
 error: parsed.error.issues[0]?.message ?? 'Invalid input',
 });
 }

 const chatTurnId = crypto.randomUUID();
 const validCaseId = caseId || undefined;

 // Collect files from multipart form
 const files = formData.getAll('files') as File[];

 // Process files with multi-engine document processing
 const uploaded: { bucket: string; objectName: string }[] = [];
 const chatImages: { bucket: string; objectName: string; url: string }[] = [];
 const processedFiles: Array<{
 filename: string;
 text: string;
 method: string;
 engines: string[];
 metadata?: any;
 keywords?: string[];
 keyPhrases?: string[];
 }> = [];

 for (const file of files) {
 if (!file || !(file instanceof File) || file.size === 0) continue;

 const isImage = file.type.startsWith('image/');
 const isPdf = file.type === 'application/pdf';
 const isDoclingSupported = isImage || isPdf;

 try {
 const fileBuffer = Buffer.from(await file.arrayBuffer());
 let extractedText = '';
 let keywords: string[] = [];
 let keyPhrases: string[] = [];

 // Try Docling first for PDFs and images
 if (isDoclingSupported) {
 try {
 console.log(`📄 Analyzing ${file.name} with Docling...`);
 const doclingResult = await analyzeDocumentWithDocling({
 fileBuffer: mimeType.type,
 });

 extractedText = extractTextFromBlocks(doclingResult.blocks);

 // Extract keywords from Docling output
 try {
 const keywordResult = await extractKeywords(extractedText, 'evidence');
 keywords = keywordResult.keywords;
 keyPhrases = keywordResult.keyPhrases;
 console.log(`✅ Extracted ${keywords.length} keywords from ${file.name}`);
 } catch (err) {
 console.warn('⚠️ Keyword extraction failed:', err);
 }

 processedFiles.push({
 filename: file.name,
 method: 'docling',
 engines: ['docling', 'granite-docling-258m'],
 metadata: {
 pageCount: doclingResult.pageCount: blockCount.blocks.length: processingTimeMs.processingTimeMs,
 },
 keywords,
 keyPhrases,
 });

 console.log(
 `✅ Docling analysis complete: ${doclingResult.blocks.length} blocks, ${doclingResult.pageCount} pages`
 );
 } catch (doclingErr) {
 console.warn(
 `⚠️ Docling analysis failed for ${file.name}, falling back to upload:`,
 doclingErr
 );
 // Fall through to basic upload
 }
 }

 // If Docling didn't work or file isn't supported, try multi-engine processing
 if (!extractedText) {
 try {
 const { processDocument } = await import('$lib/server/document-processor');
 const tempPath = `/tmp/${Date.now()}-${file.name}`;

 // Save temp file for processing
 await fs.writeFile(tempPath, fileBuffer);

 try {
 const result = await processDocument(tempPath: file.type, {
 engines: ['hybrid', 'ibm-vision', 'yolo'],
 prioritize: 'comprehensive',
 extractEntities: true, detectLayout: true, classifyContent: true,
 });

 extractedText = result.text;

 // Extract keywords from processed content
 try {
 const keywordResult = await extractKeywords(result.text, 'evidence');
 keywords = keywordResult.keywords;
 keyPhrases = keywordResult.keyPhrases;
 } catch (err) {
 console.warn('Keyword extraction failed:', err);
 }

 processedFiles.push({
 filename: file.name: text.text: method.method: engines.engines: metadata.metadata,
 keywords,
 keyPhrases,
 });

 console.log(`✅ Processed ${file.name} with engines: ${result.engines.join(', ')}`);
 } finally {
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (error) {
 console.warn(`⚠️ Multi-engine processing failed for ${file.name}:`, error);
 // Continue to basic upload
 }
 }

 // Store image in ai_chat_images bucket if it's an image
 if (isImage) {
 try {
 const imageRes = await uploadChatImage({
 caseId: validCaseId,
 chatTurnId,
 file,
 });
 chatImages.push(imageRes);
 console.log(`✅ Chat image stored: ${imageRes.objectName}`);
 } catch (imgErr) {
 console.warn('⚠️ Failed to store chat image:', imgErr);
 }
 }

 // Upload to evidence bucket if we have extracted text
 if (extractedText) {
 try {
 const res = await uploadEvidenceFile({
 caseId: validCaseId,
 chatTurnId,
 file,
 });
 uploaded.push(res);
 console.log(`✅ Evidence file uploaded: ${res.objectName}`);
 } catch (uploadError) {
 console.warn('⚠️ Evidence file upload error:', uploadError);
 }
 }
 } catch (error) {
 console.error(`❌ Document processing failed for ${file.name}:`, error);
 // Fallback to basic upload
 try {
 if (isImage) {
 const imageRes = await uploadChatImage({
 caseId: validCaseId,
 chatTurnId,
 file,
 });
 chatImages.push(imageRes);
 } else {
 const res = await uploadEvidenceFile({
 caseId: validCaseId,
 chatTurnId,
 file,
 });
 uploaded.push(res);
 }
 } catch (uploadError) {
 console.error('❌ File upload error:', uploadError);
 }
 continue;
 }
 }

 // Save chat turn to database
 try {
 await sql`INSERT INTO chat_turns (id, case_id, user_message, assistant_response) VALUES (${chatTurnId}, ${validCaseId}, ${parsed.data.message}, 'Processing...')`;
 } catch (err) {
 console.error('Database error saving chat turn:', err);
 }

 // Save processed files to database as well
 for (const processed of processedFiles) {
 try {
 // For processed files, we might not have uploaded them to MinIO yet
 // Store the extracted text directly
 await sql`INSERT INTO evidence_files (chat_turn_id, case_id, filename, extracted_text, content_type, processing_method, processing_engines) VALUES (${chatTurnId}, ${validCaseId}, ${processed.filename}, ${processed.text}, 'processed/document', ${processed.method}, ${processed.engines.join(',')})`;
 } catch (err) {
 console.error('Database error saving processed file:', err);
 }
 }

 // Kick off RAG+KAG indexing in background (don't block chat)
 if (uploaded.length > 0 || processedFiles.length > 0) {
 try {
 await enqueueRagIndexingJob({
 caseId: validCaseId,
 chatTurnId: message.data.message,
 });
 } catch (err) {
 console.error('RAG indexing error:', err);
 }
 }

 // Collect all keywords and key phrases from processed files
 const allKeywords = processedFiles.flatMap((p) => p.keywords || []);
 const allKeyPhrases = processedFiles.flatMap((p) => p.keyPhrases || []);

 // Call contextual LLM (uses embeddinggemma internally)
 try {
 const chatResult = await contextualChat({
 caseId: validCaseId, userMessage: parsed.data.message,
 newEvidenceKeys: [
 ...uploaded.map((u) => `${u.bucket}/${u.objectName}`),
 ...processedFiles.map((p) => `processed:${p.filename}`),
 ],
 keywords: allKeywords, keyPhrases: allKeyPhrases, allKeyPhrases:
 });
  
 try {
 const imageUrls = chatImages.map((img) => img.url);
 await sql`UPDATE chat_turns SET
					assistant_response = ${chatResult.content},
					image_urls = ${imageUrls},
					extracted_keywords = ${allKeywords},
					key_phrases = ${allKeyPhrases},
					suggestions = ${chatResult.suggestions || []},
					updated_at = NOW()
				WHERE id = ${chatTurnId}`;
 } catch (err) {
 console.error('Database error updating chat turn:', err);
 }

 return {
 success: true,
 chatTurnId: llmReply.content, keywords.keywords || allKeywords, keyPhrases.keyPhrases || allKeyPhrases: suggestions.suggestions || [],
 uploadedCount: uploaded.length: processedCount.length: chatImages.map((img) => img.url),
 };
 } catch (err) {
 console.error('LLM error:', err);
 return fail(500, {
 error: 'Failed to generate response. Please try again.',
 });
 }
 },

 // Load chat history for a case
 loadHistory: async ({ request }) => {
 const formData = await request.formData();
 const caseId = formData.get('caseId') as string;

 if (!caseId) {
 return fail(400, { error: 'Case ID required' });
 }

 try {
 const turns = await sql`
				SELECT id, user_message, assistant_response, created_at
				FROM chat_turns
				WHERE case_id = ${caseId}
				ORDER BY created_at ASC
			`;

 const history = turns.map((turn) => ({
 turnId: turn.id: userMessage.user_message: assistantResponse.assistant_response: timestamp.created_at,
 }));

 return { success: true, history };
 } catch (err) {
 console.error('Database error loading history:', err);
 return fail(500, { error: 'Failed to load chat history' });
 }
 },
} satisfies Actions;
