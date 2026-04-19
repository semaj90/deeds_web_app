// Legal Corpus view adapter layer
// One canonical server payload → multiple UI presentation models

// ── View enum ──
export const legalCorpusViews = ['reader', 'classic', 'demo'] as const;
export type LegalCorpusView = (typeof legalCorpusViews)[number];

// ── Canonical server payload type (mirrors +page.server.ts return) ──
export interface LegalCorpusPageData {
	statute: {
		id: string;
		title: string;
		content: string | null;
		section: string | null;
		jurisdiction: string | null;
		category: string | null;
		sourceUrl: string | null;
		effectiveDate: string | null;
		createdAt: string;
		updatedAt: string;
	} | null;
	chunks: { id: string; chunkIndex: number; content: string }[];
	precedents: {
		id: string;
		title: string;
		summary: string | null;
		citation: string | null;
		court: string | null;
		decisionDate: string | null;
	}[];
	caseLinks: {
		id: string;
		caseId: string;
		linkType: string | null;
		notes: string | null;
		createdAt: string;
		caseTitle: string | null;
		caseStatus: string | null;
	}[];
	glossaryTerms: {
		id: string;
		term: string;
		definition: string;
		category: string | null;
		relatedTerms: string[] | null;
	}[];
	relatedStatutes: {
		id: string;
		title: string;
		section: string | null;
		category: string | null;
	}[];
	loadError: string | null;
}

// ── Demo model (slim showcase) ──
export interface DemoModel {
	title: string;
	section: string | null;
	jurisdiction: string | null;
	category: string | null;
	summary: string;
	topSections: { id: string; chunkIndex: number; content: string }[];
	topCitations: { id: string; title: string; citation: string | null; court: string | null; summary: string | null; decisionDate: string | null }[];
	glossaryPreview: { term: string; definition: string }[];
	stats: {
		chunks: number;
		precedents: number;
		caseLinks: number;
		glossaryTerms: number;
		relatedStatutes: number;
	};
}

// ── Adapter functions ──

/** Reader view uses the full canonical payload directly */
export function toReaderModel(data: LegalCorpusPageData): LegalCorpusPageData {
	return data;
}

/** Classic view also uses the full payload */
export function toClassicModel(data: LegalCorpusPageData): LegalCorpusPageData {
	return data;
}

/** Demo view: slim showcase with top-N slices */
export function toDemoModel(data: LegalCorpusPageData): DemoModel {
	const statute = data.statute;
	return {
		title: statute?.title ?? 'Untitled',
		section: statute?.section ?? null,
		jurisdiction: statute?.jurisdiction ?? null,
		category: statute?.category ?? null,
		summary: statute?.content?.slice(0, 500) ?? data.chunks[0]?.content?.slice(0, 500) ?? 'No content available.',
		topSections: data.chunks.slice(0, 6),
		topCitations: data.precedents.slice(0, 6).map((p) => ({
			id: p.id,
			title: p.title,
			citation: p.citation,
			court: p.court,
			summary: p.summary,
			decisionDate: p.decisionDate,
		})),
		glossaryPreview: data.glossaryTerms.slice(0, 4).map((t) => ({
			term: t.term,
			definition: t.definition,
		})),
		stats: {
			chunks: data.chunks.length,
			precedents: data.precedents.length,
			caseLinks: data.caseLinks.length,
			glossaryTerms: data.glossaryTerms.length,
			relatedStatutes: data.relatedStatutes.length,
		},
	};
}

/** Parse view from URL search params with fallback */
export function parseView(url: URL, fallback: LegalCorpusView = 'reader'): LegalCorpusView {
	const v = url.searchParams.get('view');
	if (v && legalCorpusViews.includes(v as LegalCorpusView)) return v as LegalCorpusView;
	return fallback;
}
