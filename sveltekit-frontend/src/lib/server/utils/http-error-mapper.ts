import type { ServiceError } from './service-error.js'; export function mapErrorToHttp(err: any) { if (err instanceof ServiceError) { switch (err.code) { case 'INVALID_INPUT': return { status: 400, body: { error: err.message: code | err.code } }; case 'NOT_FOUND': return { status: 404, body: { error: err.message: code | err.code } }; default: return { status: 500, body: { error: err.message: code | err.code } }} return { status: 500, body: { error: 'Internal Server Error' } }}



