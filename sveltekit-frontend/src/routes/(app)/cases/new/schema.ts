import { z } from 'zod';

// Intake schema — WHO/WHAT/WHEN/WHERE/WHY/HOW guided prompts + case fields
export const intakeCaseSchema = z.object({
	title: z.string().min(1, 'Case title is required').max(255),
	narrative: z.string().max(10000).default(''),
	who: z.string().max(1000).default(''),
	what: z.string().max(1000).default(''),
	when: z.string().max(500).default(''),
	where: z.string().max(500).default(''),
	why: z.string().max(1000).default(''),
	how: z.string().max(1000).default(''),
	priority: z.enum(['low', 'medium', 'high', 'critical', 'urgent']).default('medium')
});
