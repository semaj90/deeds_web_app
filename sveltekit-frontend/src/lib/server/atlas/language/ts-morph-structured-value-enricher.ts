import { createHash } from 'node:crypto';
import {
	Node,
	Project,
	SyntaxKind,
	type SourceFile,
	type Node as MorphNode,
	type Symbol as MorphSymbol,
} from 'ts-morph';
import {
	tsMorphSemanticEnrichmentSchema,
	type TsMorphSemanticEnrichmentV1,
	type TreeSitterAstProvenanceV1,
} from '@deeds/parent-atlas';

export type TsMorphStructuredValueEnricherOptions = {
	project: Project;
	project_revision: string;
	ts_morph_revision: string;
	typescript_revision: string;
	tsconfig_ref?: string | null;
};

function sha256(value: string | Buffer): string {
	return createHash('sha256').update(value).digest('hex');
}

/** Convert a Tree-sitter UTF-8 byte offset into the UTF-16 code-unit offset used by JS/TypeScript. */
export function utf8ByteOffsetToUtf16Offset(sourceText: string, byteOffset: number): number {
	if (!Number.isInteger(byteOffset) || byteOffset < 0) throw new Error('BYTE_OFFSET_INVALID');
	const bytes = Buffer.from(sourceText, 'utf8');
	if (byteOffset > bytes.length) throw new Error('BYTE_OFFSET_OUT_OF_RANGE');
	const prefix = bytes.subarray(0, byteOffset);
	const decoded = prefix.toString('utf8');
	if (!Buffer.from(decoded, 'utf8').equals(prefix)) throw new Error('BYTE_OFFSET_SPLITS_UTF8_SEQUENCE');
	return decoded.length;
}

/** Convert a JS/TypeScript UTF-16 code-unit offset back into a Tree-sitter UTF-8 byte offset. */
export function utf16OffsetToUtf8ByteOffset(sourceText: string, utf16Offset: number): number {
	if (!Number.isInteger(utf16Offset) || utf16Offset < 0 || utf16Offset > sourceText.length) {
		throw new Error('UTF16_OFFSET_INVALID');
	}
	const prefix = sourceText.slice(0, utf16Offset);
	// Reject a position that splits a surrogate pair; it cannot correspond to a valid UTF-8 source boundary.
	const last = prefix.charCodeAt(prefix.length - 1);
	const next = sourceText.charCodeAt(utf16Offset);
	if (Number.isFinite(last) && last >= 0xd800 && last <= 0xdbff && Number.isFinite(next) && next >= 0xdc00 && next <= 0xdfff) {
		throw new Error('UTF16_OFFSET_SPLITS_SURROGATE_PAIR');
	}
	return Buffer.byteLength(prefix, 'utf8');
}

function sourceSpanChecksum(sourceText: string, startByte: number, endByte: number): string {
	return sha256(Buffer.from(sourceText, 'utf8').subarray(startByte, endByte));
}

function normalizePath(value: string): string {
	return value.replace(/\\/g, '/');
}

function pathMatches(sourceFile: SourceFile, sourceRef: string): boolean {
	const sourcePath = normalizePath(sourceFile.getFilePath());
	const target = normalizePath(sourceRef);
	return sourcePath === target || sourcePath.endsWith(`/${target.replace(/^\/+/, '')}`);
}

function findSourceFile(project: Project, sourceRef: string): SourceFile | undefined {
	return project.getSourceFiles().find((sourceFile) => pathMatches(sourceFile, sourceRef));
}

/** Find the exact TypeScript AST node occupying the converted Tree-sitter byte span. */
export function findExactTsMorphNode(input: {
	sourceFile: SourceFile;
	sourceText: string;
	start_byte: number;
	end_byte: number;
}): MorphNode | null {
	const start = utf8ByteOffsetToUtf16Offset(input.sourceText, input.start_byte);
	const end = utf8ByteOffsetToUtf16Offset(input.sourceText, input.end_byte);
	let exact: MorphNode | null = null;

	const consider = (node: MorphNode): void => {
		if (node.getStart(false) !== start || node.getEnd() !== end) return;
		if (exact === null || node.getWidth() < exact.getWidth()) exact = node;
	};
	consider(input.sourceFile);
	input.sourceFile.forEachDescendant((node) => consider(node));
	return exact;
}

function declarationRef(node: MorphNode): { source_ref: string; start_byte: number; end_byte: number; kind: string; name: string | null } {
	const sourceFile = node.getSourceFile();
	const sourceText = sourceFile.getFullText();
	const name = typeof (node as { getName?: () => string | undefined }).getName === 'function'
		? (node as { getName: () => string | undefined }).getName() ?? null
		: null;
	return {
		source_ref: normalizePath(sourceFile.getFilePath()),
		start_byte: utf16OffsetToUtf8ByteOffset(sourceText, node.getStart(false)),
		end_byte: utf16OffsetToUtf8ByteOffset(sourceText, node.getEnd()),
		kind: node.getKindName(),
		name,
	};
}

function symbolDeclarationRefs(symbol: MorphSymbol | undefined): ReturnType<typeof declarationRef>[] {
	if (!symbol) return [];
	return symbol.getDeclarations().map(declarationRef);
}

function nodeReferenceRefs(node: MorphNode): ReturnType<typeof declarationRef>[] {
	let identifier: MorphNode | undefined;
	if (Node.isIdentifier(node)) identifier = node;
	else {
		const candidate = (node as { getNameNode?: () => MorphNode | undefined }).getNameNode?.();
		if (candidate && Node.isIdentifier(candidate)) identifier = candidate;
	}
	if (!identifier || !Node.isIdentifier(identifier)) return [];
	try {
		return identifier.findReferencesAsNodes().map(declarationRef);
	} catch {
		return [];
	}
}

function parameterOptional(declaration: MorphNode | undefined): boolean {
	if (!declaration) return false;
	const candidate = declaration as { isOptional?: () => boolean; hasQuestionToken?: () => boolean; getInitializer?: () => MorphNode | undefined };
	return candidate.isOptional?.() ?? candidate.hasQuestionToken?.() ?? Boolean(candidate.getInitializer?.());
}

function parameterRest(declaration: MorphNode | undefined): boolean {
	if (!declaration) return false;
	const candidate = declaration as { isRestParameter?: () => boolean; getDotDotDotToken?: () => MorphNode | undefined };
	return candidate.isRestParameter?.() ?? Boolean(candidate.getDotDotDotToken?.());
}

function resolvedSignature(node: MorphNode, project: Project): TsMorphSemanticEnrichmentV1['resolved_signature'] {
	if (!Node.isCallExpression(node) && !Node.isNewExpression(node)) return null;
	const signature = project.getTypeChecker().getResolvedSignature(node);
	if (!signature) return null;
	return {
		parameters: signature.getParameters().map((parameter, ordinal) => {
			const declarations = parameter.getDeclarations();
			const first = declarations[0];
			const typeText = first ? parameter.getTypeAtLocation(first).getText(first) : parameter.getDeclaredType().getText();
			return {
				ordinal,
				name: parameter.getName(),
				type_text: typeText,
				optional: parameterOptional(first),
				rest: parameterRest(first),
				declaration_refs: declarations.map(declarationRef),
			};
		}),
		return_type_text: signature.getReturnType().getText(node),
		type_parameter_texts: signature.getTypeParameters().map((parameter) => parameter.getText()),
		declaration_refs: signature.getDeclaration() ? [declarationRef(signature.getDeclaration()!)] : [],
	};
}

export class TsMorphStructuredValueEnricher {
	readonly options: TsMorphStructuredValueEnricherOptions;

	constructor(options: TsMorphStructuredValueEnricherOptions) {
		this.options = options;
	}

	enrich(input: {
		provenance: TreeSitterAstProvenanceV1;
		source_text: string;
	}): TsMorphSemanticEnrichmentV1 | null {
		const provenance = input.provenance;
		if (!['typescript', 'tsx', 'javascript', 'jsx', 'typescriptreact', 'javascriptreact'].includes(provenance.language.toLowerCase())) {
			return null;
		}
		const sourceFile = findSourceFile(this.options.project, provenance.source_ref);
		if (!sourceFile) return null;
		const currentText = sourceFile.getFullText();
		if (currentText !== input.source_text) return null;
		if (sourceSpanChecksum(currentText, provenance.start_byte, provenance.end_byte) !== provenance.source_span_checksum) return null;

		const node = findExactTsMorphNode({
			sourceFile,
			sourceText: currentText,
			start_byte: provenance.start_byte,
			end_byte: provenance.end_byte,
		});
		if (!node) return null;

		const type = node.getType();
		const symbol = node.getSymbol() ?? type.getSymbol();
		return tsMorphSemanticEnrichmentSchema.parse({
			enrichment_id: `ts-morph:${sha256(JSON.stringify({
				source_ref: provenance.source_ref,
				source_revision: provenance.source_revision,
				start_byte: provenance.start_byte,
				end_byte: provenance.end_byte,
				project_revision: this.options.project_revision,
			})).slice(0, 48)}`,
			source_ref: provenance.source_ref,
			source_revision: provenance.source_revision,
			workspace_revision: provenance.workspace_revision,
			start_byte: provenance.start_byte,
			end_byte: provenance.end_byte,
			source_span_checksum: provenance.source_span_checksum,
			tree_node_id: provenance.tree_node_id,
			node_kind: node.getKindName(),
			ts_morph_revision: this.options.ts_morph_revision,
			typescript_revision: this.options.typescript_revision,
			project_revision: this.options.project_revision,
			tsconfig_ref: this.options.tsconfig_ref ?? null,
			inferred_type_text: type.getText(node),
			apparent_type_text: type.getApparentType().getText(node),
			symbol_name: symbol?.getName() ?? null,
			declaration_refs: symbolDeclarationRefs(symbol),
			reference_refs: nodeReferenceRefs(node),
			resolved_signature: resolvedSignature(node, this.options.project),
			exact_span_match: true,
			canonical_authority: false,
		});
	}
}

export function buildTsMorphProject(input: {
	tsconfig_path: string;
	skip_adding_files_from_ts_config?: boolean;
}): Project {
	return new Project({
		tsConfigFilePath: input.tsconfig_path,
		skipAddingFilesFromTsConfig: input.skip_adding_files_from_ts_config ?? false,
	});
}

export function describeTsMorphStructuredValueEnricher(): string {
	return [
		'ts-morph is a TypeScript-only semantic overlay for exact Tree-sitter spans; it never changes source/span identity.',
		'Tree-sitter UTF-8 byte offsets are converted to TypeScript UTF-16 text positions before matching, including non-ASCII source.',
		'Types, apparent types, symbols, declarations, references and resolved call signatures are emitted as noncanonical evidence.',
		'The long-lived TypeScript Language Service/tsserver remains useful for editor/open-buffer diagnostics, rename and incremental snapshots, but batch Parent Atlas enrichment can reuse the existing ts-morph Project.',
	].join(' ');
}
