/**
 * Forensic pattern detection for legal documents.
 * Flags: PII (SSN, credit cards, banking), legal keywords, contact density,
 * date clusters, large dollar amounts.
 */

export interface ForensicFlag {
	type: string;
	description: string;
	severity: 'low' | 'medium' | 'high';
	metadata?: Record<string, unknown>;
}

/** Structured legal keyword definitions with per-keyword severity */
const LEGAL_KEYWORDS: Array<{ re: RegExp; type: string; severity: 'low' | 'medium' | 'high'; desc: string }> = [
	{ re: /\bnon[-\s]?compete\b/i, type: 'non_compete', severity: 'medium', desc: 'Non-compete clause mentioned' },
	{ re: /\barbitration\b/i, type: 'arbitration', severity: 'medium', desc: 'Arbitration mentioned' },
	{ re: /\bindemnif(?:y|ication)\b/i, type: 'indemnification', severity: 'medium', desc: 'Indemnification mentioned' },
	{ re: /\battorney[- ]client\b/i, type: 'attorney_client', severity: 'medium', desc: 'Attorney-client privilege mentioned' },
	{ re: /\bwork product\b/i, type: 'work_product', severity: 'medium', desc: 'Work product doctrine mentioned' },
	{ re: /\bsettlement\b/i, type: 'settlement', severity: 'medium', desc: 'Settlement mentioned' },
	{ re: /\bdeposition\b/i, type: 'deposition', severity: 'low', desc: 'Deposition mentioned' },
	{ re: /\btestimony\b/i, type: 'testimony', severity: 'low', desc: 'Testimony mentioned' },
	{ re: /\bplaintiff\b/i, type: 'plaintiff', severity: 'low', desc: 'Plaintiff mentioned' },
	{ re: /\bdefendant\b/i, type: 'defendant', severity: 'low', desc: 'Defendant mentioned' },
	{ re: /\bindictment\b/i, type: 'indictment', severity: 'medium', desc: 'Indictment mentioned' },
	{ re: /\bsubpoena\b/i, type: 'subpoena', severity: 'medium', desc: 'Subpoena mentioned' },
	{ re: /\bwarrant\b/i, type: 'warrant', severity: 'medium', desc: 'Warrant mentioned' },
	{ re: /\bprobable cause\b/i, type: 'probable_cause', severity: 'medium', desc: 'Probable cause mentioned' },
	{ re: /\bconfidential(?:ity)?\b/i, type: 'confidential', severity: 'low', desc: 'Confidentiality mentioned' },
	{ re: /\bprivileged\b/i, type: 'privileged', severity: 'low', desc: 'Privileged communication mentioned' },
	{ re: /\btermination\b/i, type: 'termination', severity: 'low', desc: 'Termination mentioned' },
];

export function detectForensicPatterns(text: string): ForensicFlag[] {
	if (!text || text.trim().length === 0) return [];

	const flags: ForensicFlag[] = [];

	// --- PII: SSN ---
	const ssnMatches = Array.from(text.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)).slice(0, 20).map((m) => m[0]);
	if (ssnMatches.length > 0 || /\b(?:ssn|social security number)\b/i.test(text)) {
		flags.push({
			type: 'PII_SSN',
			description: 'Document may contain Social Security Numbers',
			severity: 'high',
			metadata: { matches: ssnMatches },
		});
	}

	// --- PII: Credit card (13-19 digits) ---
	const ccMatches = Array.from(text.matchAll(/\b(?:\d[ -]*?){13,19}\b/g))
		.slice(0, 20)
		.map((m) => m[0])
		.filter(likelyCard);
	if (ccMatches.length > 0) {
		flags.push({
			type: 'PII_CREDIT_CARD',
			description: 'Document may contain credit card numbers',
			severity: 'high',
			metadata: { matches: ccMatches },
		});
	}

	// --- PII: Banking ---
	if (/\b(?:routing|account)\s*(?:number|no\.?)\b/i.test(text)) {
		flags.push({
			type: 'PII_BANKING',
			description: 'Possible banking details mentioned',
			severity: 'medium',
		});
	}

	// --- Contact density: emails ---
	const emailMatches = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g);
	if (emailMatches && emailMatches.length > 5) {
		flags.push({
			type: 'many_emails',
			description: `Document contains ${emailMatches.length} email addresses`,
			severity: 'medium',
			metadata: { count: emailMatches.length },
		});
	}

	// --- Contact density: phones ---
	const phoneMatches = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
	if (phoneMatches && phoneMatches.length > 3) {
		flags.push({
			type: 'many_phones',
			description: `Document contains ${phoneMatches.length} phone numbers`,
			severity: 'medium',
			metadata: { count: phoneMatches.length },
		});
	}

	// --- Date cluster ---
	const dateMatches = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g);
	if (dateMatches && dateMatches.length > 5) {
		flags.push({
			type: 'date_cluster',
			description: `Document contains ${dateMatches.length} dates`,
			severity: 'low',
			metadata: { count: dateMatches.length },
		});
	}

	// --- Legal keywords (structured, per-keyword severity) ---
	const foundKeywords: Array<{ type: string; desc: string; severity: 'low' | 'medium' | 'high' }> = [];
	for (const kw of LEGAL_KEYWORDS) {
		if (kw.re.test(text)) {
			foundKeywords.push({ type: kw.type, desc: kw.desc, severity: kw.severity });
		}
	}
	if (foundKeywords.length > 0) {
		// Highest severity among found keywords
		const maxSeverity = foundKeywords.some((k) => k.severity === 'high')
			? 'high'
			: foundKeywords.some((k) => k.severity === 'medium')
				? 'medium'
				: 'low';
		flags.push({
			type: 'legal_keywords',
			description: `Contains ${foundKeywords.length} legal term(s): ${foundKeywords.map((k) => k.type).join(', ')}`,
			severity: maxSeverity,
			metadata: { keywords: foundKeywords },
		});
	}

	// --- Large dollar amounts (>= $10,000) ---
	const amounts = text.match(/\$[\d,]+(?:\.\d{2})?/g);
	if (amounts) {
		const large = amounts.filter((a) => {
			const num = parseFloat(a.replace(/[$,]/g, ''));
			return num >= 10_000;
		});
		if (large.length > 0) {
			flags.push({
				type: 'large_amounts',
				description: `Document references ${large.length} amount(s) >= $10,000`,
				severity: 'medium',
				metadata: { amounts: large },
			});
		}
	}

	// --- Driver's license / state ID pattern ---
	if (/\b(?:driver'?s?\s*license|DL|state\s*ID)\s*(?:no\.?|number|#)?\s*:?\s*[A-Z]?\d{5,12}\b/i.test(text)) {
		flags.push({
			type: 'PII_DRIVERS_LICENSE',
			description: 'Possible driver\'s license or state ID number detected',
			severity: 'high',
		});
	}

	// --- Passport number pattern ---
	if (/\bpassport\s*(?:no\.?|number|#)?\s*:?\s*[A-Z]?\d{6,9}\b/i.test(text)) {
		flags.push({
			type: 'PII_PASSPORT',
			description: 'Possible passport number detected',
			severity: 'high',
		});
	}

	// --- Seal / under seal / sealed ---
	if (/\bunder\s+seal\b|\bsealed\b|\bFILED\s+UNDER\s+SEAL\b/i.test(text)) {
		flags.push({
			type: 'sealed_document',
			description: 'Document may be under seal',
			severity: 'high',
		});
	}

	// --- Expungement / record sealing ---
	if (/\bexpung(?:e|ed|ement)\b/i.test(text)) {
		flags.push({
			type: 'expungement',
			description: 'Expungement reference detected',
			severity: 'medium',
		});
	}

	return flags;
}

/** Basic credit card plausibility check (digit count) */
function likelyCard(s: string): boolean {
	const digits = s.replace(/\D/g, '');
	return digits.length >= 13 && digits.length <= 19;
}
