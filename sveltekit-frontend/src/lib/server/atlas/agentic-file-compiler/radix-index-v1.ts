import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import { normalizeKeywordTermV1 } from './keyword-recognition-v1.js';
import type { QueryExpansionTermV1 } from './query-expansion-v1.js';
import { assertKeywordVocabularyV1, type KeywordVocabularySourceV1 } from './vocabulary-v1.js';

export const KEYWORD_RADIX_INDEX_V1_SCHEMA = 'atlas.keyword-radix-index.v1' as const;
export const KEYWORD_RADIX_LOOKUP_V1_SCHEMA = 'atlas.keyword-radix-lookup.v1' as const;
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

const RadixChildV1Schema = z.object({ edge: z.string().min(1), nodeId: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
const RadixNodeV1Schema = z.object({
	nodeId: z.union([z.literal('root'), z.string().regex(/^[a-f0-9]{24}$/)]),
	prefix: z.string(),
	edge: z.string(),
	allowedExpansions: z.array(z.string()),
	children: z.array(RadixChildV1Schema),
}).strict();

export const KeywordRadixIndexV1Schema = z.object({
	schema: z.literal(KEYWORD_RADIX_INDEX_V1_SCHEMA),
	vocabularyRevision: z.string().min(1),
	vocabularyChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	normalizationRevision: z.string().min(1),
	rootNodeId: z.literal('root'),
	nodes: z.array(RadixNodeV1Schema).min(1),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
	canonicalAuthority: z.literal(false),
}).strict();
export type KeywordRadixIndexV1 = z.infer<typeof KeywordRadixIndexV1Schema>;

export const KeywordRadixLookupV1Schema = z.object({
	schema: z.literal(KEYWORD_RADIX_LOOKUP_V1_SCHEMA),
	indexChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	vocabularyRevision: z.string().min(1),
	normalizedPrefix: z.string().min(1),
	status: z.enum(['MATCH', 'MISS', 'TOO_SHORT']),
	expansions: z.array(z.object({
		term: z.string().min(1),
		domainRefs: z.array(z.string()),
		helperRefs: z.array(z.string()),
	} ).strict()),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();
export type KeywordRadixLookupV1 = z.infer<typeof KeywordRadixLookupV1Schema>;

interface MutableRadixNode {
	prefix: string;
	allowedExpansions: string[];
	children: Map<string, MutableRadixNode>;
}

function createNode(prefix: string): MutableRadixNode {
	return { prefix, allowedExpansions: [], children: new Map() };
}

function nodeId(vocabularyChecksum: string, prefix: string): string {
	return sha256Stable({ vocabularyChecksum, prefix }).slice(0, 24);
}

export function compileKeywordRadixIndexV1(vocabularyInput: KeywordVocabularySourceV1): KeywordRadixIndexV1 {
	const vocabulary = assertKeywordVocabularyV1(vocabularyInput);
	const root = createNode('');
	for (const rule of vocabulary.prefixRules) {
		let current = root;
		let prefix = '';
		for (const char of rule.prefix) {
			prefix += char;
			let child = current.children.get(char);
			if (!child) {
				child = createNode(prefix);
				current.children.set(char, child);
			}
			current = child;
		}
		current.allowedExpansions = [...rule.allowedExpansions];
	}

	const nodes: Array<z.infer<typeof RadixNodeV1Schema>> = [];
	const emit = (current: MutableRadixNode, rootNode = false): string => {
		const id = rootNode ? 'root' : nodeId(vocabulary.checksum, current.prefix);
		const children = [...current.children.entries()].sort(([a], [b]) => compare(a, b)).map(([firstChar, child]) => {
			let edge = firstChar;
			let terminal = child;
			while (terminal.allowedExpansions.length === 0 && terminal.children.size === 1) {
				const [nextChar, nextNode] = [...terminal.children.entries()][0]!;
				edge += nextChar;
				terminal = nextNode;
			}
			const childId = emit(terminal);
			return { edge, nodeId: childId };
		});
		const compressedPrefix = rootNode ? '' : current.prefix;
		nodes.push({
			nodeId: id,
			prefix: compressedPrefix,
			edge: '',
			allowedExpansions: [...current.allowedExpansions].sort(),
			children,
		});
		return id;
	};
	const rootNodeId = emit(root, true);
	// Node prefixes are absolute keys. Edges are attached below from the
	// parent's absolute prefix after compression, then canonically serialized.
	const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
	for (const parent of nodes) {
		for (const child of parent.children) {
			const node = nodesById.get(child.nodeId)!;
			node.edge = child.edge;
		}
	}
	const body = {
		schema: KEYWORD_RADIX_INDEX_V1_SCHEMA,
		vocabularyRevision: vocabulary.revision,
		vocabularyChecksum: vocabulary.checksum,
		normalizationRevision: vocabulary.normalizationRevision,
		rootNodeId,
		nodes: nodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
		canonicalAuthority: false as const,
	};
	return KeywordRadixIndexV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertKeywordRadixIndexV1(value: KeywordRadixIndexV1): KeywordRadixIndexV1 {
	const index = KeywordRadixIndexV1Schema.parse(value);
	const { checksum, ...body } = index;
	if (sha256Stable(body) !== checksum) throw new Error('KEYWORD_RADIX_INDEX_CHECKSUM_MISMATCH');
	const nodes = new Map(index.nodes.map((node) => [node.nodeId, node]));
	if (nodes.size !== index.nodes.length || !nodes.has(index.rootNodeId)) throw new Error('KEYWORD_RADIX_NODE_ID_INVALID');
	for (const parent of index.nodes) {
		const branchKeys = new Set<string>();
		for (const child of parent.children) {
			const target = nodes.get(child.nodeId);
			const firstCodePoint = [...child.edge][0]!;
			if (!target || branchKeys.has(firstCodePoint)) throw new Error('KEYWORD_RADIX_CHILD_INVALID');
			branchKeys.add(firstCodePoint);
			if (target.prefix !== parent.prefix + child.edge || target.edge !== child.edge) throw new Error('KEYWORD_RADIX_PATH_INVALID');
		}
	}
	return index;
}

function finishLookup(index: KeywordRadixIndexV1, prefix: string, status: 'MATCH' | 'MISS' | 'TOO_SHORT', expansions: KeywordRadixLookupV1['expansions']): KeywordRadixLookupV1 {
	const body = {
		schema: KEYWORD_RADIX_LOOKUP_V1_SCHEMA,
		indexChecksum: index.checksum,
		vocabularyRevision: index.vocabularyRevision,
		normalizedPrefix: prefix,
		status,
		expansions,
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	return KeywordRadixLookupV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function lookupControlledPrefixV1(indexInput: KeywordRadixIndexV1, vocabularyInput: KeywordVocabularySourceV1, rawPrefix: string): KeywordRadixLookupV1 {
	const index = assertKeywordRadixIndexV1(indexInput);
	const vocabulary = assertKeywordVocabularyV1(vocabularyInput);
	if (vocabulary.checksum !== index.vocabularyChecksum || vocabulary.revision !== index.vocabularyRevision) throw new Error('KEYWORD_RADIX_VOCABULARY_MISMATCH');
	const prefix = normalizeKeywordTermV1(rawPrefix);
	if (![...prefix].every((char) => /^[\p{L}\p{N}_]$/u.test(char))) return finishLookup(index, prefix, 'MISS', []);
	if ([...prefix].length < 2) return finishLookup(index, prefix, 'TOO_SHORT', []);
	const nodes = new Map(index.nodes.map((node) => [node.nodeId, node]));
	let current = nodes.get(index.rootNodeId)!;
	let remaining = prefix;
	while (remaining.length > 0) {
		const childRef = current.children.find((child) => remaining.startsWith(child.edge));
		if (!childRef) return finishLookup(index, prefix, 'MISS', []);
		remaining = remaining.slice(childRef.edge.length);
		current = nodes.get(childRef.nodeId)!;
	}
	const entryByTerm = new Map(vocabulary.entries.map((entry) => [entry.term, entry]));
	const expansions = current.allowedExpansions.map((term) => {
		const entry = entryByTerm.get(term);
		if (!entry || !term.startsWith(prefix)) throw new Error(`RADIX_EXPANSION_INVALID:${prefix}:${term}`);
		return { term, domainRefs: [...entry.domainRefs], helperRefs: [...entry.helperRefs] };
	});
	return finishLookup(index, prefix, expansions.length ? 'MATCH' : 'MISS', expansions);
}

export function assertKeywordRadixLookupV1(value: KeywordRadixLookupV1): KeywordRadixLookupV1 {
	const lookup = KeywordRadixLookupV1Schema.parse(value);
	const { checksum, ...body } = lookup;
	if (sha256Stable(body) !== checksum) throw new Error('KEYWORD_RADIX_LOOKUP_CHECKSUM_MISMATCH');
	return lookup;
}

/** Converts only explicit prefix hits into the existing query-expansion input contract. */
export function keywordRadixLookupToExpansionTermsV1(value: KeywordRadixLookupV1): QueryExpansionTermV1[] {
	const lookup = assertKeywordRadixLookupV1(value);
	if (lookup.status !== 'MATCH') return [];
	return lookup.expansions.map((expansion) => ({
		term: expansion.term,
		normalized: expansion.term,
		source: 'KEYWORD_RADIX',
		evidenceRef: `keyword-radix-lookup:${lookup.checksum}`,
		sourceRevision: lookup.vocabularyRevision,
		confidence: 1,
	}));
}
