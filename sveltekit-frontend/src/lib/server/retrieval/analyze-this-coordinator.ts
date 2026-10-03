import { createHash } from 'node:crypto';

export const ANALYZE_THIS_SCHEMA = 'atlas.analyze-this-result.v1' as const;

export type AnalyzeEvidenceKind = 'rg' | 'ast-grep' | 'tree-sitter' | 'postgres' | 'go-retrieval' | 'web';
export type AnalyzeSourceMode = 'WORKTREE_DIAGNOSTIC' | 'ADMITTED_CORPUS';

export interface AnalyzeEvidenceInput {
	kind: AnalyzeEvidenceKind;
	filePath: string;
	sourceRef?: string | null;
	sourceRevision?: string | null;
	contentHash?: string | null;
	parserRevision?: string | null;
	startByte?: number | null;
	endByte?: number | null;
	score: number;
	snippet?: string | null;
	executor?: string | null;
}

export interface AnalyzeEvidenceItem {
	kind: AnalyzeEvidenceKind;
	sourceRef: string;
	sourceRevision: string | null;
	contentHash: string | null;
	parserRevision: string | null;
	startByte: number | null;
	endByte: number | null;
	score: number;
	snippet: string | null;
	executor: string | null;
}

export interface AnalyzeThisRequest {
	query: string;
	topK?: number;
	sourceMode?: AnalyzeSourceMode;
	evidence: AnalyzeEvidenceInput[];
}

export interface AnalyzeThisResult {
	schema: typeof ANALYZE_THIS_SCHEMA;
	query: string;
	sourceMode: AnalyzeSourceMode;
	files: Array<{
		filePath: string;
		score: number;
		evidence: AnalyzeEvidenceItem[];
	}>;
	contextManifest: {
		itemCount: number;
		fileCount: number;
		checksum: string;
	};
	canonicalAuthority: false;
	writesPerformed: false;
}

function cleanText(value: string | null | undefined, field: string): string {
	const cleaned = value?.trim() ?? '';
	if (!cleaned) throw new Error(`ANALYZE_THIS_${field.toUpperCase()}_REQUIRED`);
	return cleaned;
}

function normalizeEvidence(input: AnalyzeEvidenceInput): AnalyzeEvidenceItem {
	const filePath = cleanText(input.filePath, 'file_path');
	if (!Number.isFinite(input.score)) throw new Error('ANALYZE_THIS_SCORE_INVALID');
	const startByte = input.startByte == null ? null : Number(input.startByte);
	const endByte = input.endByte == null ? null : Number(input.endByte);
	if (startByte != null && (!Number.isInteger(startByte) || startByte < 0)) throw new Error('ANALYZE_THIS_START_BYTE_INVALID');
	if (endByte != null && (!Number.isInteger(endByte) || endByte < startByte!)) throw new Error('ANALYZE_THIS_END_BYTE_INVALID');
	return {
		kind: input.kind,
		sourceRef: cleanText(input.sourceRef ?? filePath, 'source_ref'),
		sourceRevision: input.sourceRevision?.trim() || null,
		contentHash: input.contentHash?.trim() || null,
		parserRevision: input.parserRevision?.trim() || null,
		startByte,
		endByte,
		score: Number(input.score),
		snippet: input.snippet?.trim() || null,
		executor: input.executor?.trim() || null,
	};
}

function evidenceSort(a: AnalyzeEvidenceItem, b: AnalyzeEvidenceItem): number {
	return b.score - a.score
		|| a.sourceRef.localeCompare(b.sourceRef)
		|| a.kind.localeCompare(b.kind)
		|| (a.startByte ?? -1) - (b.startByte ?? -1)
		|| (a.executor ?? '').localeCompare(b.executor ?? '');
}

function manifestChecksum(files: AnalyzeThisResult['files']): string {
	return `sha256:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`;
}

/**
 * Normalize bounded search evidence into deterministic file-level context.
 * This is intentionally pure: it never calls a search backend or writes a cache.
 */
export function coordinateAnalyzeThis(request: AnalyzeThisRequest): AnalyzeThisResult {
	const query = cleanText(request.query, 'query');
	const sourceMode = request.sourceMode ?? 'WORKTREE_DIAGNOSTIC';
	const topK = Math.max(1, Math.min(100, Math.trunc(request.topK ?? 10)));
	const groups = new Map<string, AnalyzeEvidenceItem[]>();
	for (const raw of request.evidence) {
		const item = normalizeEvidence(raw);
		const filePath = raw.filePath.trim();
		const group = groups.get(filePath) ?? [];
		group.push(item);
		groups.set(filePath, group);
	}

	const files = [...groups.entries()]
		.map(([filePath, items]) => {
			const evidence = items.sort(evidenceSort);
			return { filePath, score: evidence[0]?.score ?? 0, evidence };
		})
		.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
		.slice(0, topK);

	const result = {
		schema: ANALYZE_THIS_SCHEMA,
		query,
		sourceMode,
		files,
		contextManifest: { itemCount: files.reduce((n, file) => n + file.evidence.length, 0), fileCount: files.length, checksum: '' },
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	result.contextManifest.checksum = manifestChecksum(files);
	return result;
}
