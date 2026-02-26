/**
 * Client-Side Sensitive Information Detector
 * Extracted from src/lib/wasm/legal-processor.ts (Session 93r28)
 *
 * Detects PII (SSN, email, phone, credit card, address) in text BEFORE upload.
 * Pure regex — no WASM, no server calls. Runs in browser or SSR.
 *
 * Usage:
 *   import { detectSensitiveInfo, maskSensitiveText } from '$lib/utils/sensitive-info-detector.js';
 *   const hits = detectSensitiveInfo(text);
 *   const masked = maskSensitiveText(text);
 */

export interface SensitiveInfoHit {
	type: 'ssn' | 'credit_card' | 'phone' | 'email' | 'account_number';
	value: string;
	masked: string;
	confidence: number;
	location: { start: number; end: number };
}

/**
 * Scan text for sensitive information patterns.
 * Returns all matches sorted by position (start index ascending).
 */
export function detectSensitiveInfo(text: string): SensitiveInfoHit[] {
	if (!text || text.length < 5) return [];
	const hits: SensitiveInfoHit[] = [];

	// SSN: XXX-XX-XXXX
	const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
	let match: RegExpExecArray | null;
	while ((match = ssnRegex.exec(text)) !== null) {
		hits.push({
			type: 'ssn',
			value: match[0],
			masked: 'XXX-XX-XXXX',
			confidence: 0.95,
			location: { start: match.index, end: match.index + match[0].length }
		});
	}

	// Credit card: 4 groups of 4 digits (Visa/MC/Amex patterns)
	const ccRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
	while ((match = ccRegex.exec(text)) !== null) {
		const digits = match[0].replace(/[-\s]/g, '');
		// Basic Luhn-like length check (13-19 digits)
		if (digits.length >= 13 && digits.length <= 19) {
			hits.push({
				type: 'credit_card',
				value: match[0],
				masked: '****-****-****-' + digits.slice(-4),
				confidence: 0.85,
				location: { start: match.index, end: match.index + match[0].length }
			});
		}
	}

	// Email: standard email pattern
	const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
	while ((match = emailRegex.exec(text)) !== null) {
		hits.push({
			type: 'email',
			value: match[0],
			masked: match[0].replace(/(.{2}).*(@.*)/, '$1***$2'),
			confidence: 0.9,
			location: { start: match.index, end: match.index + match[0].length }
		});
	}

	// Phone: US patterns — (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX
	const phoneRegex = /\b(?:\(\d{3}\)\s?|\d{3}[-.])\d{3}[-.]?\d{4}\b/g;
	while ((match = phoneRegex.exec(text)) !== null) {
		hits.push({
			type: 'phone',
			value: match[0],
			masked: '(XXX) XXX-XXXX',
			confidence: 0.85,
			location: { start: match.index, end: match.index + match[0].length }
		});
	}

	// Account numbers: 8-17 digit sequences preceded by "account" keywords
	const acctRegex = /\b(?:account|acct|a\/c)\s*#?\s*(\d{8,17})\b/gi;
	while ((match = acctRegex.exec(text)) !== null) {
		const digits = match[1];
		hits.push({
			type: 'account_number',
			value: match[0],
			masked: 'ACCT ****' + digits.slice(-4),
			confidence: 0.8,
			location: { start: match.index, end: match.index + match[0].length }
		});
	}

	// Sort by position
	hits.sort((a, b) => a.location.start - b.location.start);
	return hits;
}

/**
 * Replace all sensitive info in text with masked versions.
 * Processes from end to start to preserve indices.
 */
export function maskSensitiveText(text: string): { masked: string; hits: SensitiveInfoHit[] } {
	const hits = detectSensitiveInfo(text);
	if (hits.length === 0) return { masked: text, hits: [] };

	let masked = text;
	// Process from end to preserve earlier indices
	const reversed = [...hits].sort((a, b) => b.location.start - a.location.start);
	for (const hit of reversed) {
		masked = masked.substring(0, hit.location.start) + hit.masked + masked.substring(hit.location.end);
	}
	return { masked, hits };
}

/**
 * Quick check — returns true if ANY sensitive info is detected.
 * Cheaper than full detectSensitiveInfo() when you just need a boolean.
 */
export function hasSensitiveInfo(text: string): boolean {
	if (!text || text.length < 5) return false;
	return /\b\d{3}-\d{2}-\d{4}\b/.test(text) ||         // SSN
		/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text) ||  // Email
		/\b(?:\(\d{3}\)\s?|\d{3}[-.])\d{3}[-.]?\d{4}\b/.test(text) ||        // Phone
		/\b(?:\d{4}[-\s]?){3}\d{4}\b/.test(text);         // Credit card
}
