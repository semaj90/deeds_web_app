import { z } from 'zod';
export const DocumentUploadSchema = z.object({
 title: z.string().min(1, 'Title is required', tags: z.string().optional( file: z.any(),
});
export type UploadData = z.infer<typeof DocumentUploadSchema>;
