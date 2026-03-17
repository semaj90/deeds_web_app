/**
 * Structure-Aware Legal Document Chunker
 *
 * Splits legal PDFs (statutes, constitutions, regulations) by structural headings
 * before applying token-window chunking within each section.
 *
 * Hierarchy detection:
 *   PART / TITLE / CHAPTER / ARTICLE / SECTION / § / numbered headings
 *
 * Output: LegalChunk[] with sectionPath, page info, citation candidates, heading text.
 * Designed for 400+ page documents like the California Constitution.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface LegalChunk {
	text: string;
	chunkIndex: number;
	/** Hierarchical section path, e.g. ["Article I", "Section 2", "Subdivision (a)"] */
	sectionPath: string[];
	/** Heading text of the immediate section */
	heading: string;
	/** Start page (1-based, if available from pdf-parse) */
	pageStart?: number;
	/** End page */
	pageEnd?: number;
	/** Character offsets in the full text */
	startOffset: number;
	endOffset: number;
	/** Approximate token count */
	tokenCount: number;
	/** Citation candidates found in this chunk */
	citations: string[];
	/** Extraction method for the parent document */
	extractionMethod?: string;
}

export interface LegalSection {
	level: number;
	heading: string;
	text: string;
	startOffset: number;
	endOffset: number;
	children: LegalSection[];
	/** Resolved section path from root */
	path: string[];
}

export interface LegalChunkerOptions {
	/** Max tokens per chunk (default: 512) */
	maxTokens?: number;
	/** Token overlap between adjacent chunks (default: 128) */
	overlap?: number;
	/** Min section text length to create a chunk (default: 30 chars) */
	minSectionLength?: number;
}

// ── Heading patterns (ranked by hierarchy level) ──────────────────────────

const HEADING_PATTERNS: Array<{ pattern: RegExp; level: number; label: string }> = [
	// Level 0: Top divisions
	{ pattern: /^(?:PART|DIVISION)\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 0, label: 'Part' },
	// Level 1: Titles
	{ pattern: /^TITLE\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 1, label: 'Title' },
	// Level 2: Chapters
	{ pattern: /^CHAPTER\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 2, label: 'Chapter' },
	// Level 3: Articles
	{ pattern: /^ARTICLE\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 3, label: 'Article' },
	// Level 4: Sections (§ or SECTION or SEC.)
	{ pattern: /^(?:SECTION|SEC\.?|§)\s*(\d+[\w.-]*)\b[.:—–\- ]*(.*)/im, level: 4, label: 'Section' },
	// Level 5: Subdivisions
	{ pattern: /^\(([a-z])\)\s+(.*)/m, level: 5, label: 'Subdivision' },
];

// ── Citation extraction regex ───────────────────────────────────────────

const CITATION_PATTERNS = [
	// California Constitution: "Cal. Const. art. I, § 2" or "Article I, Section 2"
	/(?:Cal\.?\s*Const\.?\s*)?(?:art(?:icle)?\.?\s*[IVXLCDM]+)\s*,?\s*(?:§|sec(?:tion)?\.?)\s*\d+[\w.-]*/gi,
	// Generic section references: "§ 1234" or "Section 1234.5(a)"
	/§\s*\d+[\w.-]*/g,
	// US Code: "42 U.S.C. § 1983"
	/\d+\s+U\.?S\.?C\.?\s*§?\s*\d+[\w.-]*/gi,
	// California codes: "Cal. Civ. Code § 1234" or "CCP § 425.16"
	/(?:Cal\.?\s*)?(?:Civ|Pen|Gov|Fam|Lab|Bus|Corp|Prob|Ins|Fin|Ed|Health|Welf|Veh|Wat)\.\s*(?:Code|& Prof\.?\s*Code)\s*§?\s*\d+[\w.-]*/gi,
	// Case citations: "Smith v. Jones, 123 Cal.App.4th 456"
	/\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+,?\s+\d+\s+(?:Cal\.?(?:\s*App\.?)?(?:\s*\d+(?:st|nd|rd|th))?|F\.?\s*(?:\d+d|Supp))\s+\d+/g,
];

// ── Main API ────────────────────────────────────────────────────────────

/**
 * Parse a legal document into structure-aware chunks.
 * For non-legal documents (no headings detected), falls back to simple token windowing.
 */
export function chunkLegalDocument(fullText: string, opts?: LegalChunkerOptions): LegalChunk[] {
	const maxTokens = opts?.maxTokens ?? 512;
	const overlap = opts?.overlap ?? 128;
	const minLen = opts?.minSectionLength ?? 30;

	// 1. Try to split by structural headings
	const sections = parseSections(fullText);

	// 2. If no structure found, fall back to simple windowing
	if (sections.length <= 1 && !sections[0]?.heading) {
		return simpleChunk(fullText, maxTokens, overlap);
	}

	// 3. Flatten sections and chunk each one
	const flatSections = flattenSections(sections);
	const chunks: LegalChunk[] = [];
	let globalChunkIndex = 0;

	for (const section of flatSections) {
		if (section.text.trim().length < minLen) continue;

		const sectionChunks = chunkSectionText(
			section.text,
			maxTokens,
			overlap,
			section.path,
			section.heading,
			section.startOffset,
			globalChunkIndex
		);

		for (const chunk of sectionChunks) {
			chunks.push(chunk);
			globalChunkIndex++;
		}
	}

	return chunks;
}

// ── Section parsing ─────────────────────────────────────────────────────

export function parseSections(text: string): LegalSection[] {
	const lines = text.split('\n');
	const root: LegalSection[] = [];
	const stack: LegalSection[] = [];
	let currentText = '';
	let currentOffset = 0;
	let lineOffset = 0;

	for (const line of lines) {
		const heading = detectHeading(line.trim());

		if (heading) {
			// Close previous section's text
			if (stack.length > 0) {
				const current = stack[stack.length - 1];
				current.text += currentText;
				current.endOffset = lineOffset;
			} else if (currentText.trim() && root.length === 0) {
				// Preamble text before first heading
				root.push({
					level: -1,
					heading: 'Preamble',
					text: currentText,
					startOffset: 0,
					endOffset: lineOffset,
					children: [],
					path: ['Preamble'],
				});
			}
			currentText = '';

			const newSection: LegalSection = {
				level: heading.level,
				heading: heading.fullHeading,
				text: '',
				startOffset: lineOffset,
				endOffset: lineOffset,
				children: [],
				path: [],
			};

			// Pop stack until we find a parent with lower level
			while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
				stack.pop();
			}

			if (stack.length > 0) {
				const parent = stack[stack.length - 1];
				parent.children.push(newSection);
				newSection.path = [...parent.path, heading.fullHeading];
			} else {
				root.push(newSection);
				newSection.path = [heading.fullHeading];
			}

			stack.push(newSection);
		} else {
			currentText += line + '\n';
		}

		lineOffset += line.length + 1; // +1 for \n
	}

	// Close last section
	if (stack.length > 0) {
		const current = stack[stack.length - 1];
		current.text += currentText;
		current.endOffset = lineOffset;
	}

	return root;
}

function detectHeading(line: string): { level: number; fullHeading: string } | null {
	if (!line || line.length > 200) return null; // Headings are short

	for (const { pattern, level } of HEADING_PATTERNS) {
		const match = line.match(pattern);
		if (match) {
			return { level, fullHeading: line.trim() };
		}
	}

	// Detect ALL-CAPS lines as potential headings (common in legal docs)
	if (line.length > 3 && line.length < 120 && line === line.toUpperCase() && /[A-Z]/.test(line)) {
		// Exclude lines that are just numbers or punctuation
		if (/[A-Z]{3,}/.test(line)) {
			return { level: 2, fullHeading: line.trim() };
		}
	}

	return null;
}

function flattenSections(sections: LegalSection[]): LegalSection[] {
	const result: LegalSection[] = [];

	for (const section of sections) {
		result.push(section);
		if (section.children.length > 0) {
			result.push(...flattenSections(section.children));
		}
	}

	return result;
}

// ── Chunk a single section into token windows ────────────────────────────

function chunkSectionText(
	text: string,
	maxTokens: number,
	overlap: number,
	sectionPath: string[],
	heading: string,
	baseOffset: number,
	startIndex: number
): LegalChunk[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];

	const citations = extractCitations(text);

	if (words.length <= maxTokens) {
		return [{
			text: text.trim(),
			chunkIndex: startIndex,
			sectionPath,
			heading,
			startOffset: baseOffset,
			endOffset: baseOffset + text.length,
			tokenCount: words.length,
			citations,
		}];
	}

	const chunks: LegalChunk[] = [];
	let chunkIdx = startIndex;
	let charOffset = 0;

	for (let i = 0; i < words.length; i += maxTokens - overlap) {
		const windowWords = words.slice(i, i + maxTokens);
		const chunkText = windowWords.join(' ');
		const chunkCitations = extractCitations(chunkText);

		chunks.push({
			text: chunkText,
			chunkIndex: chunkIdx,
			sectionPath,
			heading,
			startOffset: baseOffset + charOffset,
			endOffset: baseOffset + charOffset + chunkText.length,
			tokenCount: windowWords.length,
			citations: chunkCitations,
		});

		charOffset += windowWords.slice(0, maxTokens - overlap).join(' ').length + 1;
		chunkIdx++;

		if (i + maxTokens >= words.length) break;
	}

	return chunks;
}

// ── Citation extraction ──────────────────────────────────────────────────

function extractCitations(text: string): string[] {
	const found = new Set<string>();

	for (const pattern of CITATION_PATTERNS) {
		// Reset lastIndex for global regexes
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			found.add(match[0].trim());
		}
	}

	return [...found];
}

// ── Simple fallback chunker (no structure detected) ──────────────────────

function simpleChunk(text: string, maxTokens: number, overlap: number): LegalChunk[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length <= maxTokens) {
		return [{
			text: text.trim(),
			chunkIndex: 0,
			sectionPath: [],
			heading: '',
			startOffset: 0,
			endOffset: text.length,
			tokenCount: words.length,
			citations: extractCitations(text),
		}];
	}

	const chunks: LegalChunk[] = [];
	let chunkIdx = 0;
	let charOffset = 0;

	for (let i = 0; i < words.length; i += maxTokens - overlap) {
		const windowWords = words.slice(i, i + maxTokens);
		const chunkText = windowWords.join(' ');

		chunks.push({
			text: chunkText,
			chunkIndex: chunkIdx,
			sectionPath: [],
			heading: '',
			startOffset: charOffset,
			endOffset: charOffset + chunkText.length,
			tokenCount: windowWords.length,
			citations: extractCitations(chunkText),
		});

		charOffset += windowWords.slice(0, maxTokens - overlap).join(' ').length + 1;
		chunkIdx++;

		if (i + maxTokens >= words.length) break;
	}

	return chunks;
}