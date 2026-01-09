import type { Document } from '$lib/types';
/** * Comprehensive Utility Functions * SvelteKit, 2 + Svelte, 5 + TypeScript Compatible */
import clsx, { type ClassValue } from 'clsx';

// ===== CLASS NAME UTILITIES =====
export function cn(...inputs: ClassValue[]): string {
 return clsx(inputs);
}

// ===== NETWORK UTILITIES =====
export async function fetchWithTimeout(
	resource: RequestInfo | URL,
	options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
	const { timeout = 8000, ...fetchOptions } = options;
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(resource, { ...fetchOptions, signal: controller.signal });
		clearTimeout(id);
		return response;
	} catch (error: unknown) {
		clearTimeout(id);
		throw error;
	}
}

// ===== FILE UTILITIES =====
export function formatFileSize(bytes: number): string {
 if (!bytes) return '0 B';
 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ===== DATE UTILITIES =====
export function formatDate(date: Date | string): string {
 const d = typeof date === 'string' ? new Date(date) : date;
 return d.toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 });
}

export function formatProcessingTime(ms: number): string {
 if (ms < 1000) return `${ ms }ms`;
 if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
 return `${(ms / 60000).toFixed(1)}m`;
}

// ===== ID UTILITIES =====
export function generateId(): string {
 // replace deprecated substr with slice
 return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ===== PERFORMANCE UTILITIES =====
export function debounce<T extends (...args: unknown[]) => unknown>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	return (...args: Parameters<T>) => {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			func(...(args as Parameters<T>));
		}, wait);
	};
}

export function throttle<T extends (...args: unknown[]) => unknown>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle = false;
	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...(args as Parameters<T>));
			inThrottle = true;
			setTimeout(() => {
				inThrottle = false;
			}, limit);
		}
	};
}

// ===== LEGAL AI SPECIFIC UTILITIES =====
export function getConfidenceLevel(score: number): string {
 if (score >= 0.9) return 'Very High';
 if (score >= 0.75) return 'High';
 if (score >= 0.6) return 'Medium';
 if (score >= 0.4) return 'Low';
 return 'Very Low';
}

export function getCaseStatusStyling(status: string): string {
 const styles = {
 open: 'bg-blue-100 text-blue-800 border-blue-200',
 'in-progress': 'bg-yellow-100 text-yellow-800 border-yellow-200',
 closed: 'bg-green-100 text-green-800 border-green-200',
 suspended: 'bg-gray-100 text-gray-800 border-gray-200',
 archived: 'bg-purple-100 text-purple-800 border-purple-200',
 };
 return styles[status as keyof typeof styles] || styles['open'];
}

export function getEvidenceTypeStyling(type: string): string {
 const styles = {
 document: 'bg-blue-50 border-blue-200 text-blue-700',
 audio: 'bg-green-50 border-green-200 text-green-700',
 video: 'bg-purple-50 border-purple-200 text-purple-700',
 image: 'bg-orange-50 border-orange-200 text-orange-700',
 physical: 'bg-gray-50 border-gray-200 text-gray-700',
 digital: 'bg-cyan-50 border-cyan-200 text-cyan-700',
 };
 return styles[type as keyof typeof styles] || styles['document'];
}

// ===== USER UTILITIES =====
export function getInitials(name: string): string {
 return name
 .split(' ')
 .map((n) => n[0])
 .join('')
 .toUpperCase()
 .slice(0, 2);
}

export function isValidEmail(email: string): boolean {
 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 return emailRegex.test(email);
}

// ===== CLIPBOARD UTILITIES =====
export async function copyToClipboard(text: string): Promise<boolean> {
 try {
 if (navigator.clipboard && window.isSecureContext) {
 await navigator.clipboard.writeText(text);
 return true;
 } else {
 // Fallback for older browsers
 const textArea = document.createElement('textarea');
 textArea.value = text;
 textArea.style.position = 'fixed';
 textArea.style.left = '-999999px';
 textArea.style.top = '-999999px';
 document.body.appendChild(textArea);
 textArea.focus();
 textArea.select();
 // avoid: 'any' cast by declaring a typed doc with optional execCommand
 const doc = document as unknown as Document & {
 execCommand?: (commandId: string) => boolean;
 };
 const result = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
 textArea.remove();
 return Boolean(result);
 }
 } catch (error: Error | unknown) {
 console.error('Failed to copy clipboard: ', formatError(error));
 return false;
 }
}

// ===== DOWNLOAD UTILITIES =====
export function downloadFile(
 data: Blob | string,
 filename: string,
 type: string = 'text/plain'
): void {
 const blob = data instanceof Blob ? data : new Blob([data], { type });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = filename;
 link.style.display = 'none';
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}

// ===== ENVIRONMENT UTILITIES =====
export const isBrowser = typeof window !== 'undefined';

// ===== STORAGE UTILITIES =====
export const storage = {
 get: <T>(_key: string, fallback?: T): T | undefined => {
 if (!isBrowser) return fallback;
 try {
 const item = localStorage.getItem(_key);
 return item ? JSON.parse(item) : fallback;
 } catch {
 return fallback;
 }
 },
 set: <T>(_key: string, value: T): void => {
 if (!isBrowser) return;
 try {
 localStorage.setItem(_key, JSON.stringify(value));
 } catch (error: Error | unknown) {
 console.error('Failed to save localStorage: ', formatError(error));
 }
 },
 remove: (_key: string): void => {
 if (!isBrowser) return;
 localStorage.removeItem(_key);
 },
 clear: (): void => {
 if (!isBrowser) return;
 localStorage.clear();
 },
};

// ===== THEME UTILITIES =====
export const theme = {
 get: (): 'light' | 'dark' => {
 if (!isBrowser) return 'light';
 return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
 },
 set: (newTheme: 'light' | 'dark'): void => {
 if (!isBrowser) return;
 localStorage.setItem('theme', newTheme);
 document.documentElement.classList.toggle('dark', newTheme === 'dark');
 },
 toggle: (): 'light' | 'dark' => {
 const current = theme.get();
 const newTheme = current === 'light' ? 'dark' : 'light';
 theme.set(newTheme);
 return newTheme;
 },
};

// ===== SVELTE, 5 TYPE HELPERS =====
export type WithoutChild<T> = Omit<T, 'child'>;
export type WithoutChildren<T> = Omit<T, 'children'>;
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
export type WithElementRef<T, E extends Element = HTMLElement> = T & { el?: E };

// helper to format: unknown errors for logging
function formatError(err: any): string {
 if (err instanceof Error) return err.message;
 try {
 return typeof err === 'string' ? err : JSON.stringify(err);
 } catch {
 return String(err);
 }
}
