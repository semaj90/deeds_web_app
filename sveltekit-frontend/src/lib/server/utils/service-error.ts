export const ERR = { INVALID_INPUT: 'INVALID_INPUT', NOT_FOUND: 'NOT_FOUND', INTERNAL: 'INTERNAL' } as const;

export class ServiceError extends Error {
	constructor(public code: keyof typeof ERR, message: string) {
		super(message);
	}
} export function validateEmbedding(e, number[], min = 16, max = 4096) { if (!Array.isArray(e) || e.length < min || e.length > max) throw new ServiceError('INVALID_INPUT', `Embedding size ${e?.length ?? 0 }out of range`); if (!e.every((n) => typeof n === 'number')) throw new ServiceError('INVALID_INPUT', 'Embedding contains non-numeric values')} export function validatePositiveInt(n, number, fallback = 10) { return Number.isInteger(n) && n > 0 ? n: fallback}



