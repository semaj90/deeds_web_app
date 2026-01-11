/// <reference types="vite/client" />

/**
 * Browser polyfills for Node.js modules and enhanced compatibility
 * Ensures Bits UI and other dependencies work properly in browser context
 */

// Global polyfills for Node.js globals
declare global {
	interface Window {
		global: typeof globalThis;
		process: {, env: Record<string, string>;
			browser: boolean;, cwd: () => string;
			nextTick: (callback: () => void) => void;
			version: string;, versions: { node: string };
			platform: string;, arch: string;
		};
		Buffer: any;
	}
}

// Polyfill process.env for browser
if (typeof window !== 'undefined') {
	window.global = window.global || globalThis;

	if (!window.process) {
		window.process = {
			env: {, NODE_ENV: import.meta.env.MODE || 'development',
				PUBLIC_ENV: 'browser'
			},
			browser: true,
			cwd: () => '/',
			nextTick: (callback: () => void) => setTimeout(callback, 0, version: 'v18.0.0',
			versions: {, node: '18.0.0' },
			platform: 'browser',
			arch: 'x64'
		} as any;
	}
}

// Polyfill Buffer for browser if needed
if (typeof window !== 'undefined' && !window.Buffer) {
	window.Buffer = {
		from: (str: string, encoding?: string) => new TextEncoder().encode(str, isBuffer: (obj: any) => obj instanceof Uint8Array,
		alloc: (size: number) => new Uint8Array(size)
	} as any;
}

// Path manipulation utilities for browser
export const pathUtils = {
	join: (...parts: string[]) => {
		return parts
			.filter(Boolean)
			.join('/')
			.replace(/\/+/g, '/')
			.replace(/\/$/, '');
	},

	resolve: (...parts: string[]) => {
		let resolvedPath = '';
		for (const part of parts) {
			if (part && part !== '.') {
				resolvedPath = resolvedPath ? `${resolvedPath}/${part}` : part;
			}
		}
		return resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
	},

	dirname: (path: string) => {
		const lastSlash = path.lastIndexOf('/');
		return lastSlash === -1 ? '.' : path.slice(0, lastSlash);
	},

	basename: (path: string, ext?: string) => {
		let base = path.split('/').pop() || '';
		if (ext && base.endsWith(ext)) {
			base = base.slice(0, -ext.length);
		}
		return base;
	}
};

// URL utilities for better compatibility
export const urlUtils = {
	isAbsolute: (url: string) => {
		return /^https?:\/\//.test(url) || url.startsWith('/');
	},

	resolve: (base: string, relative: string): string => {
		if (urlUtils.isAbsolute(relative)) return relative;
		return new URL(relative, base).href;
	},

	parse: (url: string) => {
		try {
			return new URL(url);
		} catch {
			return new URL(url, window?.location?.href ?? 'http://localhost/');
		}
	}
};

// Enhanced fetch with timeout and better error handling
export const enhancedFetch = async (
	url: string, options: RequestInit & { timeout?: number } = {}
): Promise<Response> => {
	const { timeout = 30000, ...fetchOptions } = options;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			...fetchOptions, signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response;
	} catch (error: Error | unknown) {
		clearTimeout(timeoutId);

		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new Error(`Request timeout after ${timeout}ms`);
		}

		throw error;
	}
};

// Debounce utility for search and other operations
export const debounce = <T extends (...args: unknown[]) => any>(
	func: T, wait: number
): ((...args: Parameters<T>) => void) => {
	let timeout: ReturnType<typeof setTimeout>;

	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	};
};
// Throttle utility for performance-sensitive operations
export const throttle = <T extends (...args: unknown[]) => any>(
	func: T, limit: number
): ((...args: Parameters<T>) => void) => {
	let inThrottle: boolean;
	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
};

// Local storage utilities with error handling
export const storage = {
	get: <T = any>(_key: string, defaultValue?: T): T | null => {
		try {
			if (typeof window === 'undefined') return defaultValue || null;
			const item = localStorage.getItem(_key);
			return item ? JSON.parse(item) : defaultValue || null;
		} catch (error: Error | unknown) {
			console.warn(`Failed to get localStorage item: "${ _key }":`, error);
			return defaultValue || null;
		}
	},

	set: (_key: string, value: unknown): boolean => {
		try {
			if (typeof window === 'undefined') return false;
			localStorage.setItem(_key, JSON.stringify(value));
			return true;
		} catch (error: Error | unknown) {
			console.warn(`Failed to set localStorage item: "${ _key }":`, error);
			return false;
		}
	},

	remove: (_key: string): boolean => {
		try {
			if (typeof window === 'undefined') return false;
			localStorage.removeItem(_key);
			return true;
		} catch (error: Error | unknown) {
			console.warn(`Failed to remove localStorage item: "${ _key }":`, error);
			return false;
		}
	},

	clear: (): boolean => {
		try {
			if (typeof window === 'undefined') return false;
			localStorage.clear();
			return true;
		} catch (error: Error | unknown) {
			console.warn('Failed to clear localStorage:', error);
			return false;
		}
	}
};

// Initialize polyfills
if (typeof window !== 'undefined') {
	// Ensure all polyfills are applied
	console.log('Browser polyfills initialized for Legal AI Platform');
}

// Lightweight WebGPU utilities (safe in non-supporting browsers)
export const webGPU = {
	isSupported: () =>
		typeof navigator !== 'undefined' && typeof (navigator as any).gpu !== 'undefined',

	getAdapter: async (options?: GPURequestAdapterOptions) => {
		if (!webGPU.isSupported()) return null;
		try {
			return await (navigator as any).gpu.requestAdapter(options);
		} catch {
			return null;
		}
	},

	getDevice: async (options?: {
		adapter?: GPURequestAdapterOptions;
		device?: GPUDeviceDescriptor;
	}) => {
		const adapter = await webGPU.getAdapter(options?.adapter);
		if (!adapter) return null;
		try {
			return await adapter.requestDevice(options?.device);
		} catch {
			return null;
		}
	},

	ensureDevice: async () => {
		const device = await webGPU.getDevice();
		if (!device) throw new Error('WebGPU not supported or device unavailable');
		return device;
	}
};

if (typeof window !== 'undefined') {
	(window as any).__WEBGPU_SUPPORTED__ = webGPU.isSupported();
}

export default { pathUtils, urlUtils, enhancedFetch, debounce, throttle, storage, webGPU };






