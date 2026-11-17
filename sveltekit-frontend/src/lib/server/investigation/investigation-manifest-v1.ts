/**
 * Pure helpers for the investigation summary export: canonical manifests, hashing,
 * citation extraction/validation, and output sanitizing. No DB or model imports, so the
 * contract is unit-testable in isolation.
 */
import { createHash } from 'node:crypto';

export const FACET_KINDS = ['WHO', 'WHAT', 'WHY', 'HOW'] as const;
export type FacetKind = (typeof FACET_KINDS)[number];

export interface ManifestFacetLink {
	evidenceId: string;
	relevance: number;
}

export interface ManifestFacet {
	id: string;
	kind: FacetKind;
	claim: string;
	status: string;
	confidence: number | null;
	links: ManifestFacetLink[];
}

export interface ManifestEvidence {
	id: string;
	title: string;
	text: string;
}

export interface InvestigationManifest {
	caseId: string;
	facets: ManifestFacet[];
	evidence: ManifestEvidence[];
}

/** Per-evidence text bound sent to the model. Keeps the prompt and the hash input small. */
export const EVIDENCE_TEXT_LIMIT = 1200;

export function sha256Hex(input: string): string {
	return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic JSON: object keys sorted recursively, arrays kept in given order. */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	const entries = Object.keys(value as Record<string, unknown>)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
	return `{${entries.join(',')}}`;
}

/** Sorts every collection by stable identity so equal inputs always hash equally. */
export function normalizeManifest(manifest: InvestigationManifest): InvestigationManifest {
	return {
		caseId: manifest.caseId,
		facets: [...manifest.facets]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((facet) => ({
				...facet,
				links: [...facet.links].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))
			})),
		evidence: [...manifest.evidence].sort((a, b) => a.id.localeCompare(b.id))
	};
}

export function buildHashes(manifest: InvestigationManifest) {
	const normalized = normalizeManifest(manifest);
	return {
		inputManifestSha256: sha256Hex(canonicalJson(normalized)),
		facetSnapshotSha256: sha256Hex(canonicalJson(normalized.facets))
	};
}

/** Bounded evidence text: AI summary, else summary, else extracted text. Whitespace-collapsed. */
export function boundEvidenceText(input: {
	aiSummary?: string | null;
	summary?: string | null;
	extractedText?: string | null;
}): string {
	const raw = [input.aiSummary, input.summary, input.extractedText]
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.find((value) => value.length > 0) ?? '';
	return raw.replace(/\s+/g, ' ').slice(0, EVIDENCE_TEXT_LIMIT);
}

const CITATION_RE = /\[evidence:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

/** Every evidence id the summary cites, deduplicated, in order of first appearance. */
export function extractCitations(markdown: string): string[] {
	const seen = new Set<string>();
	for (const match of markdown.matchAll(CITATION_RE)) seen.add(match[1].toLowerCase());
	return [...seen];
}

/**
 * Fail-closed citation check: every cited id must be evidence linked to this case's facets.
 * Returns the unsupported ids; an empty array means the summary is admissible.
 */
export function unsupportedCitations(cited: string[], admittedEvidenceIds: string[]): string[] {
	const admitted = new Set(admittedEvidenceIds.map((id) => id.toLowerCase()));
	return cited.filter((id) => !admitted.has(id));
}

const SECTION_HEADING_RE = /^\s*(?:#+\s*)?\**(WHO|WHAT|WHY|HOW)\b\**\s*[:\-—]?\s*(.*)$/i;
const NO_FACET_TEXT = /^no facet recorded\.?$/i;

/**
 * Server-side structure check. A WHO/WHAT/WHY/HOW section whose kind has no facet must contain
 * nothing but "No facet recorded." Returns the offending kinds (empty when the summary is admissible).
 */
export function unsupportedSections(markdown: string, facetKinds: string[]): FacetKind[] {
	const present = new Set(facetKinds);
	const bodies = new Map<FacetKind, string[]>();
	let current: FacetKind | null = null;
	for (const line of markdown.split(/\r?\n/)) {
		const heading = line.match(SECTION_HEADING_RE);
		if (heading) {
			current = heading[1].toUpperCase() as FacetKind;
			const list = bodies.get(current) ?? [];
			if (heading[2]?.trim()) list.push(heading[2].trim());
			bodies.set(current, list);
			continue;
		}
		if (current && line.trim()) bodies.get(current)?.push(line.trim());
	}
	const invented: FacetKind[] = [];
	for (const kind of FACET_KINDS) {
		if (present.has(kind)) continue;
		const lines = bodies.get(kind) ?? [];
		const substantive = lines.filter((text) => !NO_FACET_TEXT.test(text));
		if (substantive.length > 0) invented.push(kind);
	}
	return invented;
}

/** Removes model reasoning blocks so only the answer is stored or shown. */
export function stripReasoning(text: string): string {
	return text
		.replace(/<think>[\s\S]*?<\/think>/gi, '')
		.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
		.trim();
}

export function buildSummaryPrompt(manifest: InvestigationManifest): string {
	const normalized = normalizeManifest(manifest);
	const lines: string[] = [
		'Write a concise investigative summary organized under WHO, WHAT, WHY and HOW.',
		'Use only the facts below. Label anything unsupported as a hypothesis.',
		'Write a WHO, WHAT, WHY or HOW section only if at least one facet of that kind is listed below.',
		'If no facet of a kind is listed, write that section as "No facet recorded." and nothing else.',
		'Cite evidence inline using exactly the form [evidence:<id>] with an id from the list.',
		'Do not cite any id that is not listed.',
		'',
		'## Facets'
	];
	for (const facet of normalized.facets) {
		const links = facet.links.map((link) => link.evidenceId).join(', ') || 'none';
		lines.push(`- ${facet.kind} (${facet.status}${facet.confidence !== null ? `, confidence ${facet.confidence}` : ''}): ${facet.claim} | linked evidence: ${links}`);
	}
	lines.push('', '## Evidence');
	for (const item of normalized.evidence) {
		lines.push(`- [evidence:${item.id}] ${item.title}: ${item.text || '(no text available)'}`);
	}
	return lines.join('\n');
}
