/** Shared types and utility functions for Evidence components */

export type CaseSelection = {
	id: string;
	title: string;
};

export type CaseLinkTarget = {
	id: string;
	label: string;
};

export type AdvancedEvidenceFilters = {
	search: string;
	type: string;
	status: string;
	case: string;
	dateRange: string;
	aiAnalyzed: string;
};

export const defaultAdvancedFilters: AdvancedEvidenceFilters = {
	search: '',
	type: 'all',
	status: 'all',
	case: 'all',
	dateRange: 'all',
	aiAnalyzed: 'all'
};

const typeIcons: Record<string, string> = {
	'application/pdf': '📄',
	'image/jpeg': '🖼️',
	'image/png': '🖼️',
	'image/gif': '🖼️',
	'application/msword': '📝',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
	'text/plain': '📃',
	default: '📎'
};

const typeLabels: Record<string, string> = {
	'application/pdf': 'PDF',
	'image/jpeg': 'Image',
	'image/png': 'Image',
	'image/gif': 'Image',
	'application/msword': 'Document',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Document',
	'text/plain': 'Text',
	default: 'File'
};

export function formatFileSize(bytes: number): string {
	if (!bytes || bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function formatDate(date: string | Date): string {
	if (!date) return '';
	return new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function getIcon(fileType: string): string {
	return typeIcons[fileType] ?? typeIcons.default;
}

export function getTypeLabel(fileType: string): string {
	return typeLabels[fileType] ?? typeLabels.default;
}
