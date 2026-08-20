import { z } from 'zod';
import { Node, Project, SyntaxKind, type Identifier, type SourceFile } from 'ts-morph';
import {
  AstGrepStructuralCandidateV1Schema,
  type AstGrepStructuralCandidateV1,
} from './ast-grep-structural-topk.js';
import {
  LanguageSemanticEvidenceV1Schema,
  normalizedReferenceBreadth,
  type LanguageSemanticEvidenceV1,
} from './language-intelligence-plan.js';

/**
 * Compiler-semantic enrichment over an already-selected structural candidate.
 *
 * The structural candidate remains owned by Tree-sitter/ast-grep coordinates.
 * ts-morph may attach compiler evidence, but may not fabricate treeNodeId,
 * symbolVersionId, canonicalId, or authorize a mutation.
 */

export const TsMorphSemanticEnrichmentInputV1Schema = z.object({
  schema: z.literal('atlas.ts-morph-semantic-enrichment-input.v1'),
  candidate: AstGrepStructuralCandidateV1Schema,
  code: z.string(),
  filePath: z.string().min(1),
  tsConfigFilePath: z.string().min(1).nullable(),
  semanticEngineRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type TsMorphSemanticEnrichmentInputV1 = z.infer<typeof TsMorphSemanticEnrichmentInputV1Schema>;

export const TsMorphDefinitionEvidenceV1Schema = z.object({
  filePath: z.string().min(1),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
  kind: z.string().min(1),
  name: z.string().min(1).nullable(),
}).strict();
export type TsMorphDefinitionEvidenceV1 = z.infer<typeof TsMorphDefinitionEvidenceV1Schema>;

export const TsMorphReferenceEvidenceV1Schema = z.object({
  filePath: z.string().min(1),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
  parentKind: z.string().min(1),
}).strict();
export type TsMorphReferenceEvidenceV1 = z.infer<typeof TsMorphReferenceEvidenceV1Schema>;

export const TsMorphSemanticEnrichmentResultV1Schema = z.object({
  schema: z.literal('atlas.ts-morph-semantic-enrichment-result.v1'),
  candidate: AstGrepStructuralCandidateV1Schema,
  matchedIdentifier: z.object({
    text: z.string().min(1),
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().nonnegative(),
  }).strict(),
  typeText: z.string().min(1),
  returnTypeText: z.string().min(1).nullable(),
  definitions: z.array(TsMorphDefinitionEvidenceV1Schema),
  references: z.array(TsMorphReferenceEvidenceV1Schema),
  implementationCount: z.number().int().nonnegative(),
  referenceCount: z.number().int().nonnegative(),
  referenceBreadth: z.number().min(0).max(1),
  semanticEvidence: LanguageSemanticEvidenceV1Schema,
  sourceCoordinateMatchedByByteToUtf16Projection: z.literal(true),
  treeNodeIdentityInheritedOnly: z.literal(true),
  semanticEnrichmentMayNotReorderMembers: z.literal(true),
  mutationProposalOnly: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type TsMorphSemanticEnrichmentResultV1 = z.infer<typeof TsMorphSemanticEnrichmentResultV1Schema>;

function byteOffsetToUtf16Index(text: string, byteOffset: number): number {
  if (!Number.isInteger(byteOffset) || byteOffset < 0) throw new Error('byteOffset must be a non-negative integer');
  const bytes = Buffer.from(text, 'utf8');
  if (byteOffset > bytes.length) throw new Error('byteOffset exceeds UTF-8 source length');
  return bytes.subarray(0, byteOffset).toString('utf8').length;
}

function createProject(input: TsMorphSemanticEnrichmentInputV1): { project: Project; sourceFile: SourceFile } {
  const project = input.tsConfigFilePath
    ? new Project({ tsConfigFilePath: input.tsConfigFilePath })
    : new Project({ compilerOptions: { allowJs: true, checkJs: true } });

  let sourceFile = project.getSourceFile(input.filePath);
  if (sourceFile) {
    if (sourceFile.getFullText() !== input.code) sourceFile.replaceWithText(input.code);
  } else {
    sourceFile = project.createSourceFile(input.filePath, input.code, { overwrite: true });
  }
  return { project, sourceFile };
}

function candidateCharRange(candidate: AstGrepStructuralCandidateV1, code: string): { start: number; end: number } {
  return {
    start: byteOffsetToUtf16Index(code, candidate.startByte),
    end: byteOffsetToUtf16Index(code, candidate.endByte),
  };
}

function findCandidateIdentifier(sourceFile: SourceFile, candidate: AstGrepStructuralCandidateV1, code: string): Identifier {
  const range = candidateCharRange(candidate, code);
  const exact = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === candidate.name)
    .filter((identifier) => identifier.getStart() >= range.start && identifier.getEnd() <= range.end)
    .sort((a, b) => a.getStart() - b.getStart())[0];
  if (exact) return exact;

  const nearby = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === candidate.name)
    .sort((a, b) => {
      const da = Math.abs(a.getStart() - range.start);
      const db = Math.abs(b.getStart() - range.start);
      return da - db || a.getStart() - b.getStart();
    })[0];
  if (!nearby) throw new Error(`TS_MORPH_IDENTIFIER_NOT_FOUND:${candidate.name}`);
  return nearby;
}

function nameForNode(node: Node): string | null {
  if (Node.isIdentifier(node)) return node.getText();
  const maybeNamed = node as Node & { getName?: () => string | undefined };
  return maybeNamed.getName?.() ?? null;
}

function returnTypeText(identifier: Identifier): string | null {
  const ancestor = identifier.getFirstAncestor((node) =>
    Node.isFunctionDeclaration(node)
    || Node.isMethodDeclaration(node)
    || Node.isArrowFunction(node)
    || Node.isFunctionExpression(node));
  if (!ancestor) return null;
  if (Node.isFunctionDeclaration(ancestor)
    || Node.isMethodDeclaration(ancestor)
    || Node.isArrowFunction(ancestor)
    || Node.isFunctionExpression(ancestor)) {
    return ancestor.getReturnType().getText(ancestor);
  }
  return null;
}

function definitionEvidence(identifier: Identifier): TsMorphDefinitionEvidenceV1[] {
  return identifier.getDefinitionNodes()
    .map((node) => TsMorphDefinitionEvidenceV1Schema.parse({
      filePath: node.getSourceFile().getFilePath(),
      startChar: node.getStart(),
      endChar: node.getEnd(),
      kind: node.getKindName(),
      name: nameForNode(node),
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startChar - b.startChar || a.endChar - b.endChar);
}

function referenceEvidence(identifier: Identifier): TsMorphReferenceEvidenceV1[] {
  const rows = identifier.findReferencesAsNodes().map((node) => TsMorphReferenceEvidenceV1Schema.parse({
    filePath: node.getSourceFile().getFilePath(),
    startChar: node.getStart(),
    endChar: node.getEnd(),
    parentKind: node.getParent()?.getKindName() ?? 'UNKNOWN',
  }));
  const unique = new Map(rows.map((row) => [`${row.filePath}:${row.startChar}:${row.endChar}`, row]));
  return [...unique.values()].sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startChar - b.startChar || a.endChar - b.endChar);
}

function stableObservationId(candidate: AstGrepStructuralCandidateV1, revision: string): string {
  return [
    'tsmorph',
    candidate.sourceRef,
    candidate.startByte,
    candidate.endByte,
    candidate.name,
    candidate.sourceRevision,
    revision,
  ].join(':');
}

export function enrichAstCandidateWithTsMorph(
  value: TsMorphSemanticEnrichmentInputV1,
): TsMorphSemanticEnrichmentResultV1 {
  const input = TsMorphSemanticEnrichmentInputV1Schema.parse(value);
  const candidate = input.candidate;
  if (candidate.filePath !== input.filePath) {
    throw new Error(`TS_MORPH_FILE_PATH_MISMATCH:${candidate.filePath}:${input.filePath}`);
  }

  const { sourceFile } = createProject(input);
  const identifier = findCandidateIdentifier(sourceFile, candidate, input.code);
  const typeText = identifier.getType().getText(identifier);
  const definitions = definitionEvidence(identifier);
  const references = referenceEvidence(identifier);
  const implementationCount = identifier.getImplementations().length;
  const charRange = candidateCharRange(candidate, input.code);

  const semanticEvidence: LanguageSemanticEvidenceV1 = LanguageSemanticEvidenceV1Schema.parse({
    schema: 'atlas.language-semantic-evidence.v1',
    observationId: stableObservationId(candidate, input.semanticEngineRevision),
    language: candidate.filePath.endsWith('.js') || candidate.filePath.endsWith('.jsx') ? 'JAVASCRIPT' : 'TYPESCRIPT',
    engine: 'TS_MORPH',
    authority: 'COMPILER_SEMANTIC_OBSERVATION',
    relationKind: 'TYPE_OF',
    subjectCanonicalId: candidate.symbolVersionId,
    objectCanonicalId: null,
    symbolName: candidate.name,
    typeText,
    coordinate: {
      sourceRef: candidate.sourceRef,
      filePath: candidate.filePath,
      startByte: candidate.startByte,
      endByte: candidate.endByte,
      startChar: charRange.start,
      endChar: charRange.end,
      startLine: candidate.startLine + 1,
      endLine: candidate.endLine + 1,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
    },
    evidenceRefs: [
      `${candidate.sourceRef}#bytes=${candidate.startByte}-${candidate.endByte}`,
      `${candidate.sourceRef}#symbol=${candidate.name}`,
    ],
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    grammarRevision: null,
    semanticEngineRevision: input.semanticEngineRevision,
    requiresCanonicalPromotion: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });

  return TsMorphSemanticEnrichmentResultV1Schema.parse({
    schema: 'atlas.ts-morph-semantic-enrichment-result.v1',
    candidate,
    matchedIdentifier: {
      text: identifier.getText(),
      startChar: identifier.getStart(),
      endChar: identifier.getEnd(),
    },
    typeText,
    returnTypeText: returnTypeText(identifier),
    definitions,
    references,
    implementationCount,
    referenceCount: references.length,
    referenceBreadth: normalizedReferenceBreadth(references.length),
    semanticEvidence,
    sourceCoordinateMatchedByByteToUtf16Projection: true,
    treeNodeIdentityInheritedOnly: true,
    semanticEnrichmentMayNotReorderMembers: true,
    mutationProposalOnly: true,
    canonicalWritesAllowed: false,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    producerRevision: input.producerRevision,
  });
}
