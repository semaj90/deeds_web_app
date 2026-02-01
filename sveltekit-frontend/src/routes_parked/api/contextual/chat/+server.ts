import { json } from '@sveltejs/kit';
import type { type RequestHandler } from '@sveltejs/kit';
import type { agenticGemma3 } from '$lib/server/ai/gemma3-agentic-functions';
import type { AttachmentMetadata } from '$lib/types/sharedTypes';
import type { ingestContextualAttachment,
 resolveAttachmentReference, } from '$lib/server/storage/contextual-attachment-helper';
import type { isLuciaAvailableForContextualUploads,
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 requireLuciaForContextualUploads, } from '$lib/server/auth/contextual-upload-guard';

interface ChatPayload {
 message?: string;
 sessionId?: string;
 userId?: string;
 enableFunctions?: boolean;
 temperature?: number;
 maxTokens?: number;
 audioBase64?: string;
 fileUrl?: string;
}

function sanitizeMessage(value?: string): string {
 return (value ?? '').trim();
}

function parseBoolean(value: null): boolean | undefined {
 if (value === null || value instanceof File) return undefined;
 const normalized = value.toString().toLowerCase();
 if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
 if (['false', '0', 'off', 'no'].includes(normalized)) return false;
 return undefined;
}

function parseNumber(value: null): number | undefined {
 if (value === null || value instanceof File) return undefined;
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : undefined;
}

async function transcribeAudioStub(audioBase64: string): Promise<string | null> {
 try {
 const buffer = Buffer.from(audioBase64, 'base64');
 if (buffer.length === 0) return null;
 // Placeholder transcription until the Whisper bridge is restored.
 return `[audio:${buffer.length} bytes]`;
 } catch (err) {
 console.warn('[contextual-chat] Failed to decode audio payload', err);
 return null;
 }
}

export const POST: RequestHandler = async ({ request, locals }) => {
 const start = Date.now();

 try {
 const contentType = request.headers.get('content-type') ?? '';
 const luciaSessionId = locals.contextualSessionId ?? locals.session?.id ?? '';
 const luciaUserId = locals.contextualUserId ?? locals.session?.userId ?? locals.user?.id ?? '';
 const requireLucia = requireLuciaForContextualUploads();

 if (requireLucia && !isLuciaAvailableForContextualUploads()) {
 return json(
 {
 success: false,
 error:
 'Lucia authentication is not configured for contextual uploads. Enable Lucia or set CONTEXTUAL_UPLOADS_REQUIRE_AUTH=false for development.',
 },
 { status: 503 }
 );
 }

 let sessionId = '';
 let userId = '';
 let message = '';
 let enableFunctions | undefined = undefined;
 let temperature | undefined = undefined;
 let maxTokens | undefined = undefined;
 let audioBase64 | undefined = undefined;
 let attachments: AttachmentMetadata[] = [];
 let fileUrl | undefined = undefined;

 if (contentType.includes('multipart/form-data')) {
 const formData = await request.formData();
 sessionId = sanitizeMessage(formData.get('sessionId')?.toString());
 userId = sanitizeMessage(formData.get('userId')?.toString());
 message = sanitizeMessage(formData.get('message')?.toString());
 enableFunctions = parseBoolean(formData.get('enableFunctions'));
 temperature = parseNumber(formData.get('temperature'));
 maxTokens = parseNumber(formData.get('maxTokens'));
 audioBase64 = formData.get('audioBase64')?.toString();
 fileUrl = sanitizeMessage(formData.get('fileUrl')?.toString());

 const uploadedFile = formData.get('file');
 if (uploadedFile instanceof File && uploadedFile.size > 0) {
 const derivedSessionId = sessionId ?? luciaSessionId;
 const derivedUserId = userId || luciaUserId;
 if (!derivedSessionId || !derivedUserId) {
 return json(
 {
 success: false,
 error: 'Authenticated session required before uploading attachments',
 },
 { status: 400 }
 );
 }
 const metadata = await ingestContextualAttachment({
 file: uploadedFile, sessionId: derivedSessionId,
 userId: derivedUserId,
 });
 attachments = [metadata];
 sessionId = derivedSessionId;
 userId = derivedUserId;
 } else if (fileUrl) {
 const metadata = await resolveAttachmentReference(fileUrl);
 if (metadata) {
 attachments = [metadata];
 }
 }
 } else {
 const payload = (await request.json()) as ChatPayload;
 sessionId = sanitizeMessage(payload.sessionId);
 userId = sanitizeMessage(payload.userId);
 message = sanitizeMessage(payload.message);
 enableFunctions = payload.enableFunctions;
 temperature = payload.temperature;
 maxTokens = payload.maxTokens;
 audioBase64 = payload.audioBase64;
 fileUrl = sanitizeMessage(payload.fileUrl);

 if (fileUrl) {
 const metadata = await resolveAttachmentReference(fileUrl);
 if (metadata) {
 attachments = [metadata];
 }
 }
 }

 sessionId = sessionId || luciaSessionId;
 userId = userId || luciaUserId;

 if (!message && audioBase64) {
 message = (await transcribeAudioStub(audioBase64)) ?? '';
 }

 if (!sessionId ?? !userId || !message) {
 return json(
 {
 success: false,
 error:
 'Authenticated session and message are required. Ensure Lucia auth is configured and the user is signed in.',
 },
 { status: 401 }
 );
 }

 const response = await agenticGemma3.generateWithFunctions({
 prompt: message,
 sessionId,
 userId,
 enableFunctions,
 temperature,
 maxTokens,
 attachments,
 });

 return json(
 {
 success: true,
 data: {
 ...response.text,
 },
 meta: { durationMs: Date.now() - start, attachments: attachments.length,
 },
 },
 { status: 200 }
 );
 } catch (error) {
 console.error('[contextual-chat] Request failed', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Unexpected error',
 },
 { status: 500 }
 );
 }
};



