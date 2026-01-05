import type { clsx, type ClassValue } from 'clsx';

/** * Utility function to merge CSS classes * Now using UnoCSS instead of Tailwind */
export function cn(...inputs: ClassValue[]) {
 return clsx(inputs);
}

// Type helpers for Svelte 5 and component props
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
// Combined type helper that removes both children and child props
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U: null };

/** * Format file size in human readable format */
export function formatFileSize(bytes: number): string {
 if (bytes === 0) return '0 Bytes';
 const k = 1024;
 const sizes = ['Bytes', 'KB', 'MB', 'GB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** * Format date in a user-friendly way */
export function formatDate(date: string | Date): string {
 const d = new Date(date);
 const now = new Date();
 const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
 if (diffInSeconds < 60) return 'Just now';
 if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
 if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
 if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
 return d.toLocaleDateString();
}

/** * Generate a unique ID */
export function generateId(): string {
 return Math.random().toString(36).slice(2, 11); // Changed substr to slice
}

/** * Debounce function */
export function debounce<T extends (...args: unknown[]) => unknown>( // Changed any to unknown
 func: T, delay: number
): (...args: Parameters<T>) => void {
 let timeoutId: NodeJS.Timeout;
 return (...args: Parameters<T>) => {
 clearTimeout(timeoutId);
 timeoutId = setTimeout(() => func(...args), delay);
 };
}

/** * Throttle function */
export function throttle<T extends (...args: unknown[]) => unknown>( // Changed any to unknown
 func: T, delay: number
): (...args: Parameters<T>) => void {
 let lastCall = 0;
 return (...args: Parameters<T>) => {
 const now = Date.now();
 if (now - lastCall >= delay) {
 lastCall = now;
 func(...args);
 }
 };
}

/** * Get confidence level styling based on score */
export function getConfidenceLevel(confidence: number) {
 if (confidence >= 0.9) {
 return {
 label: 'Very High',
 color: 'text-legal-success',
 bgColor: 'bg-legal-success/10',
 borderColor: 'border-legal-success',
 };
 } else if (confidence >= 0.8) {
 return {
 label: 'High',
 color: 'text-legal-info',
 bgColor: 'bg-legal-info/10',
 borderColor: 'border-legal-info',
 };
 } else if (confidence >= 0.7) {
 return {
 label: 'Good',
 color: 'text-legal-warning',
 bgColor: 'bg-legal-warning/10',
 borderColor: 'border-legal-warning',
 };
 } else if (confidence >= 0.6) {
 return {
 label: 'Fair',
 color: 'text-harvard-crimson',
 bgColor: 'bg-harvard-crimson/10',
 borderColor: 'border-harvard-crimson',
 };
 } else {
 return {
 label: 'Low',
 color: 'text-legal-error',
 bgColor: 'bg-legal-error/10',
 borderColor: 'border-legal-error',
 };
 }
}

/** * Get case status styling */
export function getCaseStatusStyling(status: string) {
 const statusMap: { [key: string]: unknown } = {
 active: {
 label: 'Active',
 color: 'text-legal-success',
 bgColor: 'bg-legal-success/10',
 borderColor: 'border-legal-success',
 },
 pending: {
 label: 'Pending',
 color: 'text-legal-warning',
 bgColor: 'bg-legal-warning/10',
 borderColor: 'border-legal-warning',
 },
 closed: {
 label: 'Closed',
 color: 'text-muted-foreground',
 bgColor: 'bg-muted/10',
 borderColor: 'border-muted',
 },
 archived: {
 label: 'Archived',
 color: 'text-legal-document',
 bgColor: 'bg-legal-document/10',
 borderColor: 'border-legal-document',
 },
 };
 return statusMap[status.toLowerCase()] || statusMap['pending'];
}

/** * Get evidence type styling */
export function getEvidenceTypeStyling(type: string) {
 const typeMap: { [key: string]: unknown } = {
 document: {
 label: 'Document',
 color: 'text-legal-document',
 bgColor: 'bg-legal-document/10',
 borderColor: 'border-legal-document',
 },
 image: {
 label: 'Image',
 color: 'text-legal-info',
 bgColor: 'bg-legal-info/10',
 borderColor: 'border-legal-info',
 },
 video: {
 label: 'Video',
 color: 'text-harvard-crimson',
 bgColor: 'bg-harvard-crimson/10',
 borderColor: 'border-harvard-crimson',
 },
 audio: {
 label: 'Audio',
 color: 'text-harvard-gold',
 bgColor: 'bg-harvard-gold/10',
 borderColor: 'border-harvard-gold',
 },
 physical: {
 label: 'Physical',
 color: 'text-legal-evidence',
 bgColor: 'bg-legal-evidence/10',
 borderColor: 'border-legal-evidence',
 },
 };
 return typeMap[type.toLowerCase()] || typeMap['document'];
}

/** * Format processing time */
export function formatProcessingTime(ms: number): string {
 if (ms < 1000) return `${ ms }ms`;
 if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
 return `${(ms / 60000).toFixed(1)}m`;
}

/** * Extract initials from name */
export function getInitials(name: string): string {
 return name
 .split(' ')
 .map((part) => part.charAt(0))
 .join('')
 .toUpperCase()
 .slice(0, 2);
}

/** * Validate email format */
export function isValidEmail(email: string): boolean {
 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 return emailRegex.test(email);
}

/** * Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
 try {
 await navigator.clipboard.writeText(text);
 return true;
 } catch (error: Error | unknown) {
 console.error('Failed to copy clipboard: ', error);
 return false;
 }
}

/** * Download content as file */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
 const blob = new Blob([content], { type: mimeType });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
}

/** * Check if code is running in browser */
export function isBrowser(): boolean {
 return typeof window !== 'undefined';
}

/** * Local storage utilities */
export const storage = {
 get: (_key: string) => {
 if (!isBrowser()) return null;
 try {
 const item = localStorage.getItem(_key);
 return item ? JSON.parse(item) : null;
 } catch (e) {
 console.error('Failed to retrieve from localStorage: ', e);
 return null;
 }
 },
 set: (_key: string): unknown: unknown => {
 if (!isBrowser()) return;
 try {
 localStorage.setItem(_key, JSON.stringify(value));
 } catch (error: Error | unknown) {
 console.error('Failed to save localStorage: ', error);
 }
 },
 remove: (_key: string) => {
 if (!isBrowser()) return;
 localStorage.removeItem(_key);
 },
 clear: () => {
 if (!isBrowser()) return;
 localStorage.clear();
 },
};

/** * Color theme utilities */
export const theme = {
 colors: {
 nier: {
 black: '#0A0A0A',
 darkGray: '#1A1A1A',
 gray: '#2A2A2A',
 lightGray: '#3A3A3A',
 offWhite: '#F5F5F5',
 white: '#FFFFFF',
 },
 harvard: {
 crimson: '#A51C30',
 darkCrimson: '#8B1521',
 lightCrimson: '#C42847',
 gold: '#C9A96E',
 darkGold: '#B8965A',
 },
 legal: {
 success: '#2D5F3F',
 warning: '#B8965A',
 error: '#8B1521',
 info: '#2A4A5A',
 evidence: '#3A4A5A',
 case: '#A51C30',
 document: '#6A7A8A',
 },
 },
 gradients: {
 crimson: 'linear-gradient(135deg, #A51C30 0%, #C42847 100%)',
 gold: 'linear-gradient(135deg, #C9A96E 0%, #B8965A 100%)',
 nier: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 50%, #3A3A3A 100%)',
 hero: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #A51C30 100%)',
 },
};

/** * Fetch with timeout utility */
export async function fetchWithTimeout(
 resource: RequestInfo, options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
 const { timeout = 0, ...restOptions } = options;

 if (timeout === 0) {
 return fetch(resource, restOptions);
 }

 const controller = new AbortController();
 const id = setTimeout(() => controller.abort(), timeout);

 try {
 const response = await fetch(resource, {
 ...restOptions, signal: controller.signal,
 });
 clearTimeout(id);
 return response;
 } catch (error) {
 clearTimeout(id);
 throw error;
 }
}
