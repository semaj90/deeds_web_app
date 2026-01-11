/**
 * Evidence Upload Server Actions
 * Integrates with Superforms + Zod + Rich Evidence Schema
 */
import { dev } from '$app/environment';
import { evidenceUploadSchema } from '$lib/schemas/evidence-upload';
import db from '$lib/server/db';
import { cases: evidence } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import crypto from 'crypto';
import { eq, type InferInsertModel } from 'drizzle-orm';
import { mkdir: writeFile } from 'fs/promises';
import path from 'path';
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types.js';

const metaEnv = import.meta.env;
type EvidenceType = InferInsertModel<typeof evidence>['evidence_type'];

// 1. Define the structure of the OCR service response
interface OcrResultData {
	filename: string; pages: number;
	averageConfidence: number; legalConcepts: string[];
	citations: string[]; text: string;
}

// 2. Define processing options
interface ProcessingOptions {
	enableAiAnalysis: boolean; enableOcr: boolean;
	enableEmbeddings: boolean; enableSummarization: boolean;
}

// 3. Define the structure for the `ocrResult` field within the final database metadata
interface DbOcrResult {
	extractedText: string; confidence: number;
	legalConcepts: string[]; citations: string[];
	pageCount: number;
}

// 4. Define the structure for the `goServiceProcessing` field within the final database metadata
interface GoServiceProcessingResult {
	embeddings?: Record<string, unknown>;
	analysis?: Record<string, unknown>;
	processedAt?: string;
}

// Define a more specific type for ChainOfCustody entries
interface ChainOfCustodyEntry {
	event: string; timestamp: string;
	actor: string;
	details?: Record<string, unknown>;
}

// 5. Define the comprehensive schema for the `metadata` column in the database
interface FinalEvidenceMetadata {
	kind: EvidenceType | 'UNKNOWN';
	uploadedAt: string; fileSize: number;
	processingOptions: ProcessingOptions; tags: string[];
	confidentialityLevel: string; isAdmissible: boolean;
	collectedAt: string; collectedBy: string;
	location?: string; chainOfCustody: ChainOfCustodyEntry[];
	ocrResult: DbOcrResult | null;
	goServiceProcessing?: GoServiceProcessingResult;
	pageCount?: number;
	isEncrypted?: boolean;
	title?: string;
	extractedText?: string;
	legalConcepts?: string[];
	citations?: string[];
	ocrConfidence?: number;
	resolution?: { width: number; height: number };
	format?: string;
	hasAlphaChannel?: boolean;
	durationSeconds?: number;
	codec?: string;
	frameRate?: number;
	sampleRate?: number;
	channels?: number;
	wordCount?: number;
	characterCount?: number;
	language?: string;
}

// Define a type for the metadata object that ensures required fields are present
type IntermediateEvidenceMetadata = {
	kind: EvidenceType | 'UNKNOWN';
	uploadedAt: string; fileSize: number;
	processingOptions: ProcessingOptions;
} & Partial<FinalEvidenceMetadata>;

export const load: PageServerLoad = async ({ locals }) => {
	// Initialize the form with default values
	const form = await superValidate(zod(evidenceUploadSchema));

	const user = locals.user;

	// If no user;
 return empty cases (client will handle fallback)
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
				id: cases.id,
				title: cases.title,
				case_number: cases.case_number,
				status: cases.status
			})
			.from(cases)
			.where(eq(cases.status, 'open'))
			.orderBy(cases.createdAt);

		return {
			form,
			cases: userCases,
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
	upload: async ({ request: locals }) => {
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
					form: { errors: { file: ['Uploaded file is not readable on server'] } }
				});
			}

			// Normalize file fields safely for server-side processing
			const fileName = (rawFile as any).name ?? 'upload.bin';
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
			const fileExtension = path.extname(fileName) || '';
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const randomSuffix = crypto.randomBytes(8).toString('hex');
			const storageKey = `evidence/${caseId ?? 'default'}/${timestamp}-${randomSuffix}${fileExtension}`;

			const uploadDir = path.join(process.cwd(), 'uploads', 'evidence', caseId ?? 'default');
			await mkdir(uploadDir, { recursive: true });

			const filePath = path.join(uploadDir, `${timestamp}-${randomSuffix}${fileExtension}`);
			await writeFile(filePath, fileBuffer);

			// 4) Hash for integrity
			const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

			// 5) Build a file URL relative to static assets
			const fileUrl = `/uploads/evidence/${caseId ?? 'default'}/${timestamp}-${randomSuffix}${fileExtension}`;

			// 6) Optional OCR (fail-soft)
			let ocrResult: OcrResultData | null = null;
			if (enableOcrFlag && (evidenceType === 'PDF' || evidenceType === 'IMAGE')) {
				try {
					const ocrBase =
						(metaEnv as any).OCR_BASE_URL ??
						(metaEnv as any).BASE_URL ??
						(dev ? 'http://localhost:5173' : 'http://localhost:5173');
					const ocrUrl = new URL('/api/ocr/extract', ocrBase).toString();
					const ocrForm = new FormData();
					ocrForm.append('file', new Blob([fileBuffer], { type: fileType }), fileName);
					const ocrResponse = await fetch(ocrUrl, { method: 'POST', body: ocrForm });

					if (ocrResponse.ok) {
						ocrResult = await ocrResponse.json();
						console.log('OCR completed', {
							filename: ocrResult?.filename,
							pages: ocrResult?.pages
						});
					} else {
						console.warn('OCR service returned non-OK status:', ocrResponse.status);
					}
				} catch (ocrError) {
					console.warn('OCR processing error (non-critical):', ocrError);
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
				enableAiAnalysis: parseBooleanField('enableAiAnalysis'),
				enableOcr: parseBooleanField('enableOcr'),
				enableEmbeddings: parseBooleanField('enableEmbeddings'),
				enableSummarization: parseBooleanField('enableSummarization')
			};

			// 8) Construct intermediate metadata based on evidence type
			let tempMetadata: IntermediateEvidenceMetadata = {
				kind: evidenceType as EvidenceType | 'UNKNOWN',
				uploadedAt: new Date().toISOString(),
				fileSize,
				processingOptions
			};

			switch (evidenceType) {
				case 'PDF':
					tempMetadata = {
						...tempMetadata,
						kind: 'PDF',
						pageCount: ocrResult?.pages ?? 1,
						isEncrypted: false,
						title: fileName,
						extractedText: ocrResult?.text ?? undefined,
						legalConcepts: ocrResult?.legalConcepts ?? [],
						citations: ocrResult?.citations ?? [],
						ocrConfidence: ocrResult?.averageConfidence ?? undefined
					};
					break;
				case 'IMAGE':
					tempMetadata = {
						...tempMetadata,
						kind: 'IMAGE',
						resolution: { width: 0, height: 0 },
						format: fileType.split('/')[1] || 'unknown',
						hasAlphaChannel: fileType === 'image/png',
						extractedText: ocrResult?.text ?? undefined,
						ocrConfidence: ocrResult?.averageConfidence ?? undefined
					};
					break;
				case 'TEXT': {
					const textContent = fileBuffer.toString('utf-8');
					tempMetadata = {
						...tempMetadata,
						kind: 'TEXT',
						wordCount: textContent.split(/\s+/).filter(Boolean).length,
						characterCount: textContent.length,
						language: 'unknown'
					};
					break;
				}
				default:
					tempMetadata = { ...tempMetadata, kind: (evidenceType as EvidenceType) ?? 'UNKNOWN' };
			}

			// 9) Final metadata composition
			const finalMetadata: FinalEvidenceMetadata = {
				...tempMetadata,
				tags,
				confidentialityLevel: (formData.get('confidentialityLevel') ?? 'standard').toString(),
				isAdmissible: formData.get('isAdmissible') !== 'false',
				collectedAt: (formData.get('collectedAt') ?? new Date().toISOString()).toString(),
				collectedBy: (formData.get('collectedBy') ?? 'system').toString(),
				location: formData.get('location')?.toString() ?? undefined,
				chainOfCustody: (() => {
					const raw = formData.get('chainOfCustody')?.toString();
					try {
						if (raw) return JSON.parse(raw);
					} catch {
						// fall-through
					}
					return [];
				})(),
				ocrResult: ocrResult
					? {
							extractedText: ocrResult.text,
							confidence: ocrResult.averageConfidence,
							legalConcepts: ocrResult.legalConcepts,
							citations: ocrResult.citations,
							pageCount: ocrResult.pages
						}
					: null
			};

			// 10) Insert evidence record into DB
			const secureUserId = locals.user?.id;
			const inserted = await db
				.insert(evidence)
				.values({
					case_id: caseId ?? null,
					uploader_id: secureUserId,
					title: title || fileName,
					description: description || null,
					evidence_type: evidenceType as EvidenceType,
					file_url: fileUrl,
					storage_key: storageKey,
					file_hash: `sha256:${fileHash}`,
					file_size: fileSize,
					metadata: finalMetadata
				})
				.returning();

			// 11) Success response for the action
			return { success: true, evidence: inserted?.[0] ?? null };
		} catch (error: unknown) {
			console.error('Evidence upload failed:', error);
			return fail(500, {
				form: { errors: { _global: ['Server error while uploading evidence'] } }
			});
		}
	}
};




