import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runAfcRadixShadowV1, type AfcRadixShadowInputV1 } from '$lib/server/atlas/agentic-file-compiler/radix-shadow-v1.js';
import { HELPER_REGISTRY_V1 } from '$lib/server/atlas/agentic-file-compiler/helper-registry-v1.js';
import { assertKeywordVocabularyV1, KeywordVocabularyV1Schema } from '$lib/server/atlas/agentic-file-compiler/vocabulary-v1.js';
import { TAXONOMY_SOURCE_V1 } from '$lib/server/atlas/agentic-file-compiler/taxonomy-scope-v1.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'scripts/atlas/afc-radix-shadow-artifacts');
const VOCABULARY_PATH = path.join(ARTIFACT_ROOT, 'vocabulary.v1.json');
const APPROVAL_PATH = path.join(ARTIFACT_ROOT, 'approval-manifest.v1.json');
const CASES_PATH = path.join(ARTIFACT_ROOT, 'frozen-cases.v1.json');

export const afcRadixShadowInputSchema = z.object({
	taskId: z.string().min(1).max(128),
	caseIds: z.array(z.string().min(1).max(128)).min(1).max(16),
	expectedVocabularyChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const candidateSchema = z.object({
	term: z.string().min(1).max(128),
	normalized: z.string().min(1).max(128),
	source: z.enum(TAXONOMY_SOURCE_V1),
	evidenceRef: z.string().min(1).max(512),
	sourceRevision: z.string().min(1).max(256),
	confidence: z.number().finite().min(0).max(1),
}).strict();

const frozenCaseSchema = z.object({
	caseId: z.string().min(1).max(128),
	query: z.string().min(1).max(2048),
	prefixes: z.array(z.string().min(1).max(64)).max(16),
	baselineCandidates: z.array(candidateSchema).max(64),
	baselineHelperRefs: z.array(z.string().min(1).max(128)).max(64),
	workspaceRevision: z.string().min(1).max(256),
	taxonomyRevision: z.string().min(1).max(256),
	ontologyRevision: z.string().min(1).max(256),
}).strict();

const approvalManifestSchema = z.object({
	schema: z.literal('atlas.afc-radix-vocabulary-approval.v1'),
	status: z.literal('OWNER_REVIEWED'),
	ownerId: z.string().min(1).max(128),
	vocabularyRevision: z.string().min(1).max(256),
	vocabularyChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const frozenCasesSchema = z.object({
	schema: z.literal('atlas.afc-radix-frozen-cases.v1'),
	cases: z.array(frozenCaseSchema).max(256),
}).strict();

export interface AfcRadixShadowArtifactReader {
	readVocabulary(): string;
	readApprovalManifest(): string;
	readFrozenCases(): string;
}

export interface AfcRadixShadowToolOptions {
	reader?: AfcRadixShadowArtifactReader;
	trustedApprovalManifestSha256?: string | null;
}

const diskReader: AfcRadixShadowArtifactReader = {
	readVocabulary: () => fs.readFileSync(VOCABULARY_PATH, 'utf8'),
	readApprovalManifest: () => fs.readFileSync(APPROVAL_PATH, 'utf8'),
	readFrozenCases: () => fs.readFileSync(CASES_PATH, 'utf8'),
};

const TRUSTED_APPROVAL_MANIFEST_SHA256: string | null = null;
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
	return JSON.stringify(value) ?? 'null';
};

function sourceRevision() {
	const sourceFiles = [
		'sveltekit-frontend/src/mcp/afc-radix-shadow-tools.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/radix-shadow-v1.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/helper-registry-v1.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-classifier.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-expansion-v1.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/radix-index-v1.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/taxonomy-scope-v1.ts',
		'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/vocabulary-v1.ts',
	] as const;
	const files = sourceFiles.map((relativePath) => ({ path: relativePath, sha256: sha256(fs.readFileSync(path.join(REPO_ROOT, relativePath))) }));
	return { revision: sha256(stable(files)), files };
}

function blockedReceipt(input: z.infer<typeof afcRadixShadowInputSchema>, blockers: string[], source: ReturnType<typeof sourceRevision>) {
	const body = {
		schema: 'atlas.afc-radix-shadow-receipt.v1',
		status: blockers.includes('VOCABULARY_OWNER_APPROVAL_MISSING') ? 'BLOCKED_UNREVIEWED_VOCABULARY' : 'BLOCKED_ARTIFACTS',
		proofLevel: 'BLOCKED',
		taskId: input.taskId,
		caseIds: input.caseIds,
		expectedVocabularyChecksum: input.expectedVocabularyChecksum,
		sourceRevision: source.revision,
		casesEvaluated: 0,
		blockers: [...new Set(blockers)].sort(),
		shadowOnly: true,
		canonicalAuthority: false,
		writesPerformed: false,
		promotionEligible: false,
		sourceFiles: source.files,
	};
	return { ...body, checksum: sha256(stable(body)) };
}

export function registerAfcRadixShadowTools(server: McpServer, options: AfcRadixShadowToolOptions = {}): void {
	const reader = options.reader ?? diskReader;
	const trustedPin = options.trustedApprovalManifestSha256 === undefined
		? TRUSTED_APPROVAL_MANIFEST_SHA256
		: options.trustedApprovalManifestSha256;
	const registerTool = server.registerTool.bind(server) as unknown as (
		name: string,
		config: { description: string; inputSchema: typeof afcRadixShadowInputSchema },
		handler: (input: unknown) => Promise<unknown>,
	) => unknown;
	registerTool('atlas.afc_radix_shadow', {
		description: 'Compare server-resolved frozen AFC radix cases in read-only shadow mode. Inputs are identifiers only; no caller-supplied artifacts or approval decisions are accepted.',
		inputSchema: afcRadixShadowInputSchema,
	}, async (rawInput: unknown) => {
		let input: z.infer<typeof afcRadixShadowInputSchema>;
		try {
			input = afcRadixShadowInputSchema.parse(rawInput);
		} catch {
			const result = { schema: 'atlas.afc-radix-shadow-receipt.v1', status: 'INPUT_REJECTED', proofLevel: 'BLOCKED', shadowOnly: true, canonicalAuthority: false, writesPerformed: false, promotionEligible: false, casesEvaluated: 0, blockers: ['INPUT_SCHEMA_REJECTED'] };
			return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }], isError: true };
		}

		const source = sourceRevision();
		const blockers: string[] = [];
		let vocabularyText: string;
		let approvalText: string;
		let casesText: string;
		try {
			vocabularyText = reader.readVocabulary();
			approvalText = reader.readApprovalManifest();
			casesText = reader.readFrozenCases();
		} catch {
			blockers.push('TRUSTED_ARTIFACT_UNAVAILABLE');
			if (!trustedPin) blockers.push('VOCABULARY_OWNER_APPROVAL_MISSING');
			const result = blockedReceipt(input, blockers, source);
			return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
		}

		try {
			const vocabulary = assertKeywordVocabularyV1(KeywordVocabularyV1Schema.parse(JSON.parse(vocabularyText)));
			if (vocabulary.checksum !== input.expectedVocabularyChecksum) blockers.push('VOCABULARY_CHECKSUM_MISMATCH');
			if (!trustedPin) blockers.push('VOCABULARY_OWNER_APPROVAL_MISSING');
			if (sha256(approvalText) !== trustedPin) blockers.push('APPROVAL_MANIFEST_NOT_PINNED');
			const approval = approvalManifestSchema.parse(JSON.parse(approvalText));
			if (approval.vocabularyChecksum !== vocabulary.checksum || approval.vocabularyRevision !== vocabulary.revision) blockers.push('APPROVAL_VOCABULARY_BINDING_MISMATCH');
			const casesBundle = frozenCasesSchema.parse(JSON.parse(casesText));
			const caseById = new Map(casesBundle.cases.map((item) => [item.caseId, item]));
			const selectedCases = input.caseIds.map((caseId) => {
				const item = caseById.get(caseId);
				if (!item) blockers.push(`FROZEN_CASE_NOT_FOUND:${sha256(caseId).slice(0, 12)}`);
				return item;
			});
			const knownHelpers = new Set(HELPER_REGISTRY_V1.entries.map(({ helperId }) => helperId));
			for (const item of selectedCases) {
				if (!item) continue;
				if (item.baselineHelperRefs.some((helper) => !knownHelpers.has(helper))) blockers.push('UNKNOWN_BASELINE_HELPER');
				if (item.baselineCandidates.some((candidate) => candidate.source === 'KEYWORD_RADIX')) blockers.push('FROZEN_BASELINE_CONTAINS_RADIX');
			}
			if (blockers.length > 0) {
				const result = blockedReceipt(input, blockers, source);
				return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
			}

			const runId = sha256(stable({ taskId: input.taskId, caseIds: input.caseIds, vocabularyChecksum: vocabulary.checksum, sourceRevision: source.revision })).slice(0, 32);
			const comparison = runAfcRadixShadowV1({
				schema: 'atlas.afc-radix-shadow-input.v1',
				taskId: input.taskId,
				runId,
				contractRevision: 'atlas.afc-radix-shadow.v1',
				cases: selectedCases as unknown as AfcRadixShadowInputV1['cases'],
			}, vocabulary, source.revision);
			const { checksum: _comparisonChecksum, ...comparisonBody } = comparison;
			const resultBody = {
				...comparisonBody,
				status: 'SHADOW_COMPARISON_COMPLETE',
				proofLevel: 'WIRED',
				casesEvaluated: comparison.cases.length,
				shadowOnly: true,
				canonicalAuthority: false,
				writesPerformed: false,
				promotionEligible: false,
				sourceFiles: source.files,
			};
			const result = { ...resultBody, checksum: sha256(stable(resultBody)) };
			return { structuredContent: result as unknown as Record<string, unknown>, content: [{ type: 'text', text: JSON.stringify(result) }] };
		} catch {
			const result = blockedReceipt(input, ['TRUSTED_ARTIFACT_INVALID'], source);
			return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
		}
	});
}
