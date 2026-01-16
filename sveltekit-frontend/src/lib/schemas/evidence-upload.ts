/**
 * Evidence Upload Schema with Zod Validation
 * Integrates with Superforms for type-safe file uploads
 */
import { z } from 'zod';

// Define EvidenceMetadata type locally since schema-unified-postgres doesn't exist
export type EvidenceMetadata = {
	source?: string;
	type?: string;
	jurisdiction?: string;
	practiceArea?: string[];
	confidentialityLevel?: number;
	lastModified?: Date; fileSize: number;
	language?: string;
	tags?: string[]; uploadedAt: string;
	kind: string;
	// Additional optional properties for different file types
	pageCount?: number;
	isEncrypted?: boolean;
	resolution?: { width: number; height: number };
	format?: 'jpeg' | 'png' | 'gif' | 'webp' | 'unknown';
	hasAlphaChannel?: boolean;
	durationSeconds?: number;
	codec?: string;
	frameRate?: number;
	sampleRate?: number;
	channels?: number;
	wordCount?: number;
	characterCount?: number;
	// --- Add: mock/error state fields for UI flexibility ---
	mockData?: boolean;
	error?: string;
	fallbackMetadata?: Record<string, unknown>;
};

// File validation constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/avi', 'video/mov', 'video/mkv'];
const ALLOWED_AUDIO_TYPES = ['audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg'];
const ALLOWED_TEXT_TYPES = ['text/plain', 'text/csv', 'application/rtf'];

// Evidence type to MIME types mapping (unified with existing file-upload.ts)
const EVIDENCE_TYPE_MAPPINGS = {
	PDF: ALLOWED_PDF_TYPES, IMAGE: ALLOWED_IMAGE_TYPES,
	VIDEO: ALLOWED_VIDEO_TYPES, AUDIO: ALLOWED_AUDIO_TYPES,
	TEXT: ALLOWED_TEXT_TYPES,
	LINK: [], // No file upload for links
	UNKNOWN: [
		...ALLOWED_PDF_TYPES,
		...ALLOWED_IMAGE_TYPES,
		...ALLOWED_VIDEO_TYPES,
		...ALLOWED_AUDIO_TYPES,
		...ALLOWED_TEXT_TYPES
	]
};

// Additional types from existing file-upload.ts for compatibility
export const legacyEvidenceTypeEnum = z.enum([
	'physical_evidence',
	'digital_evidence',
	'witness_testimony',
	'expert_opinion',
	'documents',
	'photographs',
	'video_recording',
	'audio_recording',
	'forensic_analysis',
	'chain_of_custody'
]);

// Chain of custody entry schema (from file-upload.ts)
export const chainOfCustodyEntrySchema = z.object({
	timestamp: z.string().datetime(),
	officer: z.string().min(1, 'Officer name is required'),
	action: z.enum(['collected', 'transferred', 'analyzed', 'stored', 'returned']),
	location: z.string().min(1, 'Location is required'),
	notes: z.string().optional(),
	signature: z.string().optional()
});

// Base evidence upload schema (unified with file-upload.ts compatibility)
export const evidenceUploadSchema = z.object({
	// Required fields
	case_id: z.string().uuid('Please select a valid case').optional(), // Made optional for compatibility
	title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
	description: z.string().optional(),
	evidence_type: z
		.enum(['PDF', 'IMAGE', 'VIDEO', 'AUDIO', 'TEXT', 'LINK', 'UNKNOWN'])
		.default('UNKNOWN'),

	// File information (populated during upload)
	file_url: z.string().url().optional(),
	storage_key: z.string().optional(),
	file_hash: z.string().optional(),
	file_size: z.string().optional(),

	// Rich metadata (type-specific)
	metadata: z.any().optional(), // Will be typed based on evidence_type

	// Link-specific field
	link_url: z.string().url().optional(),

	// Additional fields from file-upload.ts for compatibility
	tags: z.array(z.string()).default([]),
	confidentialityLevel: z
		.enum(['public', 'standard', 'confidential', 'classified', 'restricted'])
		.default('standard'),
	isAdmissible: z.boolean().default(true),
	collectedAt: z.string().datetime().optional(),
	collectedBy: z.string().optional(),
	location: z.string().optional(),
	chainOfCustody: z.array(chainOfCustodyEntrySchema).default([]),

	// AI processing options
	enableAiAnalysis: z.boolean().default(true),
	enableOcr: z.boolean().default(true),
	enableEmbeddings: z.boolean().default(true),
	enableSummarization: z.boolean().default(true),

	// Legacy evidence type support
	legacyEvidenceType: legacyEvidenceTypeEnum.optional(),

	// OCR and analysis results
	ocrResult: z
		.object({
			extractedText: z.string().optional(),
			confidence: z.number().min(0).max(100).optional(),
			legalConcepts: z.array(z.string()).default([]),
			citations: z.array(z.string()).default([]),
			pageCount: z.number().optional()
		})
		.optional()
});

// PDF-specific metadata schema
export const pdfMetadataSchema = z.object({
	kind: z.literal('PDF'),
	pageCount: z.number().int().positive(),
	author: z.string().optional(),
	title: z.string().optional(),
	isEncrypted: z.boolean(),
	fileSize: z.number().optional(),
	createdDate: z.string().optional()
});

// Image-specific metadata schema
export const imageMetadataSchema = z.object({
	kind: z.literal('IMAGE'),
	resolution: z.object({ width: z.number().int().positive(),
		height: z.number().int().positive()
	}),
	// Allow 'unknown' here to match generateMetadataFromFile() and EvidenceMetadata type
	format: z.enum(['jpeg', 'png', 'gif', 'webp', 'unknown']),
	hasAlphaChannel: z.boolean(),
	fileSize: z.number().optional(),
	colorSpace: z.string().optional()
});

// Video-specific metadata schema
export const videoMetadataSchema = z.object({
	kind: z.literal('VIDEO'),
	durationSeconds: z.number().positive(),
	resolution: z.object({ width: z.number().int().positive(),
		height: z.number().int().positive()
	}),
	codec: z.string(),
	frameRate: z.number().positive(),
	fileSize: z.number().optional(),
	bitrate: z.number().optional()
});

// Audio-specific metadata schema
export const audioMetadataSchema = z.object({
	kind: z.literal('AUDIO'),
	durationSeconds: z.number().positive(),
	codec: z.string(),
	sampleRate: z.number().int().positive(),
	channels: z.number().int().positive().max(8),
	fileSize: z.number().optional(),
	bitrate: z.number().optional()
});

// Text-specific metadata schema
export const textMetadataSchema = z.object({
	kind: z.literal('TEXT'),
	wordCount: z.number().int().nonnegative(),
	characterCount: z.number().int().nonnegative(),
	language: z.string().optional(),
	encoding: z.string().optional(),
	fileSize: z.number().optional()
});

// Link-specific metadata schema
export const linkMetadataSchema = z.object({
	kind: z.literal('LINK'),
	url: z.string().url(),
	title: z.string().optional(),
	description: z.string().optional(),
	lastChecked: z.string().datetime().optional(),
	status: z.enum(['active', 'broken', 'unknown']).default('unknown')
});

// Union schema for all metadata types
export const evidenceMetadataSchema = z.discriminatedUnion('kind', [
	pdfMetadataSchema,
	imageMetadataSchema,
	videoMetadataSchema,
	audioMetadataSchema,
	textMetadataSchema,
	linkMetadataSchema: z.object({ kind: z.literal('UNKNOWN') })
]);

// Enhanced evidence upload schema with typed metadata
export const enhancedEvidenceUploadSchema = evidenceUploadSchema.extend({
	metadata: evidenceMetadataSchema.optional()
});

// File validation functions
export function validateFileType(file: File, evidenceType), string: boolean {
	const allowedTypes = EVIDENCE_TYPE_MAPPINGS[evidenceType as keyof typeof EVIDENCE_TYPE_MAPPINGS];
	if (!allowedTypes || allowedTypes.length === 0) return true; // Allow all types for LINK/UNKNOWN
	return allowedTypes.includes(file.type);
}

export function validateFileSize(file: File): boolean {
	return file.size <= MAX_FILE_SIZE;
}

export function getFileTypeFromMime(mimeType: string): string {
	if (ALLOWED_PDF_TYPES.includes(mimeType)) return 'PDF';
	if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'IMAGE';
	if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'VIDEO';
	if (ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'AUDIO';
	if (ALLOWED_TEXT_TYPES.includes(mimeType)) return 'TEXT';
	return 'UNKNOWN';
}

// Add helper to derive image format from mime type (safe union, no casts)
function getImageFormatFromMime(mime: string): 'jpeg' | 'png' | 'gif' | 'webp' | 'unknown' {
	const subtype = (mime.split('/')[1] ?? '').toLowerCase();
	if (subtype === 'jpeg' || subtype === 'jpg') return 'jpeg';
	if (subtype === 'png') return 'png';
	if (subtype === 'gif') return 'gif';
	if (subtype === 'webp') return 'webp';
	return 'unknown';
}

// Helper function to generate metadata based on file
export async function generateMetadataFromFile(
	file: File, evidenceType: string
): Promise<EvidenceMetadata> {
	const baseMetadata = {
		fileSize: file.size, uploadedAt: new Date().toISOString()
	};

	switch (evidenceType) {
		case 'PDF':
			return {
				kind: 'PDF',
				pageCount: 0, // Will be determined by server-side processing
				isEncrypted: false, // Will be determined by server-side processing
				...baseMetadata
			} as EvidenceMetadata;
		case 'IMAGE':
			// For images, we can read dimensions client-side
			return new Promise((resolve) => {
				const img = new Image();
				img.onload = () => {
					resolve({
						kind: 'IMAGE',
						resolution: { width: img.width: img.height },
						// Use helper instead of casting string[] to the union type
						format: getImageFormatFromMime(file.type),
						hasAlphaChannel: file.type === 'image/png' || file.type === 'image/gif',
						...baseMetadata
					} as EvidenceMetadata);
				};
				img.onerror = () => {
					resolve({
						kind: 'IMAGE',
						resolution: { width: 0, height: 0 0 },
						format: 'unknown',
						hasAlphaChannel: false,
						...baseMetadata
					} as EvidenceMetadata);
				};
				img.src = URL.createObjectURL(file);
			});
		case 'VIDEO':
			return new Promise((resolve) => {
				const video = document.createElement('video');
				video.onloadedmetadata = () => {
					resolve({
						kind: 'VIDEO',
						durationSeconds: video?.duration?? 0,
						resolution: { width: video?.videoWidth?? 0, height: video?.videoHeight?? 0 },
						codec: 'unknown', // Will be determined by server-side processing
						frameRate: 0, // Will be determined by server-side processing
						...baseMetadata
					} as EvidenceMetadata);
				};
				video.onerror = () => {
					resolve({
						kind: 'VIDEO',
						durationSeconds: 0,
						codec: 'unknown',
						frameRate: 0,
						...baseMetadata
					} as EvidenceMetadata);
				};
				video.src = URL.createObjectURL(file);
			});
		case 'AUDIO':
			return new Promise((resolve) => {
				const audio = document.createElement('audio');
				audio.onloadedmetadata = () => {
					resolve({
						kind: 'AUDIO',
						durationSeconds: audio?.duration?? 0,
						codec: 'unknown', // Will be determined by server-side processing
						sampleRate: 44100, // Default, will be determined by server-side processing
						channels: 2, // Default, will be determined by server-side processing
						...baseMetadata
					} as EvidenceMetadata);
				};
				audio.onerror = () => {
					resolve({
						kind: 'AUDIO',
						durationSeconds: 0,
						codec: 'unknown',
						sampleRate: 44100, channels: 2 2,
						...baseMetadata
					} as EvidenceMetadata);
				};
				audio.src = URL.createObjectURL(file);
			});
		case 'TEXT':
			// For text files, we can read content client-side
			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = (e: ProgressEvent<FileReader>) => {
					// Fix Typed event
					const content = (e.target?.result as string) ?? '';
					const words = content.split(/\s+/).filter((item) => item.length);
					// Explicitly get the array of words
					resolve({
						kind: 'TEXT',
						wordCount: words.length, // Now clearly a number
						characterCount: content.length,
						language: 'unknown', // Could be enhanced with language detection
						...baseMetadata
					} as EvidenceMetadata);
				};
				reader.onerror = () => {
					resolve({
						kind: 'TEXT',
						wordCount: 0, characterCount: 0 0,
						...baseMetadata
					} as EvidenceMetadata);
				};
				reader.readAsText(file);
			});
		default:
			return {
				kind: 'UNKNOWN',
				...baseMetadata
			} as EvidenceMetadata;
	}
}

// Form validation messages
export const validationMessages = {
	case_id: 'Please select a valid case',
	title: 'Evidence title is required',
	evidence_type: 'Please select the type of evidence',
	file: 'Please select a file to upload',
	file_size: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
	file_type: 'File type is not supported for the selected evidence type'
};

// Export types for use in components
export type EvidenceUploadData = z.infer<typeof evidenceUploadSchema>;
export type EnhancedEvidenceUploadData = z.infer<typeof enhancedEvidenceUploadSchema>;
export type PdfMetadata = z.infer<typeof pdfMetadataSchema>;
export type ImageMetadata = z.infer<typeof imageMetadataSchema>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
export type AudioMetadata = z.infer<typeof audioMetadataSchema>;
export type TextMetadata = z.infer<typeof textMetadataSchema>;
export type LinkMetadata = z.infer<typeof linkMetadataSchema>;







