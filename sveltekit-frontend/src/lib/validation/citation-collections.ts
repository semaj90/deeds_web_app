import { z } from 'zod';

export const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name required').max(255, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color').default('#8B2332'),
  isPublic: z.boolean().default(false),
});

export const updateCollectionSchema = createCollectionSchema.partial();

export const addCitationSchema = z.object({
  citationId: z.string().uuid('Invalid citation ID'),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type AddCitationInput = z.infer<typeof addCitationSchema>;
