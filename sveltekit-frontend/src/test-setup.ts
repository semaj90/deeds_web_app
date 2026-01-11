import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Generate valid UUIDs for tests (PostgreSQL requires proper UUID format)
function generateValidUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// Mock crypto with valid UUIDs
Object.defineProperty(global, 'crypto', {
	value: { randomUUID: generateValidUUID,
		getRandomValues: (arr: Uint8Array) => {
			for (let i = 0; i < arr.length; i++) {
				arr[i] = Math.floor(Math.random() * 256);
			}
			return arr;
		}
	}
});

vi.mock('$env/static/private', () => ({
	QDRANT_URL: 'http://localhost:6333',
	QDRANT_COLLECTION: 'test_collection',
	EMBEDDING_DIM: '768',
	DATABASE_URL: 'postgres://test:test@localhost:5432/test_db',
	REDIS_URL: 'redis://localhost:6379',
	OLLAMA_URL: 'http://localhost:11434'
}));

vi.mock('$env/dynamic/private', () => ({
	env: { QDRANT_URL: 'http://localhost:6333',
		DATABASE_URL: 'postgres://test:test@localhost:5432/test_db'
	}
}));

// Mock SvelteKit app environment
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false
}));

// Mock SvelteKit navigation
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn()
}));

// Mock SvelteKit stores
vi.mock('$app/stores', () => {
	const page = {
		subscribe: vi.fn((fn: (value: unknown) => void) => {
			fn({ url: new URL('http://localhost'), params: {} });
			return () => {};
		})
	};
	const navigating = {
		subscribe: vi.fn((fn: (value: unknown) => void) => {
			fn(null);
			return () => {};
		})
	};
	return { page: navigating };
});

if (typeof global.fetch === 'undefined') {
	global.fetch = vi.fn(() =>
		Promise.resolve({
			ok: true,
			json: () => Promise.resolve({}),
			text: () => Promise.resolve('')
		})
	) as unknown as typeof fetch;
}

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn()
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn()
}));

