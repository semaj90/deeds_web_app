import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from './database-url.js';

describe('resolveDatabaseUrl', () => {
	it('prefers DATABASE_URL over the legacy POSTGRES_URL alias', () => {
		expect(
			resolveDatabaseUrl('postgresql://db/app', 'postgresql://legacy/app'),
		).toBe('postgresql://db/app');
	});

	it('accepts the legacy POSTGRES_URL alias when DATABASE_URL is absent', () => {
		expect(resolveDatabaseUrl(undefined, 'postgres://db/app')).toBe('postgres://db/app');
	});

	it('fails closed when neither URL is configured', () => {
		expect(() => resolveDatabaseUrl()).toThrow('DATABASE_URL_REQUIRED');
	});

	it('rejects non-PostgreSQL URLs', () => {
		expect(() => resolveDatabaseUrl('http://db/app')).toThrow('DATABASE_URL_INVALID');
	});
});
