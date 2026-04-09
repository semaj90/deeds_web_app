/**
 * HTML Normalizer for State Constitution Pages
 *
 * Strips page chrome (nav, headers, footers, sidebars) from state legislature
 * HTML pages and extracts clean legal text with article/section hierarchy.
 *
 * Uses JSDOM for robust parsing (already in project dependencies).
 * Preserves: heading labels, citation markers, section numbers, paragraphs.
 * Removes: navigation, breadcrumbs, headers, footers, scripts, styles, ads.
 */

import { JSDOM } from 'jsdom';

export interface NormalizedSection {
	heading: string;
	citationLabel: string | null;
	nodeType: 'preamble' | 'article' | 'amendment' | 'section' | 'clause' | 'paragraph';
	depth: number;
	text: string;
	sectionPath: string[];
}

export interface NormalizeResult {
	title: string;
	fullText: string;
	textClean: string;
	sections: NormalizedSection[];
	wordCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS selectors for chrome to strip (common across state legislature sites)
// ─────────────────────────────────────────────────────────────────────────────
const CHROME_SELECTORS = [
	'nav', 'header', 'footer', 'aside',
	'[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
	'#navigation', '#nav', '#header', '#footer', '#sidebar',
	'.navigation', '.nav', '.header', '.footer', '.sidebar',
	'.breadcrumb', '.breadcrumbs', '.menu', '.toolbar',
	'.search-box', '.search-form',
	'#topnav', '#leftnav', '#rightnav', '#sidenav',
	'.cookie-notice', '.skip-link', '.print-link',
	'script', 'style', 'noscript',
];

// Heading patterns that signal legal hierarchy
const HEADING_PATTERNS = [
	{ pattern: /^preamble$/i,           nodeType: 'preamble' as const, depth: 1 },
	{ pattern: /^amendment\s+[ivxlcdm\d]+/i, nodeType: 'amendment' as const, depth: 1 },
	{ pattern: /^article\s+[ivxlcdm\d]+/i,  nodeType: 'article' as const,  depth: 1 },
	{ pattern: /^article\s+\w+/i,       nodeType: 'article' as const,  depth: 1 },
	{ pattern: /^§\s*\d+/i,            nodeType: 'section' as const, depth: 2 },
	{ pattern: /^sec(?:tion)?\.?\s+\d+/i, nodeType: 'section' as const, depth: 2 },
	{ pattern: /^section\s+\d+/i,       nodeType: 'section' as const, depth: 2 },
	{ pattern: /^\d+\.\s/,              nodeType: 'section' as const, depth: 2 },
	{ pattern: /^\([a-z]\)/i,           nodeType: 'clause'  as const, depth: 3 },
];

/** Normalize whitespace while preserving meaningful paragraph breaks. */
function normalizeWhitespace(text: string): string {
	return text
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.replace(/[ \t]+/g, ' ')              // collapse inline spaces
		.replace(/\n{3,}/g, '\n\n')           // max 2 consecutive newlines
		.replace(/^\s+|\s+$/gm, '')           // trim each line
		.trim();
}

/** Strip repeated page headers/footers (lines that repeat 3+ times). */
function stripRepeatedLines(text: string): string {
	const lines = text.split('\n');
	const freq = new Map<string, number>();
	for (const l of lines) {
		const k = l.trim().toLowerCase();
		if (k.length > 10) freq.set(k, (freq.get(k) ?? 0) + 1);
	}
	// Remove lines appearing 3+ times (page furniture)
	return lines
		.filter((l) => {
			const k = l.trim().toLowerCase();
			return !k || (freq.get(k) ?? 0) < 3;
		})
		.join('\n');
}

/** Infer legal node type and depth from heading text. */
function classifyHeading(text: string): { nodeType: NormalizedSection['nodeType']; depth: number } | null {
	const trimmed = text.trim();
	for (const { pattern, nodeType, depth } of HEADING_PATTERNS) {
		if (pattern.test(trimmed)) return { nodeType, depth };
	}
	return null;
}

/** Extract citation label from heading (e.g. "Article I", "Amendment XIV", "§ 3", "Section 4"). */
function extractCitationLabel(heading: string): string | null {
	const m =
		heading.match(/^(amendment\s+[ivxlcdm\d]+)/i) ??
		heading.match(/^(article\s+[ivxlcdm\d]+)/i) ??
		heading.match(/^(§\s*[\d\w.-]+)/i) ??
		heading.match(/^(sec(?:tion)?\.?\s+[\d\w.-]+)/i) ??
		heading.match(/^(\d+\.)/);
	return m ? m[1].trim() : null;
}

/**
 * Normalize an HTML page from a state legislature website.
 * Returns clean text + structured sections.
 */
export function normalizeConstitutionHtml(html: string, pageUrl = ''): NormalizeResult {
	const dom = new JSDOM(html, { url: pageUrl || 'https://example.com' });
	const doc = dom.window.document;

	// Strip chrome elements
	for (const selector of CHROME_SELECTORS) {
		doc.querySelectorAll(selector).forEach((el) => el.remove());
	}

	// Try to find the main content container (common patterns)
	const mainSelectors = [
		'main', '#main', '#content', '#main-content', '.main-content',
		'[role="main"]', '.content', '.page-content',
		'#statutes-content', '.statute-text', '.law-text', '.constitution-text',
		'article', '.article-body',
	];

	let contentEl: Element = doc.body;
	for (const sel of mainSelectors) {
		const found = doc.querySelector(sel);
		if (found && found.textContent && found.textContent.trim().length > 500) {
			contentEl = found;
			break;
		}
	}

	// Extract title
	const titleEl =
		doc.querySelector('h1') ??
		doc.querySelector('.page-title') ??
		doc.querySelector('title');
	const pageTitle = titleEl?.textContent?.trim() ?? '';

	// Walk the content and extract sections
	const sections: NormalizedSection[] = [];
	const sectionPath: string[] = [];
	let currentSection: NormalizedSection | null = null;
	const paragraphBuffer: string[] = [];

	function flushBuffer() {
		if (paragraphBuffer.length > 0 && currentSection) {
			currentSection.text += '\n\n' + paragraphBuffer.join('\n\n');
			paragraphBuffer.length = 0;
		}
	}

	function walkNode(node: Element) {
		const tag = node.tagName?.toLowerCase();
		const text = (node.textContent ?? '').trim();

		if (!text) return;

		// Heading elements
		if (/^h[1-6]$/.test(tag)) {
			flushBuffer();
			const classification = classifyHeading(text);
			if (classification) {
				// Update section path at the right depth
				sectionPath.splice(classification.depth);
				sectionPath[classification.depth - 1] = text;

				currentSection = {
					heading: text,
					citationLabel: extractCitationLabel(text),
					nodeType: classification.nodeType,
					depth: classification.depth,
					text: '',
					sectionPath: [...sectionPath],
				};
				sections.push(currentSection);
			}
			return;
		}

		// Block elements with legal heading patterns (div/span acting as headings)
		if ((tag === 'div' || tag === 'span' || tag === 'p') && node.children.length === 0) {
			const classification = classifyHeading(text);
			if (classification && text.length < 120) {
				flushBuffer();
				sectionPath.splice(classification.depth);
				sectionPath[classification.depth - 1] = text;

				currentSection = {
					heading: text,
					citationLabel: extractCitationLabel(text),
					nodeType: classification.nodeType,
					depth: classification.depth,
					text: '',
					sectionPath: [...sectionPath],
				};
				sections.push(currentSection);
				return;
			}
		}

		// Paragraph / text content
		if (tag === 'p' || tag === 'div') {
			if (node.children.length === 0 || tag === 'p') {
				const clean = text.replace(/\s+/g, ' ').trim();
				if (clean.length > 10) {
					if (currentSection) {
						paragraphBuffer.push(clean);
					} else {
						// Pre-article preamble text
						const preamble = sections.find((s) => s.nodeType === 'preamble');
						if (preamble) {
							preamble.text += '\n\n' + clean;
						}
					}
				}
			} else {
				// Recurse into container divs
				for (const child of Array.from(node.children)) {
					walkNode(child as Element);
				}
			}
			return;
		}

		// Recurse into other elements
		for (const child of Array.from(node.children)) {
			walkNode(child as Element);
		}
	}

	walkNode(contentEl);
	flushBuffer();

	// If no sections were detected (flat HTML), treat the whole body as one block
	if (sections.length === 0) {
		const rawText = contentEl.textContent ?? '';
		const clean = normalizeWhitespace(stripRepeatedLines(rawText));
		return {
			title: pageTitle,
			fullText: clean,
			textClean: clean,
			sections: [],
			wordCount: clean.split(/\s+/).filter(Boolean).length,
		};
	}

	// Normalize text in each section
	for (const s of sections) {
		s.text = normalizeWhitespace(s.text);
	}

	const fullText = sections.map((s) => `${s.heading}\n\n${s.text}`).join('\n\n');
	const textClean = normalizeWhitespace(stripRepeatedLines(fullText));

	return {
		title: pageTitle,
		fullText,
		textClean,
		sections,
		wordCount: textClean.split(/\s+/).filter(Boolean).length,
	};
}

/**
 * Minimal normalizer for plain text (already extracted from PDF or pre-normalized).
 * Just strips repeated lines, normalizes whitespace, and returns a flat result.
 */
export function normalizePlainText(text: string): NormalizeResult {
	const clean = normalizeWhitespace(stripRepeatedLines(text));
	return {
		title: '',
		fullText: clean,
		textClean: clean,
		sections: [],
		wordCount: clean.split(/\s+/).filter(Boolean).length,
	};
}
