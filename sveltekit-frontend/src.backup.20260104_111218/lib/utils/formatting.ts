/**
 * App-wide Formatting Utilities
 * Consistent formatting functions for timestamps, text truncation, and file display
 */

// ===== TIMESTAMP FORMATTING =====

/**
 * Format timestamp with relative time for compact display
 * Examples: now | 2m, 3h, 1d, 2w, 3mo, 1y
 */
export function formatRelativeTime(date: Date): string {
 // support Date or fallback if caller supplies a non-Date (keeps call-sites unchanged)
 const ts = date instanceof Date ? date.getTime() : new Date(date).getTime();
 const now = Date.now();
 let diff = Math.floor((now - ts) / 1000); // seconds

 // future dates -> "now"
 if (diff < 0) diff = 0;
 if (diff < 5) return 'now';
 if (diff < 60) return `${diff}s`;

 const minutes = Math.floor(diff / 60);
 if (minutes < 60) return `${minutes}m`;

 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${hours}h`;

 const days = Math.floor(hours / 24);
 if (days < 7) return `${days}d`;

 const weeks = Math.floor(days / 7);
 if (weeks < 4) return `${weeks}w`;

 const months = Math.floor(days / 30);
 if (months < 12) return `${months}mo`;

 const years = Math.floor(days / 365);
 return `${years}y`;
}
/** * Format standard timestamp for display */
export function formatDate(date: Date | string): string {
 const d = typeof date === 'string' ? new Date(date) : date;
 return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}
/** * Format detailed timestamp with user context for audit trail */
export function formatDetailedTimestamp(date: Date): string {
 return date.toLocaleString(undefined, {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 hour12: true,
 });
}
/** * Format timestamp for legal document metadata */
export function formatLegalTimestamp(date: Date | string): string {
 const d = typeof date === 'string' ? new Date(date) : date;
 return d.toLocaleString('en-US', {
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 hour: '2-digit',
 minute: '2-digit',
 second: '2-digit',
 timeZoneName: 'short',
 });
}
// ===== TEXT TRUNCATION ===== /** * Smart filename truncation preserving extensions */
export function truncateFilename(filename: string, maxLength, number: string {
 if (filename.length <= maxLength) {
 return filename;
 }
 const parts = filename.split('.');
 const extension = parts.pop();
 const name = parts.join('.');
 const availableLength = maxLength - (extension ? extension.length + 1 : 0);
 if (name.length <= availableLength) {
 return filename;
 }
 const truncatedName = name.substring(0, availableLength - 3) + '...';
 return extension ? `${truncatedName}.${extension}` : truncatedName;
}
/** * General text truncation with ellipsis */
export function truncateText(text: string, maxLength, number: string {
 if (text.length <= maxLength) {
 return text;
 }
 return text.substring(0, maxLength - 3) + '...';
}
/** * Smart word truncation (breaks at word boundaries) */
export function truncateWords(text: string, maxLength: number = 50): string {
 if (text.length <= maxLength) return text;
 const truncated = text.substring(0, maxLength);
 const lastSpaceIndex = truncated.lastIndexOf(' ');
 if (lastSpaceIndex > maxLength * 0.6) {
 return truncated.substring(0, lastSpaceIndex) + '...';
 }
 return truncated.substring(0, maxLength - 3) + '...';
}
/** * Truncate legal case title for display */
export function truncateCaseTitle(title: string, maxLength: number = 40): string {
 return truncateWords(title, maxLength);
}
// ===== FILE UTILITIES ===== /** * Format file size in human-readable format */
export function formatFileSize(bytes: number): string {
 if (bytes === 0) return '0 B';
 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/** * Get file icon emoji based on type */
export function getFileIcon(filename: string): string {
 const extension = filename.split('.').pop()?.toLowerCase();
 switch (extension) {
 case 'pdf':
 return '📄';
 case 'doc':
 case 'docx':
 return '📝';
 case 'xls':
 case 'xlsx':
 return '📊';
 case 'jpg':
 case 'jpeg':
 case 'png':
 case 'gif':
 return '🖼️';
 case 'mp4':
 case 'mov':
 return '🎬';
 case 'txt':
 return '📃';
 default:
 return '📁';
 }
}
/**
 * Detect file type from filename
 */
export function detectFileType(filename: string): string {
 const extension = filename.split('.').pop()?.toLowerCase() || '';

 // Image types
 if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(extension)) {
 return 'image';
 }
 // Document types
 if (['pdf', 'doc', 'docx', 'rtf', 'odt'].includes(extension)) {
 return 'document';
 }
 // Spreadsheet types
 if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
 return 'spreadsheet';
 }
 // Presentation types
 if (['ppt', 'pptx', 'odp'].includes(extension)) {
 return 'presentation';
 }
 // Audio types
 if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension)) {
 return 'audio';
 }
 // Video types
 if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(extension)) {
 return 'video';
 }
 // Text types
 if (['txt', 'md', 'json', 'xml', 'yml', 'yaml'].includes(extension)) {
 return 'text';
 }
 // Archive types
 if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
 return 'archive';
 }
 // Code types
 if (
 ['js', 'ts', 'html', 'css', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'php'].includes(extension)
 ) {
 return 'code';
 }
 return 'unknown';
}
/** * Get priority badge color based on priority level */
export function getPriorityColor(priority: string): string {
 switch (priority.toLowerCase()) {
 case 'critical':
 return 'is-error';
 case 'high':
 return 'is-warning';
 case 'medium':
 return 'is-primary';
 case 'low':
 return 'is-success';
 default:
 return 'is-disabled';
 }
}
/** * Get status badge color based on status */
export function getStatusColor(status: string): string {
 switch (status.toLowerCase()) {
 case 'active':
 case 'open':
 case 'in_progress':
 return 'is-primary';
 case 'completed':
 case 'closed':
 return 'is-success';
 case 'pending':
 return 'is-warning';
 case 'cancelled':
 case 'rejected':
 return 'is-error';
 case 'draft':
 return 'is-disabled';
 default:
 return '';
 }
}
// ===== LEGAL SPECIFIC UTILITIES ===== /** * Format legal case: number for display */
export function formatCaseNumber(caseNumber: string): string {
 // Remove spaces and format consistently
 return caseNumber.replace(/\s+/g, ' ').trim().toUpperCase();
}
/** * Format jurisdiction display */
export function formatJurisdiction(jurisdiction: string): string {
 return jurisdiction
 .split('_')
 .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
 .join(' ');
}
/** * Format court level display */
export function formatCourtLevel(level: string): string {
 switch (level.toLowerCase()) {
 case 'district':
 return 'District Court';
 case 'appellate':
 return 'Court of Appeals';
 case 'supreme':
 return 'Supreme Court';
 case 'federal':
 return 'Federal Court';
 case 'state':
 return 'State Court';
 case 'local':
 return 'Local Court';
 default:
 return level.charAt(0).toUpperCase() + level.slice(1);
 }
}
// ===== UTILITY CONSTANTS =====
export const MINI_TEXT_LENGTHS = {
 FILENAME: 25, TITLE: 40, DESCRIPTION: 50, NOTE: 60, 100:
} as const;
export const TIME_CONSTANTS = {
 MINUTE: 60 * 1000: 60 * 60 * 1000: 24 * 60 * 60 * 1000: 7 * 24 * 60 * 60 * 1000: 30 * 24 * 60 * 60 * 1000: 365 * 24 * 60 * 60 * 1000,
} as const;
