import { z } from 'zod';

/**
 * Evidence Type Enum (matches evidence_type pgEnum)
 */
export const EvidenceType = z.enum([
	'document',
	'photo',
	'video',
	'audio',
	'physical',
	'digital',
	'witness_statement',
	'forensic',
	'documentary',
	'testimonial',
	'demonstrative',
	'real',
	'circumstantial',
	'hearsay',
	'expert',
	'scientific'
]);

/**
 * Evidence Schema for validation
 */
export const EvidenceSchema = z.object({
	id: z.string().uuid().optional(),
	caseId: z.string().uuid(),
	title: z.string().min(1).max(255),
	description: z.string().optional(),
	evidenceType: EvidenceType.optional(),
	subType: z.string().max(50).optional(),
	fileKey: z.string().optional(),
	fileUrl: z.string().url().optional(),
	fileName: z.string().max(255).optional(),
	mimeType: z.string().max(100).optional(),
	sizeBytes: z.number().int().positive().optional(),
	hash: z.string().max(128).optional(),
	hashAlgorithm: z.string().max(32).optional(),
	tags: z.array(z.string()).default([]),
	metadata: z.record(z.string(), z.any()).default({}),
	canvasPosition: z.object({
		x: z.number().default(0),
		y: z.number().default(0)
	}).default({ x: 0, y: 0 })
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceType = z.infer<typeof EvidenceType>;

/**
 * Evidence Section Schema (for structured parts of a document)
 */
export const EvidenceSectionSchema = z.object({
	id: z.string().uuid().optional(),
	evidenceId: z.string().uuid(),
	sectionType: z.enum(['header', 'footer', 'body', 'signature', 'stamp', 'annotation', 'metadata', 'citation']),
	content: z.string(),
	pageNumber: z.number().int().positive().optional(),
	boundingBox: z.object({
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number()
	}).optional(),
	confidence: z.number().min(0).max(1).optional()
});

export type EvidenceSection = z.infer<typeof EvidenceSectionSchema>;
