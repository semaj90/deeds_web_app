import type { DoclingBlock } from '$lib/server/docling.js';
import type { LangExtractSection } from '$lib/server/services/langextract-service.js';

type SectionType = LangExtractSection['section_type'];

export interface DoclingStructureSummary {
	blockTypes: string[];
	headings: string[];
	sections: LangExtractSection[];
}

const SECTION_PATTERNS: Array<{ type: SectionType; pattern: RegExp }> = [
	{ type: 'facts', pattern: /\b(facts?|background|factual background|statement of facts|incident summary)\b/i },
	{ type: 'issues', pattern: /\b(issues?|question presented|questions presented)\b/i },
	{ type: 'reasoning', pattern: /\b(reasoning|analysis|discussion|legal standard|application)\b/i },
	{ type: 'holding', pattern: /\b(holding|conclusion|decision)\b/i },
	{ type: 'citations', pattern: /\b(citations?|authorities|statutes cited|rules cited)\b/i },
	{ type: 'parties', pattern: /\b(parties|plaintiff|defendant|appellant|respondent)\b/i },
	{ type: 'motions', pattern: /\b(motions?|motion to|request for)\b/i },
	{ type: 'bibliography', pattern: /\b(bibliography|references|sources)\b/i },
	{ type: 'procedural_history', pattern: /\b(procedural history|procedural background|history of the case)\b/i },
	{ type: 'sentencing', pattern: /\b(sentencing|sentence|punishment)\b/i },
	{ type: 'judgment', pattern: /\b(judgment|verdict|order|decree)\b/i },
];

function normalizeText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function inferSectionType(heading: string): SectionType | null {
	for (const candidate of SECTION_PATTERNS) {
		if (candidate.pattern.test(heading)) {
			return candidate.type;
		}
	}
	return null;
}

export function summarizeDoclingStructure(blocks: DoclingBlock[]): DoclingStructureSummary {
	const normalizedBlocks = blocks
		.map((block) => ({ ...block, text: normalizeText(block.text) }))
		.filter((block) => block.text.length > 0);

	if (normalizedBlocks.length === 0) {
		return { blockTypes: [], headings: [], sections: [] };
	}

	const blockTypes = [...new Set(normalizedBlocks.map((block) => block.type))];
	const headings = normalizedBlocks
		.filter((block) => block.type === 'heading')
		.map((block) => block.text)
		.slice(0, 25);

	const headingOffsets = normalizedBlocks
		.map((block, index) => ({ block, index }))
		.filter((entry) => entry.block.type === 'heading');
	const sections: LangExtractSection[] = [];
	let contentCursor = 0;

	for (let i = 0; i < headingOffsets.length; i++) {
		const currentHeading = headingOffsets[i];
		const nextHeading = headingOffsets[i + 1];
		const sectionType = inferSectionType(currentHeading.block.text);
		if (!sectionType) continue;

		const endIndexExclusive = nextHeading ? nextHeading.index : normalizedBlocks.length;
		const sectionBlocks = normalizedBlocks.slice(currentHeading.index + 1, endIndexExclusive);
		const sectionText = sectionBlocks.map((block) => block.text).join('\n\n').trim();
		if (!sectionText) continue;
		const startOffset = contentCursor;
		const endOffset = startOffset + sectionText.length;

		sections.push({
			section_type: sectionType,
			section_subtype: currentHeading.block.text.slice(0, 160),
			text: sectionText,
			start_offset: startOffset,
			end_offset: endOffset,
			confidence: 0.72,
		});
		contentCursor = endOffset + 2;
	}

	return {
		blockTypes,
		headings,
		sections,
	};
}