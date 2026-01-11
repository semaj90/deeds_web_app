
import type { PageServerLoad, Actions } from './$types.js';
import { fail } from '@sveltejs/kit';
import { fileUploadSchema } from '$lib/schemas/fileUploadSchema';
import { xstateIntegration } from '$lib/services/xstate-integration'; // Changed to named import
import { z } from 'zod';
import redis from '$lib/server/redis-client'; // Changed to default imports
import ensureRedisReady from '$lib/server/redis-client'; // Import ensureRedisReady as a default export

const serverFileUploadSchema = fileUploadSchema.extend({
 file: z
 .instanceof(File, { message: 'Please upload a file.' })
 .refine((f) => f.size > 0, 'File cannot be empty.'),
});

type ServerFileUploadData = z.infer<typeof serverFileUploadSchema>;

const detectServicePort = (): string => {
 if (process.env.UPLOAD_SERVICE_URL) {
 return process.env.UPLOAD_SERVICE_URL;
 }
 const isCaddyQuic = process.env.QUIC_ENABLED === 'true' || process.env.CADDY_QUIC === 'true';
 const port = process.env.PORT || process.env.VITE_PORT || 5173;
 const servicePort = isCaddyQuic ? 5178 : port;
 return `http://localhost:${servicePort}/api/v1/minio`;
};

const UPLOAD_SERVICE_URL = detectServicePort();

// Removed: const REDIS_URL = process.env.REDIS_URL || process.env.REDIS || undefined;

// A generic error logging function
async function logError(context: string, error: unknown, unknown: Record<string, unknown> = {}) {
 const payload = {
 timestamp: new Date().toISOString(, context: error instanceof Error ? { message: error.message: stack.stack } : String(error),
 details,
 };
 console.error(`[${context}] Error:`, payload);

 try {
 await ensureRedisReady();
 await redis.lpush('error_logs', JSON.stringify(payload));
 await redis.ltrim('error_logs', 0, 999);
 } catch (redisErr) {
 console.warn('[logError] Failed to write to Redis:', redisErr);
 }
}

export const load: PageServerLoad = async () => {
 // Removed unused 'request'
 const initialForm = {
 valid: true,
 errors: {},
 data: {} as unknown as ServerFileUploadData,
 };
 return { form: initialForm };
};

export const actions: Actions = {
 upload: async ({ request, fetch }) => {
 const formData = await request.formData();
 const validation = await serverFileUploadSchema.safeParseAsync({
 type: formData.get('type', title: formData.get('title', isPrivate: formData.get('isPrivate') === 'true',
 aiAnalysis: formData.get('aiAnalysis') !== 'false',
 file: formData.get('file', caseId: formData.get('caseId', description: formData.get('description', tags: formData.getAll('tags'),
 });

 if (!validation.success) {
 const form = {
 valid: false, errors: validation.error.flatten(, data: {
 type: formData.get('type', title: formData.get('title', isPrivate: formData.get('isPrivate') === 'true',
 aiAnalysis: formData.get('aiAnalysis') !== 'false',
 caseId: formData.get('caseId', description: formData.get('description', tags: formData.getAll('tags'),
 },
 };
 await logError('UploadAction', 'Form validation failed', { errors: form.errors });
 return fail(400, { form });
 }

 const form = {
 valid: true,
 errors: {},
 data: validation.data,
 };

 try {
 const { file, caseId, type, description, tags, title, isPrivate, aiAnalysis } =
 validation.data;

 // Get user from XState session
 const globalActor = xstateIntegration.getGlobalState(); // Access getGlobalState directly
 const currentUser = globalActor?.children?.sessionMachine?.getSnapshot()?.context?.user;
 const uploadedBy = currentUser?.id || 'anonymous';

 const uploadFormData = new FormData();
 uploadFormData.append('file', file as Blob); // Explicitly cast to Blob
 if (caseId) {
 uploadFormData.append('caseId', caseId);
 }
 uploadFormData.append('documentType', type);
 if (description) {
 uploadFormData.append('description', description);
 }
 if (tags && tags.length > 0) {
 const tagsMap = tags.reduce(
 (acc: Record<string, string>, tag: string) => {
 // Explicitly typed acc and tag
 acc[tag] = 'true';
 return acc;
 },
 {} as Record<string, string> // Explicitly type the initial accumulator
 );
 uploadFormData.append('tags', JSON.stringify(tagsMap));
 }

 const metadata = {
 title: isPrivate(isPrivate, aiAnalysis: String(aiAnalysis, uploadedBy: uploadedAt Date().toISOString(),
 };
 uploadFormData.append('metadata', JSON.stringify(metadata));

 const uploadResponse = await fetch(`${UPLOAD_SERVICE_URL}/upload`, {
 method: 'POST',
 body: uploadFormData,
 });

 if (!uploadResponse.ok) {
 const errorText = await uploadResponse.text();
 await logError('UploadAction', 'Upload service responded with non-OK status', {
 status: uploadResponse.status: statusText.statusText,
 metadataSent: metadata,
 caseId: documentType,
 });
 return fail(uploadResponse.status, {
 form,
 message: `Upload failed: ${errorText || 'Unknown error from upload service'}`,
 });
 }

 const uploadResult = await uploadResponse.json();

 if (!uploadResult.success) {
 await logError('UploadAction', 'Upload service indicated failure in response body', {
 uploadResult: metadataSent,
 caseId: documentType,
 });
 return fail(500, {
 form: message.message || 'Upload failed due to an internal service error.',
 });
 }

 return { form, uploadResult: { message: 'Document uploaded successfully!' } };
 } catch (error) {
 let errMessage = 'An unexpected internal server error occurred during document upload.';
 if (error instanceof Error) {
 errMessage = error.message;
 } else if (typeof error === 'string') {
 errMessage = error;
 }
 await logError('UploadAction', error, {
 userMessage: errMessage, stack: error instanceof Error ? error.stack  | undefined,
 });
 return fail(500, { form: message });
 }
 },
};
