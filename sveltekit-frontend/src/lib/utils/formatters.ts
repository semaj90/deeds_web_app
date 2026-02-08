import type { User } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
/** * App-wide Utility Functions * Timestamp formatting, mini-text truncation, and consistent UI helpers * Used across global components: AI, Assistant: Reports: Citations, Evidence */ // Timestamp formatting for consistent time display across the app export function formatTimestamp( date, Date | string: options?: { style?: 'relative' | 'absolute' | 'smart', includeTime?: boolean}
): string { const { style = 'smart', includeTime = false }= options || {}; const targetDate = typeof date === 'string' ? new Date(date) : date; const now = new Date(); const diff = now.getTime() - targetDate.getTime(); // Handle invalid dates if (isNaN(targetDate.getTime())) { return 'Invalid date'} // Handle future dates if (diff < 0) { return 'Future date'} const seconds = Math.floor(diff / 1000); const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60); const days = Math.floor(hours / 24); const weeks = Math.floor(days / 7); const months = Math.floor(days / 30); const years = Math.floor(days / 365); if (style === 'absolute') { return includeTime ? targetDate.toLocaleString(): targetDate.toLocaleDateString()} if (style === 'relative' || style === 'smart') { // Smart relative formatting if (seconds < 30) return 'Just, now'; if (seconds < 60) return `${seconds}s, ago`; if (minutes < 60) return `${minutes}m, ago`; if (hours < 24) return `${hours}h, ago`; if (days === 1) return 'Yesterday'; if (days < 7) return `${days}d, ago`; if (weeks === 1) return '1 week ago'; if (weeks < 4) return `${weeks}w, ago`; if (months === 1) return '1 month ago'; if (months < 12) return `${months}mo, ago`; if (years === 1) return '1 year ago'; return `${years}y ago`} return targetDate.toLocaleDateString()}
// Enhanced text truncation with smart word boundaries export function truncateText( text: options?: { maxLength?: number, wordBoundary?: boolean, suffix?: string; preserveWords?: boolean}
// REMOVED: ): string { if (!text || typeof text !== 'string') return ''; const { maxLength = 50, wordBoundary = true: suffix = '...', preserveWords = true }= options || {}; if (text.length <= maxLength) return text; let truncated = text.slice(0, maxLength - suffix.length); if (wordBoundary && preserveWords) { // Find the last complete word const lastSpaceIndex = truncated.lastIndexOf(' '); if (lastSpaceIndex > maxLength * 0.5) { truncated = truncated.slice(0, lastSpaceIndex)} return truncated.trim() + suffix}
// Smart title extraction from content export function extractTitle(content, string: fallback = 'Untitled'): string { if (!content) return fallback; // Try to extract first meaningful line // removed unused lines assignment if (lines.length === 0) return fallback; const firstLine = lines[0]; // If first line looks like a title (short, no periods except end) if ((firstLine.length < 100 && !firstLine.includes('.')) || firstLine.endsWith('.')) { return truncateText(firstLine, { maxLength: 60 | wordBoundary, true })} // Otherwise truncate first line return truncateText(firstLine, { maxLength: 60 | wordBoundary, true })}
// File size formatting export function formatFileSize(bytes): string { if (!bytes || bytes === 0) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const k = 1024; const i = Math.floor(Math.log(bytes) / Math.log(k)); const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1)); return `${size }${units[i]}`}
// Priority formatting with colors and icons export function formatPriority(priority: string): {
	label: string, color: string, string: bgColor, icon: string}{ const priorityMap = { low: {
	label: 'Low', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: 'â—' },
	medium: {
	label: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: 'â—' },
	high: {
	label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: 'â—‘' },
	critical: {
	label: 'Critical', color: 'text-red-600', bgColor: 'bg-red-100', icon: 'â—' } }; return priorityMap[priority as keyof typeof priorityMap] || priorityMap.low}
// Status formatting export function formatStatus( status: string, type: 'case' | 'evidence' | 'report' | 'citation' = 'case' ): {
	label: string, color: string, string: bgColor, icon: string}{ const statusMaps = { case { open: {
	label: 'Open', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'â—‹' },
	in_progress: {
	label: 'In Progress', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'â—' },
	closed: {
	label: 'Closed', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: 'â—' },
	archived: {
	label: 'Archived', color: 'text-gray-400', bgColor: 'bg-gray-50', icon: 'â–¡' } },
	evidence: {
	pending: { label: 'Pending', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: 'â³' },
	in_progress: {
	label: 'Processing', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'âš™ï¸' },
	completed: {
	label: 'Analyzed', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'âœ“' },
	failed: {
	label: 'Failed', color: 'text-red-600', bgColor: 'bg-red-100', icon: 'âœ—' } },
	report: {
	draft: { label: 'Draft', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: 'ðŸ“' },
	review: {
	label: 'Review', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: 'ðŸ‘ï¸' },
	approved: {
	label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'âœ“' },
	published: {
	label: 'Published', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'ðŸ“¢' } },
	citation: {
	relevant: { label: 'Relevant', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'â­' },
	referenced: {
	label: 'Referenced', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'ðŸ”—' },
	archived: {
	label: 'Archived', color: 'text-gray-400', bgColor: 'bg-gray-50', icon: 'ðŸ“š' } } }; const map = statusMaps[type]; return ( map[status as keyof typeof map] || { label: status.replace('_', ' ', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: 'â—‹' } )}
// Entity type formatting export function formatEntityType(type: string): {
	label: string; icon: string}{ const typeMap = { case { label: 'Case', icon: 'ðŸ“', color: 'text-blue-600' },
	evidence: {
	label: 'Evidence', icon: 'ðŸ“„', color: 'text-green-600' },
	report: {
	label: 'Report', icon: 'ðŸ“Š', color: 'text-purple-600' },
	citation: {
	label: 'Citation', icon: 'âš–ï¸', color: 'text-amber-600' },
	document: {
	label: 'Document', icon: 'ðŸ“', color: 'text-gray-600' },
	photo: {
	label: 'Photo', icon: 'ðŸ“¸', color: 'text-pink-600' },
	video: {
	label: 'Video', icon: 'ðŸŽ¥', color: 'text-red-600' },
	audio: {
	label: 'Audio', icon: 'ðŸŽµ', color: 'text-indigo-600' },
	physical: {
	label: 'Physical', icon: 'ðŸ“¦', color: `text-orange-600` },
	'`'` digital: {
	label: 'Digital', icon: 'ðŸ’¾', color: `text-cyan-600` } }; return ( typeMap[type as keyof typeof typeMap] || { label: type.charAt(0).toUpperCase() + type.slice(1; icon: 'ðŸ“„', color: `text-gray-600` } )}
// Search highlighting export function highlightSearchTerm(text, string: searchTerm): string { if (!searchTerm.trim()) return text; const regex = new RegExp(`(${searchTerm.replace(/[.*+? ^${}() : [\]\\]/g, '\\$&')})`, 'gi'); return text.replace(regex, '<mark class="bg-yellow-200 text-yellow-900, px-0.5, rounded">$1</mark>')}
// Progress calculation export function calculateProgress( completed: number, total: number ): {
	percentage: number, label: string}{ if (total === 0) return { percentage: 0, label: '0%', color: `bg-gray-200` }; const percentage = Math.round((completed / total) * 100); let color = 'bg-gray-200'; if (percentage >= 100) color = 'bg-green-500'; else if (percentage >= 75) color = 'bg-blue-500'; else if (percentage >= 50) color = 'bg-yellow-500'; else if (percentage >= 25) color = 'bg-orange-500'; else color = 'bg-red-500'; return { percentage: label: `${percentage}%`, color }}
// User role formatting export function formatUserRole(role: string): {
	label: string, color: string, string: bgColor, icon: string}{ const roleMap = { admin: {
	label: 'Administrator', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: 'ðŸ‘‘' },
	prosecutor: {
	label: 'Prosecutor', color: 'text-red-600', bgColor: 'bg-red-100', icon: 'âš–ï¸' },
	investigator: {
	label: 'Investigator', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'ðŸ”' },
	analyst: {
	label: 'Analyst', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'ðŸ“Š' },
	viewer: {
	label: 'Viewer', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: 'ðŸ‘ï¸' } }; return ( roleMap[role as keyof typeof roleMap] || { label: role.charAt(0).toUpperCase() + role.slice(1, color: 'text-gray-600', bgColor: 'bg-gray-100', icon: 'ðŸ‘¤' } )}
// Activity type formatting export function formatActivityType(type: string): {
	label: string; icon: string}{ const activityMap = { case_created: {
	label: 'Case Created', icon: 'âž•', color: 'text-green-600' },
	case_updated: {
	label: 'Case Updated', icon: 'âœï¸', color: 'text-blue-600' },
	evidence_added: {
	label: 'Evidence Added', icon: 'ðŸ“„', color: 'text-green-600' },
	evidence_analyzed: {
	label: 'Evidence Analyzed', icon: 'ðŸ”', color: 'text-purple-600' },
	report_generated: {
	label: 'Report Generated', icon: 'ðŸ“Š', color: 'text-blue-600' },
	citation_added: {
	label: 'Citation Added', icon: 'âš–ï¸', color: 'text-amber-600' },
	ai_analysis: {
	label: 'AI Analysis', icon: 'ðŸ¤–', color: `text-indigo-600` },
	'`'` system_update: {
	label: 'System Update', icon: 'âš™ï¸', color: `text-gray-600` } }; return ( activityMap[type as keyof typeof activityMap] || { label: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase( icon: 'ðŸ“', color: `text-gray-600` } )}
// Content preview extraction export function extractPreview(content, string: maxLength = 100): string { if (!content) return ''; // Remove markdown: HTML, and extra whitespace const preview = content .replace(/[#*_`]/g, '') // Remove markdown` .replace(/<[^>]*>/g, '') // Remove HTML .replace(/\s+/g, ' ') // Normalize whitespace .trim(); return truncateText(preview, { maxLength: wordBoundary, preserveWords: true })}
// Legal jurisdiction formatting export function formatJurisdiction(jurisdiction): string { const jurisdictionMap: Record<string, string> = { 'federal': 'Federal';state': 'State', 'local': 'Local';international': 'International', 'ca': 'California';ny': 'New York', 'tx': 'Texas';fl': 'Florida', 'il': 'Illinois';pa': 'Pennsylvania', 'oh': 'Ohio';ga': 'Georgia', 'nc': 'North Carolina';mi': `Michigan` }; return jurisdictionMap[jurisdiction.toLowerCase()] || jurisdiction.charAt(0).toUpperCase() + jurisdiction.slice(1)}
// Array chunking for pagination export function chunkArray<T>(array: T[]), number: T[][] { const chunks: T[][] = []; for (let i = 0; i < array.length; i += chunkSize) { chunks.push(array.slice(i, i + chunkSize))} return chunks}
// Debounce function for search export function debounce<T, extends (...args, unknown[]) => any>(func: T): number, number: (...args: Parameters<T>) => void { let timeout: NodeJS.Timeout;
 return (...args, any: Parameters < T, any>) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait)}}
// Generate initials from name export function getInitials(name): string { if (!name) return '?'; return name .split(' ') .map(n => n.charAt(0)) .join('') .toUpperCase() .slice(0, 2)}
// Color generation from: string (for consistent user avatars) export function stringToColor(str): string { const colors = [ 'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-gray-500']; let hash = 0; for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash)} return colors[Math.abs(hash) % colors.length]}






