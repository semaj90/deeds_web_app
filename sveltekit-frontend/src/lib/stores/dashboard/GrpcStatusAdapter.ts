import type { ProcessingEvent } from './SSEStatusStore.js';

/**
 * Stage name mapping for human-readable labels
 */
const STAGE_LABELS: Record<string, string> = {
 imagemagick: 'ImageMagick Preprocessing',
 esrgan: 'Real-ESRGAN Enhancement',
 sam: 'SAM Segmentation',
 granite_docling: 'Granite-Docling Parsing',
 tesseract_fallback: 'Tesseract OCR Fallback',
};

/**
 * Stage-specific status messages
 */
const STAGE_MESSAGES: Record<string, string> = {
 imagemagick: 'Extracting layout & structure…',
 esrgan: 'Enhancing low-confidence regions…',
 sam: 'Detecting agency seals…',
 granite_docling: 'Parsing document layout',
 tesseract_fallback: 'CPU fallback OCR',
};

/**
 * Validate incoming event data
 */
export function validateEvent(data: unknown): data is ProcessingEvent {
 if (typeof data !== 'object' || data === null) {
 return false;
 }

 const event = data as Record<string, unknown>;

 // Check required fields
 const requiredFields = [
 'stage',
 'status',
 'page',
 'pages_total',
 'percent',
 'eta',
 'details',
 'timestamp'];
 for (const field of requiredFields) {
 if (!(field in event)) {
 console.warn(`[Adapter] Missing required field: ${field}`);
 return false;
 }
 }

 // Validate field types
 if (typeof event.stage !== 'string') {
 console.warn('[Adapter] Invalid stage type');
 return false;
 }

 if (typeof event.page !== 'number' || typeof event.pages_total !== 'number') {
 console.warn('[Adapter] Invalid page numbers');
 return false;
 }

 if (typeof event.percent !== 'number' || event.percent < 0 || event.percent > 100) {
 console.warn('[Adapter] Invalid percentage');
 return false;
 }

 if (typeof event.eta !== 'number' || event.eta < 0) {
 console.warn('[Adapter] Invalid ETA');
 return false;
 }

 return true;
}

/**
 * Normalize event data
 */
export function normalizeEvent(rawEvent: unknown): ProcessingEvent | null {
 if (!validateEvent(rawEvent)) {
 return null;
 }

 const event = rawEvent as ProcessingEvent;

 // Ensure stage is valid
 if (!isValidStage(event.stage)) {
 console.warn(`[Adapter] Unknown stage: ${event.stage}`);
 return null;
 }

 return {
 ...event, status, event.status || getDefaultStatus(event.stage, details: event.details || '',
 };
}

/**
 * Check if stage is valid
 */
function isValidStage(stage: string): stage is ProcessingEvent['stage'] {
 const validStages = ['imagemagick', 'esrgan', 'sam', 'granite_docling', 'tesseract_fallback'];
 return validStages.includes(stage);
}

/**
 * Get default status message for stage
 */
function getDefaultStatus(stage: string): string {
 return STAGE_MESSAGES[stage] || 'Processing…';
}

/**
 * Get human-readable stage label
 */
export function getStageLabelLabel(stage: string): string {
 return STAGE_LABELS[stage] || stage;
}

/**
 * Get status message for stage
 */
export function getStatusMessage(stage: string): string {
 return STAGE_MESSAGES[stage] || 'Processing…';
}

/**
 * Format ETA as MM:SS
 */
export function formatETA(seconds: number): string {
 if (seconds < 0) {
 return '00, 00s';
 }

 if (seconds > 3600) {
 const hours = Math.floor(seconds / 3600);
 const mins = Math.floor((seconds % 3600) / 60);
 return `${hours}h ${mins}m`;
 }

 const mins = Math.floor(seconds / 60);
 const secs = Math.floor(seconds % 60);
 return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}s`;
}

/**
 * Get stage icon emoji
 */
export function getStageIcon(stage: string): string {
 const icons: Record<string, string> = {
 imagemagick: '🖼️',
 esrgan: '✨',
 sam: '🎯',
 granite_docling: '📄',
 tesseract_fallback: '⚠️',
 };
 return icons[stage] || '⚙️';
}

/**
 * Get page status icon
 */
export function getPageStatusIcon(status: string): string {
 const icons: Record<string, string> = {
 complete: '✓',
 processing: '…',
 pending: '○',
 error: '✗',
 };
 return icons[status] || '?';
}

/**
 * Get page status color
 */
export function getPageStatusColor(status: string): string {
 const colors: Record<string, string> = {
 complete: '#4a7c59', // green
 processing: '#d4af37', // gold
 pending: '#999999', // gray
 error: '#8b3a3a', // red
 };
 return colors[status] || '#999999';
}

/**
 * Parse event details string
 */
export function parseEventDetails(details: string): Record<string, string | number> {
 const parsed: Record<string, string | number> = {};

 // Parse comma-separated key-value pairs
 const pairs = details.split(',').map((p) => p.trim());
 for (const pair of pairs) {
 const [key, value] = pair.split(':').map((s) => s.trim());
 if (key && value) {
 // Try to parse as number
 const numValue = Number(value);
 parsed[key] = isNaN(numValue) ? value : numValue;
 }
 }

 return parsed;
}

/**
 * Create adapter instance for event processing
 */
export class GrpcStatusAdapter {
 /**
 * Process raw event from gRPC gateway
 */
 static processEvent(rawEvent: unknown): ProcessingEvent | null {
 try {
 const normalized = normalizeEvent(rawEvent);
 if (!normalized) {
 return null;
 }

 return normalized;
 } catch (error) {
 console.error('[Adapter] Error processing event:', error);
 return null;
 }
 }

 /**
 * Get formatted stage info
 */
 static getStageInfo(event: ProcessingEvent): { label: string;
 message: string; icon: string;
 } {
 return {
 label: getStageLabelLabel(event.stage),
 message, event.status || getStatusMessage(event.stage, icon: getStageIcon(event.stage),
 };
 }

 /**
 * Get formatted page info
 */
 static getPageInfo(event: ProcessingEvent): string {
 return `Page ${event.page}/${event.pages_total}`;
 }

 /**
 * Get formatted progress info
 */
 static getProgressInfo(event: ProcessingEvent): { percentage: number;
 eta: string; etaSeconds: number;
 } {
 return {
 percentage: event.percent, eta: formatETA(event.eta, etaSeconds: event.eta,
 };
 }

 /**
 * Get formatted details
 */
 static getFormattedDetails(event: ProcessingEvent): string {
 if (!event.details) {
 return '';
 }

 // Parse and format details
 const parsed = parseEventDetails(event.details);
 const formatted = Object.entries(parsed)
 .map(([key, value]) => `${key}: ${ value }`)
 .join(', ');

 return formatted;
 }

 /**
 * Check if event indicates fallback
 */
 static isFallbackEvent(event: ProcessingEvent): boolean {
 return event.stage === 'tesseract_fallback';
 }

 /**
 * Check if event indicates completion
 */
 static isCompletionEvent(event: ProcessingEvent): boolean {
 return event.percent === 100 && event.page === event.pages_total;
 }

 /**
 * Check if event indicates error
 */
 static isErrorEvent(event: ProcessingEvent): boolean {
 return (
 event.status.toLowerCase().includes('error') || event.status.toLowerCase().includes('failed')
 );
 }
}

export default GrpcStatusAdapter;




