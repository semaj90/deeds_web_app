/**
 * Evidence Type Detector — Centralized MIME→evidenceType mapping + post-analysis legal reclassification.
 *
 * Two stages:
 *   1. detectEvidenceType(mimeType, fileName) — initial classification from file metadata
 *   2. inferLegalClassification(...) — refines type after entity extraction + forensics
 *
 * Unified 16-value evidence_type enum:
 *   Media: document, photo, video, audio
 *   Legal: documentary, testimonial, demonstrative, witness_statement
 *   Forensic: forensic, scientific, expert
 *   Physical: physical, real, digital
 *   Context: circumstantial, hearsay
 */

import { extname } from 'path';

/** All valid evidence_type enum values */
export const EVIDENCE_TYPES = [
	'document', 'photo', 'video', 'audio',
	'physical', 'digital', 'witness_statement', 'forensic',
	'documentary', 'testimonial', 'demonstrative', 'real',
	'circumstantial', 'hearsay', 'expert', 'scientific'
] as const;

export type EvidenceType = typeof EVIDENCE_TYPES[number];

/** Evidence type groups for UI dropdowns */
export const EVIDENCE_TYPE_GROUPS = {
	'Media': ['photo', 'video', 'audio'],
	'Documents': ['document', 'documentary'],
	'Legal': ['testimonial', 'demonstrative', 'witness_statement'],
	'Forensic': ['forensic', 'scientific', 'expert'],
	'Physical': ['physical', 'real', 'digital'],
	'Context': ['circumstantial', 'hearsay'],
} as const;

/** Human-readable labels for each evidence type */
export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
	document: 'Document',
	photo: 'Photograph',
	video: 'Video Recording',
	audio: 'Audio Recording',
	physical: 'Physical Evidence',
	digital: 'Digital Evidence',
	witness_statement: 'Witness Statement',
	forensic: 'Forensic Evidence',
	documentary: 'Documentary Evidence',
	testimonial: 'Testimonial Evidence',
	demonstrative: 'Demonstrative Evidence',
	real: 'Real Evidence',
	circumstantial: 'Circumstantial Evidence',
	hearsay: 'Hearsay',
	expert: 'Expert Opinion',
	scientific: 'Scientific Evidence',
};

// Extension sets for detection
const DOC_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.odt', '.rtf']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.log', '.html', '.htm']);
const DATA_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.json', '.xml', '.tsv']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.wmv', '.mkv', '.webm', '.flv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma']);

/**
 * Stage 1: Detect evidence type from MIME type and filename.
 * Returns the best-match evidence_type enum value.
 */
export function detectEvidenceType(mimeType: string, fileName: string): EvidenceType {
	const mime = (mimeType || '').toLowerCase();
	const ext = extname(fileName || '').toLowerCase();

	// MIME-based detection (primary)
	if (mime.startsWith('image/')) return 'photo';
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime === 'application/pdf') return 'documentary';
	if (mime.includes('word') || mime.includes('opendocument.text')) return 'documentary';
	if (mime.includes('spreadsheet') || mime === 'text/csv') return 'digital';
	if (mime.startsWith('text/')) return 'documentary';

	// Extension-based fallback
	if (IMAGE_EXTENSIONS.has(ext)) return 'photo';
	if (VIDEO_EXTENSIONS.has(ext)) return 'video';
	if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
	if (DOC_EXTENSIONS.has(ext)) return 'documentary';
	if (TEXT_EXTENSIONS.has(ext)) return 'documentary';
	if (DATA_EXTENSIONS.has(ext)) return 'digital';

	return 'document';
}

// Keyword patterns for legal reclassification
const TESTIMONIAL_KEYWORDS = /\b(sworn\s+statement|deposition|affidavit|under\s+oath|testimony|witness\s+statement|miranda|interrogat)/i;
const SCIENTIFIC_KEYWORDS = /\b(dna\s+analysis|fingerprint|ballistic|toxicolog|blood\s+alcohol|lab\s+report|forensic\s+analysis|chain\s+of\s+custody|patholog|autospy|serology)/i;
const EXPERT_KEYWORDS = /\b(expert\s+opinion|professional\s+opinion|medical\s+report|psychiatric|psychological\s+evaluation|appraisal|valuation\s+report|actuarial)/i;
const DEMONSTRATIVE_KEYWORDS = /\b(diagram|chart|timeline|map|scale\s+model|reconstruction|simulation|animation|exhibit)/i;

interface ForensicFlag {
	type: string;
	severity: string;
	description?: string;
}

interface ExtractedEntity {
	text: string;
	label: string;
}

/**
 * Stage 2: Refine evidence type after analysis.
 * Uses extracted text, entities, and forensic flags to reclassify
 * when content clearly indicates a more specific legal category.
 */
export function inferLegalClassification(
	currentType: string,
	extractedText: string,
	entities: ExtractedEntity[],
	forensicFlags: ForensicFlag[]
): EvidenceType {
	const text = (extractedText || '').slice(0, 10_000);

	// Check for testimonial evidence (sworn statements, depositions)
	if (TESTIMONIAL_KEYWORDS.test(text)) {
		const hasPersonEntities = entities.some(e => e.label === 'PERSON');
		if (hasPersonEntities) return 'testimonial';
		return 'witness_statement';
	}

	// Check for scientific/forensic evidence (lab reports, DNA)
	if (SCIENTIFIC_KEYWORDS.test(text)) {
		return 'scientific';
	}

	// Check for expert opinion
	if (EXPERT_KEYWORDS.test(text)) {
		return 'expert';
	}

	// Check for demonstrative evidence (diagrams, charts)
	if (DEMONSTRATIVE_KEYWORDS.test(text)) {
		return 'demonstrative';
	}

	// High-severity forensic flags suggest forensic evidence
	const highFlags = forensicFlags.filter(f => f.severity === 'high');
	if (highFlags.length >= 2 && (currentType === 'document' || currentType === 'documentary')) {
		return 'forensic';
	}

	// Validate current type is in enum, otherwise default
	if (EVIDENCE_TYPES.includes(currentType as EvidenceType)) {
		return currentType as EvidenceType;
	}

	return 'document';
}

/**
 * Check if a string is a valid evidence type enum value.
 */
export function isValidEvidenceType(type: string): type is EvidenceType {
	return EVIDENCE_TYPES.includes(type as EvidenceType);
}
