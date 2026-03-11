import { z } from 'zod';

// Enum values from actual DB (source of truth: case_status, case_priority enums)
const CASE_STATUS_VALUES = ['open', 'in_progress', 'pending_review', 'closed', 'archived'] as const;
const CASE_PRIORITY_VALUES = ['low', 'medium', 'high', 'critical', 'urgent'] as const;

// Case creation from /cases list page
// (distinct from /cases/new/schema.ts which is the intake wizard)
export const caseListCreateSchema = z.object({
	title: z.string().min(1, 'Title is required').max(255),
	description: z.string().min(1, 'Description is required').max(10000),
	priority: z.enum(CASE_PRIORITY_VALUES).default('medium'),
	caseNumber: z.string().max(50).optional(),
	practiceArea: z.string().max(100).optional(),
	jurisdiction: z.string().max(100).optional()
});

// Bulk status update — used with safeParse(), not full Superforms
export const caseBulkUpdateStatusSchema = z.object({
	caseId: z.array(z.string().uuid()).min(1, 'Select at least one case'),
	status: z.enum(CASE_STATUS_VALUES)
});

// Bulk archive — used with safeParse(), not full Superforms
export const caseBulkArchiveSchema = z.object({
	caseId: z.array(z.string().uuid()).min(1, 'Select at least one case')
});
