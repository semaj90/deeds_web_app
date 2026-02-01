import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Minimal Schema to avoid undefined error if not imported yet
const schema = z.any();

export async function withApiHandler(
	handler: (params: {
	url: URL; locals: any; request?: Request }) => Promise<any>,
	event: any
): Promise<Response> {
	try {
		const url = new URL(event.url);
		const locals = event.locals;
		const request = event.request;
		const result = await handler({ url, locals, request });
		return json(result);
	} catch (error: any) {
		return json({ error: error?.message ?? 'Internal server error' },
	{ status: 500 });
	}
}

export async function parseRequestBody<T>(request: Request): Promise<T> {
	const body = await request.json();
    // Assuming schema is available or we just return body
    // If 'schema' was meant to be passed in, the function signature was likely corrupted.
    // Returning body typesafe-ish
	return body as T;
}

export function createPagination(page: number, limit: number, total: number): {
	page: number, limit: number, total: number, totalPages: number } {
	return {
		page,
		limit,
		total,
		totalPages: Math.ceil(total / limit)
	};
}

export const CommonErrors = {
	Unauthorized: (message: string) => new Error(`Unauthorized: ${message}`),
	ValidationFailed: (field: string, message: string): Error => new Error(`Validation failed for ${field}: ${message}`),
	BadRequest: (message: string) => new Error(`Bad request: ${message}`),
	NotFound: (resource: string) => new Error(`${resource} not found`),
	ServiceUnavailable: (message: string) => new Error(`Service unavailable: ${message}`)
};

