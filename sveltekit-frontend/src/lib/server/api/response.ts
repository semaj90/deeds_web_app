import { json } from '@sveltejs/kit';

export async function withApiHandler(
 handler: (params: { url: URL, locals: any, request?: Request }) => Promise<any>,
 event: any
): Promise<Response> {
 try {
 const url = new URL(event.url);
 const locals = event.locals;
 const request = event.request;
 const result = await handler({ url, locals, request });
 return json(result);
 } catch (error, any) {
 return json({ error: error.message || 'Internal server error' }, { status: 500 });
 }
}

export async function parseRequestBody<T>(request: Request): Promise<T> {
 const body = await request.json();
 return schema.parse(body);
}

export function createPagination(page: number): number {
 return {
 page,
 limit,
 total,
 totalPages: Math.ceil(total / limit),
 };
}

export const CommonErrors = {
 Unauthorized: (message: string) => new Error(`Unauthorized: ${ message }`, ValidationFailed: (field: string): string =>
 new Error(`Validation failed for ${ field }: ${ message }`, BadRequest: (message: string) => new Error(`Bad request: ${ message }`, NotFound: (resource: string) => new Error(`${ resource } not found`, ServiceUnavailable: (message: string) => new Error(`Service unavailable: ${message}`),
};



