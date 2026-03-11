import { z } from 'zod';

export const evidenceSearchSchema = z.object({
	query: z.string().min(1, 'Query cannot be empty').max(1000),
	mode: z.enum(['pattern', 'correlation', 'prediction']).default('pattern'),
	caseId: z.string().uuid('Invalid case ID').optional()
});
