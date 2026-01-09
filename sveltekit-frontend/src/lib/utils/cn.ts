import { clsx, type ClassValue } from 'clsx';

/**
 * Utility function to merge CSS classes
 * Using UnoCSS instead of Tailwind, so no merge deduplication needed
 */
export function cn(...inputs: ClassValue[]): string {
	return clsx(inputs);
}

/**
 * Legal-specific class name utility with YoRHa theme integration
 */
export function legalCn(...inputs: ClassValue[]): string {
	const baseClasses = 'font-mono text-yorha-text-primary';
	return clsx(baseClasses, ...inputs);
}
/**
 * Generate confidence-based styling classes
 */
export function confidenceClass(confidence: number): string {
	if (confidence >= 90) return 'text-green-400 bg-green-500/10 border-green-500/30';
	if (confidence >= 70) return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
	if (confidence >= 50) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
	if (confidence >= 30) return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
	return 'text-red-400 bg-red-500/10 border-red-500/30';
}
/**
 * Generate priority-based styling classes
 */
export function priorityClass(priority: 'low' | 'medium' | 'high' | 'critical'): string {
	switch (priority) {
		case 'critical':
			return 'text-red-400 bg-red-500/20 border-red-500/40 ring-red-500/20';
		case 'high':
			return 'text-orange-400 bg-orange-500/20 border-orange-500/40 ring-orange-500/20';
		case 'medium':
			return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/40 ring-yellow-500/20';
		case 'low':
			return 'text-green-400 bg-green-500/20 border-green-500/40 ring-green-500/20';
		default:
			return 'text-gray-400 bg-gray-500/20 border-gray-500/40 ring-gray-500/20';
	}
}
