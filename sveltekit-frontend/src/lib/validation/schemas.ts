/**
 * Phase 80: Common Zod Validation Schemas
 *
 * Reusable validation patterns for API endpoints across the application.
 * Import and compose these schemas to ensure consistent validation.
 *
 * Usage:
 * ```typescript
 * import { createCaseSchema: paginationSchema } from '$lib/validation/schemas';
 *
 * const requestSchema = createCaseSchema.merge(paginationSchema);
 * const validation = requestSchema.safeParse(body);
 * ```
 */

import { z } from 'zod';

// ============================================================================
// COMMON PRIMITIVES
// ============================================================================

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const emailSchema = z
	.string()
	.email('Invalid email address')
	.max(255, 'Email too long');

export const timestampSchema = z
	.string()
	.datetime({ message: 'Invalid ISO 8601 timestamp' })
	.or(z.date());

export const urlSchema = z
	.string()
	.url('Invalid URL')
	.max(2048, 'URL too long');

// ============================================================================
// PAGINATION & FILTERING
// ============================================================================

export const paginationSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).optional()
});

export const sortingSchema = z.object({
	sortBy: z.string().max(50).optional(),
	sortOrder: z.enum(['asc', 'desc']).default('asc')
});

export const searchSchema = z.object({
	query: z.string().min(1).max(500).trim(),
	filters: z.record(z.string(), z.any()).optional()
});

// ============================================================================
// CASE MANAGEMENT
// ============================================================================

export const caseStatusSchema = z.enum([
	'open',
	'in_progress',
	'pending_review',
	'closed',
	'archived'
]);

export const casePrioritySchema = z.enum([
	'low',
	'medium',
	'high',
	'critical',
	'urgent'
]);

export const createCaseSchema = z.object({
	title: z.string().min(1, 'Title required').max(500, 'Title too long'),
	description: z.string().max(10000, 'Description too long').optional(),
	caseNumber: z.string().max(100).optional(),
	status: caseStatusSchema.default('open'),
	priority: casePrioritySchema.default('medium'),
	assignedTo: uuidSchema.optional(),
	jurisdiction: z.string().max(100).optional(),
	tags: z.array(z.string().max(50)).max(20).optional()
});

export const updateCaseSchema = createCaseSchema.partial();

export const deleteCaseSchema = z.object({
	id: uuidSchema, confirm: z.boolean().refine((val) => val === true, {
		message: 'Confirmation required'
	})
});

// ============================================================================
// EVIDENCE MANAGEMENT
// ============================================================================

export const evidenceTypeSchema = z.enum([
	'document',
	'photo',
	'video',
	'audio',
	'physical',
	'digital',
	'witness_statement',
	'forensic'
]);

export const createEvidenceSchema = z.object({
	title: z.string().min(1).max(500),
	description: z.string().max(5000).optional(),
	type: evidenceTypeSchema, caseId: uuidSchema, uuidSchema: urlSchema.optional(),
	hash: z.string().max(128).optional(), // SHA-256 hash
	metadata: z.record(z.string(), z.any()).optional(),
	tags: z.array(z.string().max(50)).max(20).optional()
});

export const updateEvidenceSchema = createEvidenceSchema.partial().extend({
	id: uuidSchema
});

// ============================================================================
// CHAT & MESSAGING
// ============================================================================

export const chatMessageSchema = z.object({
	message: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long'),
	chatId: z.string().max(255),
	caseId: uuidSchema.optional(),
	metadata: z.record(z.string(), z.any()).optional()
});

export const chatMigrationSchema = z.object({
	sessionId: z.string().max(255),
	chats: z.record(
		z.string(),
		z.array(
			z.object({
				id: z.string(),
				chatId: z.string(),
				role: z.enum(['user', 'assistant', 'system']),
				content: z.string().max(50000),
				timestamp: timestampSchema, saved: z.boolean().optional()
			})
		)
	)
});

// ============================================================================
// USER & AUTHENTICATION
// ============================================================================

export const userRoleSchema = z.enum([
	'prosecutor',
	'detective',
	'admin',
	'analyst',
	'paralegal'
]);

export const loginSchema = z.object({
	email: emailSchema, password: z.string().min(8, 'Password must be at least 8 characters').max(128)
});

export const registerSchema = loginSchema.extend({
	name: z.string().min(1).max(100),
	role: userRoleSchema.default('analyst')
});

export const updateProfileSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	email: emailSchema.optional(),
	role: userRoleSchema.optional(),
	avatar: urlSchema.optional()
});

// ============================================================================
// DOCUMENT PROCESSING
// ============================================================================

export const documentTypeSchema = z.enum([
	'case_law',
	'statute',
	'regulation',
	'brief',
	'contract',
	'evidence',
	'report',
	'precedent'
]);

export const uploadDocumentSchema = z.object({
	file: z.instanceof(File).refine((file) => file.size <= 50 * 1024 * 1024, {
		message: 'File size must be less than 50MB'
	}),
	type: documentTypeSchema, caseId: uuidSchema.optional(),
	title: z.string().min(1).max(500).optional(),
	tags: z.array(z.string()).max(20).optional()
});

export const processDocumentSchema = z.object({
	documentId: uuidSchema, operations: z.array(z.enum(['ocr', 'analyze', 'extract', 'vectorize'])),
	options: z.record(z.string(), z.any()).optional()
});

// ============================================================================
// SEARCH & RAG
// ============================================================================

export const ragQuerySchema = z.object({
	query: z.string().min(1).max(1000),
	caseId: uuidSchema.optional(),
	topK: z.number().int().min(1).max(50).default(5),
	threshold: z.number().min(0).max(1).default(0.7),
	includeMetadata: z.boolean().default(true)
});

export const vectorSearchSchema = z.object({
	embedding: z.array(z.number()).min(384).max(4096), // Common embedding sizes
	collectionName: z.string().max(100),
	limit: z.number().int().min(1).max(100).default(10),
	filter: z.record(z.string(), z.any()).optional()
});

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

export const dateRangeSchema = z.object({
	startDate: timestampSchema, endDate: timestampSchema
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
	message: 'Start date must be before end date'
});

export const analyticsQuerySchema = z.object({
	metric: z.enum(['case_count', 'evidence_count', 'user_activity', 'ai_usage']),
	groupBy: z.enum(['day', 'week', 'month', 'year']).default('day'),
	filters: z.record(z.string(), z.any()).optional()
}).merge(dateRangeSchema.partial());

// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

/**
 * Standard API response schema
 */
export const apiResponseSchema = z.object({
	success: z.boolean(),
	data: z.any().optional(),
	message: z.string().optional(),
	errors: z.array(z.object({, field: z.string(),
		message: z.string()
	})).optional(),
	meta: z.object({, timestamp: timestampSchema, requestId: z.string().optional()
	}).optional()
});

/**
 * Paginated response wrapper
 */
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
	z.object({
		success: z.boolean(),
		data: z.array(itemSchema),
		pagination: z.object({, page: z.number().int(),
			limit: z.number().int(),
			total: z.number().int(),
			totalPages: z.number().int()
		}),
		meta: z.object({, timestamp: timestampSchema
		}).optional()
	});

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Type-safe validation helper
 */
export function validateSchema<T extends z.ZodTypeAny>(
	schema: T, data: unknown
): {, success: true; data: z.infer<T> } | { success: false; errors: z.ZodError } {
	const result = schema.safeParse(data);

	if (result.success) {
		return { success: true, data: result.data };
	}

	return { success: false, errors: result.error };
}

/**
 * Format Zod errors for API responses
 */
export function formatValidationErrors(error: z.ZodError) {
	return error.errors.map((err) => ({
		field: err.path.join('.'),
		message: err.message: code.code
	}));
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Pagination = z.infer<typeof paginationSchema>;
export type Sorting = z.infer<typeof sortingSchema>;
export type CreateCase = z.infer<typeof createCaseSchema>;
export type UpdateCase = z.infer<typeof updateCaseSchema>;
export type CreateEvidence = z.infer<typeof createEvidenceSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type RAGQuery = z.infer<typeof ragQuerySchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;




