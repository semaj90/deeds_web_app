#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTaskEnrichmentV1, extractMarkdownFencesV1 } from './lib/next-steps-enrichment-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputRoot = path.join(repoRoot, 'docs/next_steps');
const masterPath = path.join(repoRoot, 'docs/next_steps_master.md');
const reportPath = path.join(repoRoot, 'docs/reports/next-steps-master-v1.json');
const lexicalRoots = ['sveltekit-frontend/src', 'scripts', 'packages', 'services', '.vscode', 'openspec'];
const sidecarBaseUrl = (process.env.NLP_SIDECAR_URL || 'http://127.0.0.1:8095').replace(/\/$/, '');
const sidecarTimeoutMs = 5_000;
const maxSidecarFiles = 20;
const maxPosCandidates = 50;
const maxTotalSidecarBytes = 1_000_000;
const maxPerSidecarInputBytes = 200_000;
const sourceFilePattern = /\b(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|mjs|cjs|py|go|rs|cpp|h)\b/g;
const supportedPathExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.go', '.rs', '.cpp', '.h']);
let filesOutsideRootRejected = 0;
let referencedFilesMissing = 0;
let sidecarCalls = 0;
let sidecarFailures = 0;
let sidecarBytes = 0;
const sidecarFiles = new Set();

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

async function listMarkdown(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...await listMarkdown(absolute));
		else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
	}
	return files;
}

async function resolveReferencedSourceFiles(text) {
	const resolved = [];
	for (const match of text.matchAll(sourceFilePattern)) {
		const relativePath = match[0].replaceAll('\\', '/');
		if (!supportedPathExtensions.has(path.extname(relativePath).toLowerCase())) continue;
		const absolutePath = path.resolve(repoRoot, relativePath);
		if (!absolutePath.startsWith(`${repoRoot}${path.sep}`)) {
			filesOutsideRootRejected++;
			continue;
		}
		try {
			const actualPath = await realpath(absolutePath);
			if (!actualPath.startsWith(`${repoRoot}${path.sep}`)) {
				filesOutsideRootRejected++;
				continue;
			}
			resolved.push(relativePath);
		} catch {
			referencedFilesMissing++;
		}
	}
	return [...new Set(resolved)];
}

function extractIdentifiers(text) {
	const matches = text.match(/\b(?:Phase\s+\d+\+?|[A-Z]{2,}[A-Za-z0-9]*|[A-Za-z0-9]*[a-z]+[A-Z][A-Za-z0-9]*)\b/g) ?? [];
	return [...new Set(matches.filter((value) => value.length > 1))].sort((a, b) => a.localeCompare(b));
}

function collectLexicalHits(terms) {
	if (terms.length === 0) return new Map();
	try {
		const output = execFileSync('rg', [
			'--json', '--fixed-strings', '--line-number', '--max-count', '8', '--sort', 'path',
			'--glob', '*.ts', '--glob', '*.tsx', '--glob', '*.js', '--glob', '*.mjs', '--glob', '*.py', '--glob', '*.go', '--glob', '*.rs', '--glob', '*.cpp', '--glob', '*.h',
			'--glob', '!**/node_modules/**', '--glob', '!**/dist/**', '--glob', '!**/build/**',
			...terms.flatMap((term) => ['-e', term]), ...lexicalRoots,
		], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		const hits = new Map(terms.map((term) => [term, []]));
		for (const line of output.split(/\r?\n/).filter(Boolean)) {
			const event = JSON.parse(line);
			if (event.type !== 'match') continue;
			for (const submatch of event.data.submatches) {
				const term = submatch.match.text;
				const records = hits.get(term);
				if (records && records.length < 8) records.push({
					file: event.data.path.text.replaceAll('\\', '/'),
					line: event.data.line_number,
					text: event.data.lines.text.trim().slice(0, 240),
				});
			}
		}
		return hits;
	} catch {
		return new Map();
	}
}

async function callSidecar(route, payload) {
	const inputBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
	if (inputBytes > maxPerSidecarInputBytes) throw new Error('SIDECAR_INPUT_OVER_PER_FILE_LIMIT');
	if (sidecarBytes + inputBytes > maxTotalSidecarBytes) throw new Error('SIDECAR_TOTAL_BYTE_LIMIT_REACHED');
	sidecarBytes += inputBytes;
	sidecarCalls++;
	try {
		const response = await fetch(`${sidecarBaseUrl}${route}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(sidecarTimeoutMs),
		});
		if (!response.ok) throw new Error(`SIDECAR_HTTP_${response.status}`);
		return await response.json();
	} catch (error) {
		sidecarFailures++;
		throw error;
	}
}

function admitSidecarFile(sourceFile) {
	if (sidecarFiles.has(sourceFile)) return true;
	if (sidecarFiles.size >= maxSidecarFiles) return false;
	sidecarFiles.add(sourceFile);
	return true;
}

async function enrichWithSidecar() {
	const astFiles = new Set();
	let posCalls = 0;
	for (const candidate of candidates) {
		const willCallSidecar = (candidate.enrichmentTriggers.includes('POS') && posCalls < maxPosCandidates)
			|| candidate.source.fencedCode.some((fence) => fence.analysisLanguage)
			|| candidate.normalized.referencedFiles.length > 0;
		if (willCallSidecar && !admitSidecarFile(candidate.source.file)) {
			candidate.enrichmentStatus.sidecar = 'MAX_FILES_REACHED';
			continue;
		}
		if (candidate.enrichmentTriggers.includes('POS') && posCalls < maxPosCandidates) {
			posCalls++;
			try {
				const result = await callSidecar('/pos', { text: candidate.source.rawText });
				candidate.nlpEvidence.pos = {
					provider: 'spacy-fastapi-sidecar',
					coordinateBasis: result.coordinate_basis ?? null,
					tokens: (result.token_assertions ?? []).map((token) => ({
						text: token.text,
						pos: token.pos,
						tag: token.tag,
						startByte: token.start_byte,
						endByte: token.end_byte,
					})),
					status: 'DIAGNOSTIC_ONLY',
				};
				candidate.enrichmentStatus.pos = 'SIDECAR_COMPLETED';
			} catch (error) {
				candidate.enrichmentStatus.pos = `SIDECAR_UNAVAILABLE: ${error.message}`;
			}
		}
		for (const fence of candidate.source.fencedCode) {
			if (!fence.analysisLanguage) {
				candidate.enrichmentStatus.unsupportedLanguages.push(fence.fenceLanguage ?? 'UNTAGGED');
				continue;
			}
			try {
				const result = await callSidecar('/ast/chunk', {
					source: fence.snippet,
					language: fence.analysisLanguage,
					filePath: `${candidate.source.file}#fence-${fence.fenceOrdinal}`,
					sourceRevision: `sha256:${sha256(fence.snippet)}`,
				});
				candidate.codeEvidence.astChunkHits.push({
					kind: 'FENCED_CODE',
					markdownFile: candidate.source.file,
					markdownChecksum: candidate.source.sourceChecksum,
					taskLine: candidate.source.line,
					taskHeading: candidate.source.headingPath,
					fenceOrdinal: fence.fenceOrdinal,
					fenceLanguage: fence.fenceLanguage,
					fenceStartLine: fence.fenceStartLine,
					fenceEndLine: fence.fenceEndLine,
					snippetChecksum: fence.snippetChecksum,
					provider: result.engine ?? null,
					providerRevision: result.engine_version ?? null,
					chunkCount: Array.isArray(result.chunks) ? result.chunks.length : 0,
					edgeCount: Array.isArray(result.edges) ? result.edges.length : 0,
					canonicalAuthority: false,
				});
				candidate.enrichmentStatus.fencedCode = 'SIDECAR_COMPLETED_DIAGNOSTIC_ONLY';
			} catch (error) {
				candidate.enrichmentStatus.fencedCode = `SIDECAR_UNAVAILABLE: ${error.message}`;
			}
		}

		for (const relativeSourcePath of candidate.normalized.referencedFiles) {
			const absoluteSourcePath = path.resolve(repoRoot, relativeSourcePath);
			if (!supportedPathExtensions.has(path.extname(relativeSourcePath).toLowerCase())) continue;
			if (!absoluteSourcePath.startsWith(`${repoRoot}${path.sep}`) || astFiles.has(relativeSourcePath)) continue;
			if (!admitSidecarFile(relativeSourcePath)) {
				candidate.enrichmentStatus.astChunk = 'MAX_FILES_REACHED';
				continue;
			}
			astFiles.add(relativeSourcePath);
			try {
				const resolvedSourcePath = await realpath(absoluteSourcePath);
				if (!resolvedSourcePath.startsWith(`${repoRoot}${path.sep}`)) {
					candidate.enrichmentStatus.astChunk = 'SOURCE_PATH_OUTSIDE_REPOSITORY';
					continue;
				}
				const source = await readFile(resolvedSourcePath, 'utf8');
				if (!source || Buffer.byteLength(source, 'utf8') > maxPerSidecarInputBytes) {
					candidate.enrichmentStatus.astChunk = 'SOURCE_EMPTY_OR_OVER_LIMIT';
					continue;
				}
				const language = path.extname(absoluteSourcePath).slice(1).replace(/^tsx?$/, 'typescript').replace(/^m?js$/, 'javascript');
				const result = await callSidecar('/ast/chunk', {
					source,
					language,
					filePath: relativeSourcePath,
					sourceRevision: `sha256:${sha256(source)}`,
				});
				candidate.codeEvidence.astChunkHits.push({
					kind: 'AST_REFERENCED_FILE',
					requestedPath: relativeSourcePath,
					provider: result.engine ?? null,
					providerRevision: result.engine_version ?? null,
					sourceRevision: result.source_revision ?? null,
					chunkCount: Array.isArray(result.chunks) ? result.chunks.length : 0,
					edgeCount: Array.isArray(result.edges) ? result.edges.length : 0,
					diagnostics: result.diagnostics ?? [],
					canonicalAuthority: false,
				});
				candidate.enrichmentStatus.astChunk = 'SIDECAR_COMPLETED_DIAGNOSTIC_ONLY';
			} catch (error) {
				candidate.enrichmentStatus.astChunk = `SIDECAR_UNAVAILABLE: ${error.message}`;
			}
		}
	}
}

const files = (await listMarkdown(inputRoot)).sort((a, b) => a.localeCompare(b));
const candidates = [];
for (const absolutePath of files) {
	const bytes = await readFile(absolutePath);
	const text = bytes.toString('utf8');
	const relativePath = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
	const sourceChecksum = `sha256:${sha256(bytes)}`;
	const lines = text.split(/\r?\n/);
	const headingStack = [];
	let sectionMarker = '';
	let activeCandidate = null;
	const fencesByStart = new Map(extractMarkdownFencesV1(lines).map((fence) => [fence.fenceStartLine, fence]));
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const fence = line.match(/^\s*(```+|~~~+)/);
		if (fence) {
			const extracted = fencesByStart.get(index + 1);
			if (activeCandidate && extracted) {
				activeCandidate.source.fencedCode.push({
					...extracted,
					snippetChecksum: `sha256:${sha256(extracted.snippet)}`,
					markdownChecksum: sourceChecksum,
				});
				index = extracted.fenceEndLine - 1;
			} else if (!extracted) {
				index = lines.length;
			}
			continue;
		}
		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (heading) {
			activeCandidate = null;
			const level = heading[1].length;
			while (headingStack.length && headingStack.at(-1).level >= level) headingStack.pop();
			headingStack.push({ level, text: heading[2].trim() });
			sectionMarker = '';
			continue;
		}
		const emphasizedSection = line.match(/^\s*\*\*(Defer unless|Proceed if):\*\*\s*$/i);
		if (emphasizedSection) {
			sectionMarker = emphasizedSection[1].toLowerCase();
			continue;
		}
		const checkbox = line.match(/^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/);
		if (!checkbox) continue;
		const rawText = checkbox[1].trim();
		const normalizedText = rawText.replace(/\s+/g, ' ');
		const taskId = `next-step:sha256:${sha256(`${relativePath}\n${index + 1}\n${normalizedText}\n${sourceChecksum}`)}`;
		const headingPath = headingStack.map(({ text }) => text);
		const section = sectionMarker || headingPath.at(-1)?.toLowerCase() || '';
		const taskKind = section.includes('defer unless')
			? 'CONDITIONAL_TRIGGER'
			: section.includes('proceed if')
				? 'ROADMAP_TRIGGER'
				: 'UNCLASSIFIED';
		const identifiers = extractIdentifiers(rawText);
		const referencedFiles = await resolveReferencedSourceFiles(rawText);
		const enrichmentTriggers = classifyTaskEnrichmentV1(rawText, {
			referencedFile: referencedFiles.some((file) => supportedPathExtensions.has(path.extname(file).toLowerCase())),
			supportedFence: false,
		});
		const candidate = {
			taskId,
			source: { file: relativePath, line: index + 1, headingPath, rawText, sourceChecksum, fencedCode: [] },
			normalized: { text: normalizedText, domain: null, taskType: taskKind, ownerHint: null, identifiers, referencedFiles },
			enrichmentTriggers,
			codeEvidence: { lexicalHits: [], symbolHits: [], astHits: [], astChunkHits: [] },
			graphEvidence: { graphRevision: null, nodes: [], edges: [], callers: [], callees: [], dependencies: [], pagerank: null, qualification: 'NOT_VERIFIED' },
			nlpEvidence: { spans: [], classification: null, confidence: null, pos: null, status: 'NOT_RUN' },
			dependencies: [],
			blockers: [],
			scores: { lexical: null, symbol: null, graph: null, pagerank: null, explicitPriority: null, dependency: null, final: null },
			qualification: 'UNRESOLVED',
			enrichmentStatus: { lexical: 'PENDING', astGrep: 'NOT_RUN', astChunk: 'NOT_RUN', fencedCode: 'NOT_TRIGGERED', unsupportedLanguages: [], pos: 'NOT_TRIGGERED', graphify: 'NOT_RUN_SNAPSHOT_NOT_VERIFIED', langExtract: 'NOT_RUN_SPAN_CONTRACT_OPEN', pagerank: 'NOT_RUN', fusion: 'NOT_RUN' },
		};
		candidates.push(candidate);
		activeCandidate = candidate;
	}
	for (const candidate of candidates.filter((item) => item.source.file === relativePath)) {
		if (candidate.source.fencedCode.length && !candidate.enrichmentTriggers.includes('FENCED_CODE')) candidate.enrichmentTriggers.push('FENCED_CODE');
	}
}

candidates.sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line);
await enrichWithSidecar();
const lexicalIndex = collectLexicalHits([...new Set(candidates.flatMap((candidate) => candidate.normalized.identifiers))].sort());
for (const candidate of candidates) {
	candidate.codeEvidence.lexicalHits = candidate.normalized.identifiers.flatMap((term) =>
		(lexicalIndex.get(term) ?? []).map((hit) => ({ term, ...hit })),
	);
	candidate.enrichmentStatus.lexical = candidate.codeEvidence.lexicalHits.length ? 'EVIDENCE_FOUND_UNRANKED' : 'NO_CODE_HITS';
}
const sourceFiles = [];
for (const absolutePath of files) {
	const bytes = await readFile(absolutePath);
	sourceFiles.push({ file: path.relative(repoRoot, absolutePath).replaceAll('\\', '/'), sourceChecksum: `sha256:${sha256(bytes)}` });
}

const report = {
	schema: 'next-steps-master-audit.v1',
	status: 'READ_ONLY_SYNTHESIS_PARTIAL',
	canonicalAuthority: false,
	writesPerformed: { markdownSources: 0, databases: 0, caches: 0, graphProjections: 0 },
	inputs: sourceFiles,
	counts: { markdownFiles: files.length, uncheckedCandidates: candidates.length, conditionalTriggers: candidates.filter((item) => item.normalized.taskType === 'CONDITIONAL_TRIGGER').length, roadmapTriggers: candidates.filter((item) => item.normalized.taskType === 'ROADMAP_TRIGGER').length, tasksTriggeredPos: candidates.filter((item) => item.enrichmentTriggers.includes('POS')).length, tasksTriggeredAstReferencedFile: candidates.filter((item) => item.enrichmentTriggers.includes('AST_REFERENCED_FILE')).length, tasksWithFencedCode: candidates.filter((item) => item.enrichmentTriggers.includes('FENCED_CODE')).length, langExtractCandidates: candidates.filter((item) => item.enrichmentTriggers.includes('LANGEXTRACT_CANDIDATE')).length, unsupportedLanguages: candidates.reduce((total, item) => total + item.enrichmentStatus.unsupportedLanguages.length, 0), sidecarFiles: sidecarFiles.size, sidecarCalls, sidecarFailures, sidecarBytes, filesOutsideRootRejected, referencedFilesMissing, spanMismatchCount: 'NOT_RUN_TWO_CASE_DIAGNOSTIC_OPEN', canonicalWrites: 0, checkboxMutations: 0 },
	method: { inventory: 'deterministic_markdown_checkbox_scan_outside_fenced_code', normalization: 'whitespace_only', taskId: 'sha256(relative_path + line + normalized_checkbox_text + source_checksum)', triggers: 'typed independent triggers; no enrichment changes task identity or checkbox state', limits: { maxSidecarFiles, maxTotalSidecarBytes, maxPerSidecarInputBytes }, lexical: 'single exact-identifier search over bounded code roots', astChunk: 'FastAPI /ast/chunk only for verified referenced files or supported fenced snippets; structural observations are diagnostic-only', astGrep: 'NOT_RUN', pos: 'FastAPI /pos only for identifier/API/domain-token signal, not generic programming words', graphify: 'NOT_RUN_SNAPSHOT_NOT_VERIFIED', nlp: 'POS-only conditional sidecar calls', langExtract: 'NOT_RUN_SPAN_CONTRACT_OPEN', pagerank: 'NOT_RUN', fusion: 'NOT_RUN' },
	candidates,
	limitations: [
		'Unchecked boxes are preserved as source status; this report does not assert they are ready work items.',
		'No task is completed, prioritized, deduplicated, superseded, or created by enrichment.',
		'Exact-text lexical matches are diagnostic candidates only; they do not prove that a code owner implements the condition named by a checkbox.',
		'AST chunking and POS are conditional local-sidecar diagnostics; they do not alter task identity or status. LangExtract remains disabled until span mismatch diagnostics and the extraction contract are closed. Graphify, PageRank, and fusion are not invoked.',
		'Graph evidence remains NOT_VERIFIED because a current revision-qualified graph snapshot was not established.',
		'Chat-only design notes, including Mastra/OpenCode execution identity, were not promoted into tasks because source Markdown is authoritative and the requested inventory is docs/next_steps.',
	],
};

const markdown = [
	'# Next Steps Master (Generated Read-Only Synthesis)',
	'',
	'> Markdown source files remain authoritative. This generated view does not change checkbox state, create canonical tasks, or prove completion.',
	'',
	`- Source files: ${files.length}`,
	`- Unchecked candidates: ${candidates.length}`,
	`- Conditional triggers: ${report.counts.conditionalTriggers}`,
	`- Roadmap triggers: ${report.counts.roadmapTriggers}`,
	`- Diagnostic report: [next-steps-master-v1.json](reports/next-steps-master-v1.json)`,
	'- Graphify, AST-grep, NLP/LangExtract, PageRank, and fusion: not run; no current graph revision was admitted for this synthesis.',
	'',
	'## Candidates',
	'',
	...candidates.flatMap((candidate) => [
		`### ${candidate.normalized.taskType} — ${candidate.normalized.text}`,
		'',
		`- Source: [${candidate.source.file}:${candidate.source.line}](${candidate.source.file.replace(/^docs\//, '')}#L${candidate.source.line})`,
		`- Task ID: \`${candidate.taskId}\``,
		`- Source checksum: \`${candidate.source.sourceChecksum}\``,
		`- Qualification: **${candidate.qualification}**; exact-text matches are not owner proof, and this item is not ranked or completion-validated.`,
		`- Identifiers: ${candidate.normalized.identifiers.length ? candidate.normalized.identifiers.map((value) => `\`${value}\``).join(', ') : 'none extracted'}`,
		`- Lexical matches only: ${candidate.codeEvidence.lexicalHits.length ? candidate.codeEvidence.lexicalHits.slice(0, 4).map((hit) => `\`${hit.file}:${hit.line}\` — ${hit.text}`).join('; ') : 'none found in bounded code roots'}`,
		'',
	]),
	'## Read-Only Boundary',
	'',
	'- No source checkbox was edited. No task was marked complete or assigned priority.',
	'- Candidate identity is derived from source path, line, normalized checkbox text, and source checksum; a source edit intentionally changes the ID.',
	'- Continue with the report’s evidence and owner audit before enabling AST/Graphify/NLP enrichment.',
	'',
].join('\n');

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(masterPath, markdown, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, markdownFiles: files.length, uncheckedCandidates: candidates.length, reportPath: path.relative(repoRoot, reportPath), masterPath: path.relative(repoRoot, masterPath) })}\n`);
