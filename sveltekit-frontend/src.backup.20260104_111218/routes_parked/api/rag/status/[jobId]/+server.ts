// src/routes/api/rag/status/[jobId]/+server.ts
import { getDocStatus } from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/rag/sdk';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types // TODO: Verify store subscription is correct for Svelte 5.js';

export const GET: RequestHandler = async ({ params }) => {
 try {
 const { jobId } = params;

 if (!jobId) {
 throw error(400, 'Missing jobId parameter');
 }

 // Get document processing status
 const status = await getDocStatus(jobId);

 return json({
 success: true,
 status,
 });
 } catch (err) {
 console.error('Status check error:', err);
 throw error(500, 'Failed to retrieve document status');
 }
};
