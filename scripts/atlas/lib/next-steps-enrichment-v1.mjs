export const TASK_ENRICHMENT_TRIGGERS_V1 = Object.freeze([
	'NONE',
	'POS',
	'AST_REFERENCED_FILE',
	'FENCED_CODE',
	'LANGEXTRACT_CANDIDATE',
]);

const supportedFenceLanguages = new Map([
	['ts', 'typescript'], ['tsx', 'typescript'], ['typescript', 'typescript'],
	['js', 'javascript'], ['jsx', 'javascript'], ['javascript', 'javascript'],
	['py', 'python'], ['python', 'python'], ['sql', 'sql'],
]);

export function classifyTaskEnrichmentV1(text, { referencedFile = false, supportedFence = false } = {}) {
	const triggers = [];
	const hasIdentifier = /[a-z_$][\w$]*[A-Z][\w$]*|\b[A-Za-z_][A-Za-z0-9]*_[A-Za-z0-9_]+\b|@[\w.-]+\/[\w./-]+/.test(text);
	const hasDomainPhrase = /\b(?:evidence identity|canonical promotion|proposal eligibility|source revision|packet lineage|domain classification|validator-backed repair evidence)\b/i.test(text);
	if (hasIdentifier || hasDomainPhrase) triggers.push('POS');
	if (referencedFile) triggers.push('AST_REFERENCED_FILE');
	if (supportedFence) triggers.push('FENCED_CODE');
	if (/\b(?:requires?|must|depends? on|implements?|produces?|consumes?|maps? to|because|so that)\b/i.test(text) && !/\bimplements?\b/i.test(text)) {
		triggers.push('LANGEXTRACT_CANDIDATE');
	}
	return triggers.length ? triggers : ['NONE'];
}

export function normalizeFenceLanguageV1(info) {
	const tag = String(info ?? '').trim().split(/[\s{]/, 1)[0].toLowerCase();
	return { tag: tag || null, language: supportedFenceLanguages.get(tag) ?? null };
}

export function extractMarkdownFencesV1(lines) {
	const fences = [];
	let opening = null;
	let contents = [];
	let ordinal = 0;
	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
		if (!opening) {
			if (!match) continue;
			opening = { marker: match[1], startLine: index + 1, info: match[2].trim() };
			contents = [];
			continue;
		}
		if (match && match[1][0] === opening.marker[0] && match[1].length >= opening.marker.length && !match[2].trim()) {
			ordinal++;
			const source = `${contents.join('\n')}${contents.length ? '\n' : ''}`;
			const { tag, language } = normalizeFenceLanguageV1(opening.info);
			fences.push({
				fenceOrdinal: ordinal,
				fenceLanguage: tag,
				analysisLanguage: language,
				fenceStartLine: opening.startLine,
				fenceEndLine: index + 1,
				snippet: source,
			});
			opening = null;
			contents = [];
			continue;
		}
		contents.push(lines[index]);
	}
	return fences;
}
