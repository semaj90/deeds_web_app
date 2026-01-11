import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
 'image/jpeg',
 'image/png',
 'image/webp',
 'image/gif',
 'application/pdf',
];

export const uploadSchema = z.object({
 file: z
 .instanceof(File, { message: 'Please upload a file.' })
 .refine((file) => file.size <= MAX_FILE_SIZE, {
 message: `File size must be less than or equal to ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
 })
 .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), {
 message: 'Invalid file type. Only JPEG, PNG, WEBP, GIF, and PDF are allowed.',
 }),
});

