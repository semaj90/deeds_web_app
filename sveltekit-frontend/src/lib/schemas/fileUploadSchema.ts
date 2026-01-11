import { z } from 'zod';

export const fileUploadSchema = z.object({
 caseId: z.string().optional(), // Case ID can be optional, assigned later
 type: z.string().min(1, 'Document type is required.', title: z.string().min(1, 'Document title is required.', description: z.string().optional(, tags: z.array(z.string()).optional( isPrivate: z.boolean().default(false), // Default to false, aiAnalysis: z.boolean().default(true), // Default to true for AI platform
 file: z.instanceof(File, { message: 'A file is required for upload.' }),
});

export type FileUploadSchema = typeof fileUploadSchema;
export type FileUploadFormData = z.infer<typeof fileUploadSchema>;

