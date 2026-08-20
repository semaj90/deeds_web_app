import { createRequire } from 'node:module';
import {
	TreeSitterStructuredValueAdapter,
	type AtlasStructuredValueV1,
	type NativeStructuralIdentityV1,
	type SyntaxNodeLike,
} from '@deeds/parent-atlas';

const require = createRequire(import.meta.url);

export type NodeTreeSitterLanguage = 'typescript' | 'tsx' | 'javascript' | 'jsx';

export type NodeTreeSitterRuntimeProbeV1 = {
	schema: 'atlas.node-tree-sitter-runtime-probe.v1';
	available: boolean;
	parser_package: 'tree-sitter';
	parser_revision: string | null;
	grammar_package: 'tree-sitter-typescript' | 'tree-sitter-javascript' | null;
	grammar_revision: string | null;
	diagnostics: string[];
	canonical_authority: false;
};

type LoadedRuntime = {
	Parser: new () => {
		setLanguage(language: unknown): void;
		parse(source: string, oldTree?: unknown): { rootNode: SyntaxNodeLike & { namedDescendantForIndex(start: number, end?: number): SyntaxNodeLike } };
	};
	grammar: unknown;
	parser_revision: string;
	grammar_revision: string;
	grammar_package: 'tree-sitter-typescript' | 'tree-sitter-javascript';
};

function packageVersion(packageName: string): string {
	const pkg = require(`${packageName}/package.json`) as { version?: string };
	if (!pkg.version) throw new Error(`PACKAGE_VERSION_MISSING:${packageName}`);
	return pkg.version;
}

function loadRuntime(language: NodeTreeSitterLanguage): LoadedRuntime {
	const ParserModule = require('tree-sitter') as { default?: LoadedRuntime['Parser'] } | LoadedRuntime['Parser'];
	const Parser = ('default' in ParserModule ? ParserModule.default : ParserModule) as LoadedRuntime['Parser'];
	if (!Parser) throw new Error('TREE_SITTER_PARSER_EXPORT_MISSING');

	if (language === 'typescript' || language === 'tsx') {
		const grammarModule = require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
		return {
			Parser,
			grammar: language === 'tsx' ? grammarModule.tsx : grammarModule.typescript,
			parser_revision: packageVersion('tree-sitter'),
			grammar_revision: packageVersion('tree-sitter-typescript'),
			grammar_package: 'tree-sitter-typescript',
		};
	}
	const grammar = require('tree-sitter-javascript') as unknown;
	return {
		Parser,
		grammar,
		parser_revision: packageVersion('tree-sitter'),
		grammar_revision: packageVersion('tree-sitter-javascript'),
		grammar_package: 'tree-sitter-javascript',
	};
}

export function probeNodeTreeSitterRuntime(language: NodeTreeSitterLanguage = 'typescript'): NodeTreeSitterRuntimeProbeV1 {
	try {
		const runtime = loadRuntime(language);
		return {
			schema: 'atlas.node-tree-sitter-runtime-probe.v1',
			available: true,
			parser_package: 'tree-sitter',
			parser_revision: runtime.parser_revision,
			grammar_package: runtime.grammar_package,
			grammar_revision: runtime.grammar_revision,
			diagnostics: [],
			canonical_authority: false,
		};
	} catch (error) {
		return {
			schema: 'atlas.node-tree-sitter-runtime-probe.v1',
			available: false,
			parser_package: 'tree-sitter',
			parser_revision: null,
			grammar_package: null,
			grammar_revision: null,
			diagnostics: [`NODE_TREE_SITTER_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`],
			canonical_authority: false,
		};
	}
}

export function parseStructuredValueAtByteRange(input: {
	source_text: string;
	source_ref: string;
	source_revision: string;
	workspace_revision: string;
	language: NodeTreeSitterLanguage;
	start_byte: number;
	end_byte: number;
	resolve_native_identity?: (node: SyntaxNodeLike) => NativeStructuralIdentityV1 | null | undefined;
}): { value: AtlasStructuredValueV1; parser_revision: string; grammar_revision: string } {
	const runtime = loadRuntime(input.language);
	const parser = new runtime.Parser();
	parser.setLanguage(runtime.grammar);
	const tree = parser.parse(input.source_text);
	const node = tree.rootNode.namedDescendantForIndex(input.start_byte, input.end_byte);
	if (!node || node.startIndex !== input.start_byte || node.endIndex !== input.end_byte) {
		throw new Error(`NODE_TREE_SITTER_EXACT_RANGE_NOT_FOUND:${input.source_ref}:${input.start_byte}:${input.end_byte}`);
	}
	const adapter = new TreeSitterStructuredValueAdapter({
		source_ref: input.source_ref,
		source_revision: input.source_revision,
		workspace_revision: input.workspace_revision,
		language: input.language,
		parser_revision: runtime.parser_revision,
		grammar_revision: runtime.grammar_revision,
		resolve_native_identity: input.resolve_native_identity,
	});
	return {
		value: adapter.adapt(node, input.source_text),
		parser_revision: runtime.parser_revision,
		grammar_revision: runtime.grammar_revision,
	};
}

export function describeNodeTreeSitterStructuredValueRuntime(): string {
	return [
		'The runtime uses the official Node tree-sitter binding plus the official TypeScript/TSX or JavaScript grammar when those packages are installed and locked.',
		'Runtime absence is reported as a capability probe failure; no regex or guessed AST is substituted under the Tree-sitter name.',
		'Extraction is exact-byte-range only and feeds the provenance-preserving Parent Atlas TreeSitterStructuredValueAdapter.',
	].join(' ');
}
