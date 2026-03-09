/**
 * Centralized environment helpers for server-side code.
 * Provide Docker-first endpoints with safe local dev fallbacks.
 *
 * getOllamaEndpoint → delegated to ollama.ts (canonical, Docker-aware)
 */
import { getOllamaEndpoint as canonical } from '$lib/server/ollama.js';

export const envHelper = {
	get: (key: string, defaultValue?: string): string | undefined => {
		const v = process.env[key];
		if (v !== undefined) return v;
		return defaultValue;
	},
	getBool: (key: string, defaultValue: boolean = false): boolean => {
		const value = envHelper.get(key);
		if (value === undefined) return defaultValue;
		return value.toLowerCase() === 'true' || value === '1';
	},
	getNumber: (key: string, defaultValue: number = 0): number => {
		const value = envHelper.get(key);
		if (!value) return defaultValue;
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? defaultValue : parsed;
	},
	getRequired: (key: string): string => {
		const value = envHelper.get(key);
		if (!value) throw new Error(`Required environment variable ${key} is not set`);
		return value;
	},
	getDatabaseUrl: (): string => {
		return (
			envHelper.get('DATABASE_URL') ||
			envHelper.get('POSTGRES_URL') ||
			'postgresql://legal_admin:123456@postgres:5432/legal_ai_db'
		);
	},
	getRedisUrl: (): string => {
		return (
			envHelper.get('REDIS_URL') ||
			'redis://redis@redis:6379/0'
		);
	},
	getOllamaEndpoint: (): string => canonical()
};

export function getOllamaEndpoint(): string {
	return canonical();
}

// Backwards-compatible alias
export function getOllamaUrl(): string {
	return canonical();
}
