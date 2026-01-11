import { vectorizeError } from '$lib/phase72/astVectorizer';
import { pool } from '$lib/server/db.ts';
import { json } from '@sveltejs/kit';
import crypto from 'node:crypto';
import type { RequestHandler } from './$types.js';

type CapturePayload = {
 route?: string; file_path: string;
 line?: number;
 col?: number;
 code?: string;
 severity?: string; message: string;
 phase?: number;
 cycle?: number;
};

export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = (await request.json()) as CapturePayload;

 const {
 file_path,
 line = 1,
 col = 1,
 code = 'VITE_ERROR',
 severity = 'error',
 message,
 phase = 72,
 cycle = 1,
 } = body;

 if (!file_path || !message) {
 return json({ error: 'file_path and message are required' }, { status: 400 });
 }

 const hashInput = `${ file_path }:${ line }:${ col }:${ code }:${ message }`;
 const error_hash = crypto.createHash('sha256').update(hashInput).digest('hex');

 // Generate embedding for semantic clustering (async, non-blocking)
 const embeddingPromise = vectorizeError(message).catch((err) => {
 console.warn('[phase72] Embedding failed:', err);
 return null;
 });

 const client = await pool.connect();
 try {
 // Wait for embedding before insert
 const embedding = await embeddingPromise;
 const embeddingArray = embedding ? `[${embedding.join(',')}]` : null;

 await client.query(
 `
				INSERT INTO phase72_error (
					error_hash, file_path, line, col, code, severity, message, phase, cycle, embedding
				)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
				ON CONFLICT (error_hash) DO UPDATE
				SET
					occurrence_count = phase72_error.occurrence_count + 1,
					last_seen = NOW(),
					embedding = COALESCE(EXCLUDED.embedding, phase72_error.embedding)
				`,
 [error_hash, file_path, line, col, code, severity, message, phase, cycle, embeddingArray]
 );

 console.log(`[phase72] Captured: ${code} in ${ file_path }:${ line }:${ col }`);
 } finally {
 client.release();
 }

 return json({ ok: true, error_hash });
 } catch (err) {
 console.error('[phase72] capture-error failed:', err);
 return json({ error: 'Failed to capture error' }, { status: 500 });
 }
};

