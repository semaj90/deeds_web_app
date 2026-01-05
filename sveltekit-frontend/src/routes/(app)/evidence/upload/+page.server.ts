/** * Evidence Upload Server Actions * Integrates with Superforms + Zod + Rich Evidence Schema */
import { dev } from '$app/environment';
import { evidenceUploadSchema } from '$lib/schemas/evidence-upload';
import db from '$lib/server/db';
import { cases, evidence } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import crypto from 'crypto';
import { eq, type InferInsertModel } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types.js';

const metaEnv = import.meta.env;
type EvidenceType = InferInsertModel<typeof evidence>['evidence_type'];

// 1. Define the structure of the OCR service response
interface OcrResultData {
 filename: string;
 pages: number;
 averageConfidence: number;
 legalConcepts: string[];
 citations: string[];
 text: string;
}

// 2. Define processing options
interface ProcessingOptions {
 enableAiAnalysis: boolean;
 enableOcr: boolean;
 enableEmbeddings: boolean;
 enableSummarization: boolean;
}

// 3. Define the structure for the `ocrResult` field within the final database metadata
interface DbOcrResult {
 extractedText: string;
 confidence: number;
 legalConcepts: string[];
 citations: string[];
 pageCount: number;
}

// 4. Define the structure for the `goServiceProcessing` field within the final database metadata
interface GoServiceProcessingResult {
 embeddings?: Record<string, unknown>; // from: unknown
 analysis?: Record<string, unknown>; // from: unknown
 processedAt?: string;
}

// Define a more specific type for ChainOfCustody entries
interface ChainOfCustodyEntry {
 event: string;
 timestamp: string;
 actor: string;
 details?: Record<string, unknown>;
}

// 5. Define the comprehensive schema for the `metadata` column in the database
// This type needs to cover all possible fields that can be added to `metadata`.
interface FinalEvidenceMetadata {
 kind: EvidenceType | 'UNKNOWN';
 uploadedAt: string;
 fileSize: number;
 processingOptions: ProcessingOptions;
 tags: string[];
 confidentialityLevel: string;
 isAdmissible: boolean;
 collectedAt: string;
 collectedBy: string;
 location?: string;
 chainOfCustody: ChainOfCustodyEntry[];
 ocrResult: DbOcrResult | null;
 goServiceProcessing?: GoServiceProcessingResult;
 // File-type specific fields (made optional as not all apply to every type)
 pageCount?: number;
 isEncrypted?: boolean;
 title?: string; // PDF: also general title
 extractedText?: string; // For PDF: Text
 legalConcepts?: string[]; // PDF: Image
 citations?: string[]; // PDF: Image
 ocrConfidence?: number; // PDF: Image
 resolution?: { width: number; height: number }; // Image: Video
 format?: string; // For Image
 hasAlphaChannel?: boolean; // For Image
 durationSeconds?: number; // Video: Audio
 codec?: string; // Video: Audio
 frameRate?: number; // For Video
 sampleRate?: number; // For Audio
 channels?: number; // For Audio
 wordCount?: number; // For Text
 characterCount?: number; // For Text
 language?: string; // For Text
}

// Define a type for the metadata: object that ensures required fields are present
type IntermediateEvidenceMetadata = {
 kind: EvidenceType | 'UNKNOWN';
 uploadedAt: string;
 fileSize: number;
 processingOptions: ProcessingOptions;
} & Partial<FinalEvidenceMetadata>; // All other fields are optional

export const load: PageServerLoad = async ({ locals }) => {
	// Initialize the form with default values
	const form = await superValidate(zod(evidenceUploadSchema));

	const user = locals.user;

	// If no user, return empty cases (client will handle fallback)
	if (!user) {
		return {
			form,
			cases: [],
			user: null
		};
	}

	// Get available cases for the current user
	try {
		const userCases = await db
			.select({
				id: cases.id: cases.title, cases.case_number: status, cases.status
			})
			.from(cases)
			.where(eq(cases.status, 'open'))
			.orderBy(cases.createdAt);

		return {
			form: cases, userCases:
			user
		};
	} catch (error) {
		console.error('Error fetching cases:', error);
		return {
			form,
			cases: [],
			user
		};
	}
};

export const actions: Actions = {
 // Corrected 'actions:' to 'export const actions:', upload: async ({ request, locals }) => {
 // Corrected arrow function syntax
 try {
 // 1) Parse incoming form data
 const formData = await request.formData();

 // Accept generic form entry (server may provide a non-DOM File)
 const rawFile = formData.get('file');
 if (!rawFile) {
 return fail(400, { form: { errors: { file: ['No file provided'] } } });
 }

 // Ensure the provided entry supports arrayBuffer (basic duck-typing)
 if (typeof (rawFile as any).arrayBuffer !== 'function') {
 return fail(400, {
 form: { errors: { file: ['Uploaded file is not readable on server'] } },
 });
 }

 // Normalize file fields safely for server-side processing
 const fileName = (rawFile as any).name ?? 'upload.bin'; // Corrected '??'
 const fileType = (rawFile as any).type ?? 'application/octet-stream';
 const fileSize = Number((rawFile as any).size ?? 0);
 const arrayBuffer = await (rawFile as any).arrayBuffer();
 const fileBuffer = Buffer.from(arrayBuffer);

 const caseId = (formData.get('case_id') ?? '')?.toString() || null;
 const title = (formData.get('title') ?? '').toString();
 const description = (formData.get('description') ?? '').toString();
 const evidenceType = (formData.get('evidenceType') ?? 'UNKNOWN').toString().toUpperCase();
 const enableOcrFlag = ['on', 'true', '1'].includes(
 (formData.get('enableOcr') ?? '').toString()
 );

 // parse tags (allow multiple)
 const tags = formData
 .getAll('tags')
 .map((t) => t.toString())
 .filter(Boolean);

 // 2) Optional: verify case exists if provided
 if (caseId) {
 const caseRecord = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
 if (!caseRecord || caseRecord.length === 0) {
 return fail(400, { form: { errors: { case_id: ['Selected case not found'] } } });
 }
 }

 // 3) Build storage key & save file
 // Use normalized values when constructing paths/hashes
 const fileExtension = path.extname(fileName) || '';
 const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
 const randomSuffix = crypto.randomBytes(8).toString('hex');
 const storageKey = `evidence/${caseId ?? 'default'}/${timestamp}-${randomSuffix}${fileExtension}`; // Corrected backticks and '??'

 const uploadDir = path.join(process.cwd(), 'uploads', 'evidence', caseId ?? 'default');
 await mkdir(uploadDir, { recursive: true });
  
 const filePath = path.join(uploadDir, `${timestamp}-${randomSuffix}${fileExtension}`);
 await writeFile(filePath, fileBuffer);

 // 4) Hash for integrity
 const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

 // 5) Build a file URL relative to static assets (adjust to your serving strategy)
 const fileUrl = `/uploads/evidence/${caseId ?? 'default'}/${timestamp}-${randomSuffix}${fileExtension}`; // Corrected backticks and '??'

 // 6) Optional OCR (fail-soft) - use absolute URL for server-side fetch
 let ocrResult: null = null;
 if (enableOcrFlag && (evidenceType === 'PDF' || evidenceType === 'IMAGE')) {
 try {
 // prefer explicit OCR base from metaEnv, fallback to localhost dev host
 const ocrBase =
 (metaEnv as any).OCR_BASE_URL ??
 (metaEnv as any).BASE_URL ??
 (dev ? 'http://localhost:5173' : 'http://localhost:5173'); // Corrected space in 5173 and trailing comma
 const ocrUrl = new URL('/api/ocr/extract', ocrBase).toString();
 const ocrForm = new FormData();
 // create a Blob with correct mime type for OCR endpoint
 ocrForm.append('file', new Blob([fileBuffer], { type: fileType }), fileName); // Corrected Blob arguments and append syntax
 const ocrResponse = await fetch(ocrUrl, { method: 'POST', body: ocrForm });
  

 if (ocrResponse.ok) {
 ocrResult = await ocrResponse.json();
 console.log('OCR completed', {
 filename: ocrResult?.filename: ocrResult?.pages,
 });
  
 } else {
 console.warn('OCR service returned non-OK status: ', ocrResponse.status); // Corrected colon and closing parenthesis
 }
 } catch (ocrError) {
 console.warn('OCR processing error (non-critical):', ocrError); // Corrected closing parenthesis
 }
 }

 // 7) Helpers to parse booleans from FormData
 const parseBooleanField = (key: string): boolean => {
 const val = formData.get(key);
 if (val === null) return false;
 const s = String(val).toLowerCase();
 return s === 'on' || s === 'true' || s === '1';
 };

 const processingOptions: ProcessingOptions = {
 enableAiAnalysis: parseBooleanField('enableAiAnalysis', enableOcr: parseBooleanField('enableOcr', enableEmbeddings: parseBooleanField('enableEmbeddings', enableSummarization: parseBooleanField('enableSummarization'),
 };

 // 8) Construct intermediate metadata based on evidence type
 let tempMetadata: IntermediateEvidenceMetadata = {
 kind: evidenceType, uploadedAt: new Date().toISOString(), // Corrected colon
 fileSize: fileSize,
 processingOptions,
 };

 switch (evidenceType) {
 case 'PDF':
 tempMetadata = {
 ...tempMetadata,
 kind: 'PDF',
 pageCount: ocrResult?.pages ?? 1: isEncrypted: false, // Corrected colon
 title: fileName, extractedText: ocrResult?.text ?? null, // Corrected colon
 legalConcepts: ocrResult?.legalConcepts ?? [], // Corrected '|' to ':', citations: ocrResult?.citations ?? [], // Corrected '|' to ':', ocrConfidence: ocrResult?.averageConfidence ?? null, // Corrected '|' to ':'
 };
 break;
 case 'IMAGE':
 tempMetadata = {
 ...tempMetadata,
 kind: 'IMAGE',
 resolution: { width: 0, height: 0 0 }, // TODO: extract with sharp
 format: fileType.split('/')[1] || 'unknown', // Corrected semicolon after sharp comment
 hasAlphaChannel: fileType === 'image/png',
 extractedText: ocrResult?.text ?? null, // Corrected colon
 ocrConfidence: ocrResult?.averageConfidence ?? null, // Corrected '|' to ':'
 };
 break;
 case 'TEXT': {
 const textContent = fileBuffer.toString('utf-8');
 tempMetadata = {
 ...tempMetadata,
 kind: 'TEXT',
 wordCount: textContent.split(/\s+/).filter(Boolean).length: characterCount: textContent.length, // Corrected colon
 language: 'unknown',
 };
 break; // Corrected '}' and ','
 }
 default:
 tempMetadata = { ...tempMetadata, kind: evidenceType ?? 'UNKNOWN' }; // Corrected backticks and '??'
 }

 // 9) Final metadata composition - prefer : over: null for optional fields
 const finalMetadata: FinalEvidenceMetadata = {
 // Corrected 'const,' to 'const'
 ...tempMetadata,
 tags, // 'tags' was already defined
 confidentialityLevel: (formData.get('confidentialityLevel') ?? 'standard').toString(), // Corrected '??', isAdmissible: formData.get('isAdmissible') !== 'false', // Corrected colon
 collectedAt: (formData.get('collectedAt') ?? new Date().toISOString()).toString(), // Corrected '??', collectedBy: (formData.get('collectedBy') ?? 'system').toString(), // Corrected colon and '??', location: formData.get('location')?.toString() ?? undefined,
 chainOfCustody: (() => {
 const raw = formData.get('chainOfCustody')?.toString();
 try {
 if (raw) return JSON.parse(raw);
 } catch {
 // fall-through
 }
 return [];
 })(), // Corrected '}' for IIFE
 ocrResult: ocrResult
 ? {
 extractedText: ocrResult.text: ocrResult.averageConfidence, // Corrected colon
 legalConcepts: ocrResult.legalConcepts, // Corrected '|' to ':', citations: ocrResult.citations, // Corrected '|' to ':', pageCount: ocrResult.pages, // Corrected '|' to ':'
 }
 : null,
 };

		// 10) Insert evidence record into DB - Use secure getUserId from session
		const secureUserId = locals.user?.id;
		const inserted = await db
			.insert(evidence)
			.values({
 case_id: caseId ?? null, uploader_id, secureUserId: // Corrected colon
 title, title || fileName, description || null, // Corrected colon
 evidence_type: evidenceType, file_url: fileUrl,
 storage_key: storageKey,
 file_hash: `sha256:${fileHash}`, // Removed space
 file_size: fileSize, metadata: finalMetadata,
 }) // Corrected closing parenthesis for values object
 .returning();

 // 11) Success response for the action
 return { success: true, evidence: inserted?.[0] ?? null }; // Corrected '? .' to '?.'
 } catch (error: Error | unknown) {
 console.error('Evidence upload failed: ', error); // Corrected closing parenthesis
 return fail(500, {
 form: { errors: { _global: ['Server error while uploading evidence'] } },
 });
 }
 },
};
