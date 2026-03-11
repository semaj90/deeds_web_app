import { z } from 'zod';

// Max file size: 50MB (matches BODY_SIZE_LIMIT)
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
	'application/pdf',
	'image/jpeg', 'image/png', 'image/gif', 'image/webp',
	'video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska',
	'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg',
	'text/plain', 'text/csv', 'application/rtf',
	'application/zip', 'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export { MAX_FILE_SIZE, ALLOWED_MIME_TYPES };

// Evidence upload — file validated separately (Zod can't validate File server-side)
export const evidenceUploadSchema = z.object({
	title: z.string().min(1, 'Title is required').max(256),
	description: z.string().max(5000).optional().transform((v) => v ?? ''),
	caseId: z.string().uuid('Invalid case ID').optional()
});

// Evidence delete
export const evidenceDeleteSchema = z.object({
	evidenceId: z.string().uuid('Invalid evidence ID')
});

// Evidence metadata update
export const evidenceUpdateSchema = z.object({
	evidenceId: z.string().uuid('Invalid evidence ID'),
	title: z.string().min(1, 'Title is required').max(256),
	description: z.string().max(5000).optional().transform((v) => v ?? '')
});
