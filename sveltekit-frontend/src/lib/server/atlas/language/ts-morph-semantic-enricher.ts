import { Project, Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { z } from 'zod';
import { LanguageSemanticEvidenceV1Schema, type LanguageSemanticEvidenceV1 } from './language-intelligence-plan.js';

export const TsMorphGroundedCandidateV1Schema = z.object({
  schema: z.literal('atlas.ts-morph-grounded-candidate.v1'),
  canonicalId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  filePath: z.string().min(1),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
  startByte: z.number().int().nonnegative().nullable(),
  endByte: z.number().int().nonnegative().nullable(),
  startLine: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  grammarRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.endChar < value.startChar) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endChar'], message: 'endChar must be >= startChar' });
  }
  if (value.startByte !== null && value.endByte !== null && value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});
export type TsMorphGroundedCandidateV1 = z.infer<typeof TsMorphGroundedCandidateV1Schema>;

export const TsMorphSemanticEnrichmentOptionsV1Schema = z.object({
  schema: z.literal('atlas.ts-morph-semantic-enrichment-options.v1'),
  tsConfigFilePath: z.string().min(1).nullable(),
  maxReferences: z.number().int().positive().max(10_000).default(128),
  includeImplementations: z.boolean().default(true),
  includeDefinitions: z.boolean().default(true),
  includeReferences: z.boolean().default(true),
  semanticEngineRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type TsMorphSemanticEnrichmentOptionsV1 = z.infer<typeof TsMorphSemanticEnrichmentOptionsV1Schema>;

export const TsMorphReferenceObservationV1Schema = z.object({
  sourceRef: z.string().min(1),
  filePath: z.string().min(1),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
  isDefinition: z.boolean(),
}).strict();
export type TsMorphReferenceObservationV1 = z.infer<typeof TsMorphReferenceObservationV1Schema>;

export const TsMorphSemanticEnrichmentResultV1Schema = z.object({
  schema: z.literal('atlas.ts-morph-semantic-enrichment-result.v1'),
  candidate: TsMorphGroundedCandidateV1Schema,
  symbolName: z.string().min(1).nullable(),
  symbolKind: z.string().min(1).nullable(),
  signatureText: z.string().min(1).nullable(),
  typeText: z.string().min(1).nullable(),
  definitions: z.array(TsMorphReferenceObservationV1Schema),
  implementations: z.array(TsMorphReferenceObservationV1Schema),
  references: z.array(TsMorphReferenceObservationV1Schema),
  evidence: z.array(LanguageSemanticEvidenceV1Schema),
  structuralCoordinatesPreserved: z.literal(true),
  sourceOrderPreserved: z.literal(true),
  treeNodeIdInvented: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  semanticEngineRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type TsMorphSemanticEnrichmentResultV1 = z.infer<typeof TsMorphSemanticEnrichmentResultV1Schema>;

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function sourceRefForFile(filePath: string): string {
  return `file:${normalizePath(filePath)}`;
}

function observationFromNode(node: Node, isDefinition: boolean): TsMorphReferenceObservationV1 {
  const sourceFile = node.getSourceFile();
  return TsMorphReferenceObservationV1Schema.parse({
    sourceRef: sourceRefForFile(sourceFile.getFilePath()),
    filePath: normalizePath(sourceFile.getFilePath()),
    startChar: node.getStart(),
    endChar: node.getEnd(),
    isDefinition,
  });
}

function findSmallestContainingNode(sourceFile: SourceFile, startChar: number, endChar: number): Node | undefined {
  let best: Node | undefined;
  sourceFile.forEachDescendant((node) => {
    if (node.getStart() > startChar || node.getEnd() < endChar) return;
    if (!best || (node.getEnd() - node.getStart()) < (best.getEnd() - best.getStart())) best = node;
  });
  if (!best && sourceFile.getStart() <= startChar && sourceFile.getEnd() >= endChar) best = sourceFile;
  return best;
}

type NameNodeReadable = Node & { getNameNode?: () => Node | undefined };

function findSemanticAnchor(node: Node): Node {
  if (Node.isIdentifier(node)) return node;
  const exactIdentifier = node.getDescendantsOfKind(SyntaxKind.Identifier)
    .find((identifier) => identifier.getStart() >= node.getStart() && identifier.getEnd() <= node.getEnd());
  if (exactIdentifier) return exactIdentifier;

  let cursor: Node | undefined = node;
  while (cursor) {
    const nameNode = (cursor as NameNodeReadable).getNameNode?.();
    if (nameNode) return nameNode;
    cursor = cursor.getParent();
  }
  return node;
}

function safeSymbolName(node: Node): string | null {
  try {
    const symbol = node.getSymbol();
    return symbol?.getName() ?? (Node.isIdentifier(node) ? node.getText() : null);
  } catch {
    return Node.isIdentifier(node) ? node.getText() : null;
  }
}

function safeSymbolKind(node: Node): string | null {
  try {
    return node.getSymbol()?.getDeclarations()?.[0]?.getKindName() ?? node.getKindName();
  } catch {
    return node.getKindName();
  }
}

function safeTypeText(node: Node): string | null {
  try {
    const text = node.getType().getText(node);
    return text && text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

function safeSignatureText(node: Node): string | null {
  try {
    const signatures = node.getType().getCallSignatures();
    if (signatures.length === 0) return null;
    const declaration = signatures[0]?.getDeclaration();
    return declaration?.getText().replace(/\s+/g, ' ').trim() ?? null;
  } catch {
    return null;
  }
}

function dedupeAndSort(rows: TsMorphReferenceObservationV1[], limit = Number.POSITIVE_INFINITY): TsMorphReferenceObservationV1[] {
  const map = new Map<string, TsMorphReferenceObservationV1>();
  for (const row of rows) {
    const key = `${row.filePath}:${row.startChar}:${row.endChar}:${row.isDefinition ? 1 : 0}`;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()]
    .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startChar - b.startChar || a.endChar - b.endChar)
    .slice(0, limit);
}

function definitionsFor(node: Node): TsMorphReferenceObservationV1[] {
  if (!Node.isIdentifier(node)) return [];
  try {
    return dedupeAndSort(node.getDefinitions().map((definition) => observationFromNode(definition.getDeclarationNode(), true)));
  } catch {
    return [];
  }
}

function implementationsFor(node: Node): TsMorphReferenceObservationV1[] {
  if (!Node.isIdentifier(node)) return [];
  try {
    return dedupeAndSort(node.getImplementations().map((implementation) => observationFromNode(implementation.getNode(), true)));
  } catch {
    return [];
  }
}

function referencesFor(node: Node, maxReferences: number): TsMorphReferenceObservationV1[] {
  if (!Node.isIdentifier(node)) return [];
  try {
    const rows = node.findReferences().flatMap((group) => [
      observationFromNode(group.getDefinition().getDeclarationNode(), true),
      ...group.getReferences().map((reference) => observationFromNode(reference.getNode(), false)),
    ]);
    return dedupeAndSort(rows, maxReferences);
  } catch {
    return [];
  }
}

function semanticEvidence(
  candidate: TsMorphGroundedCandidateV1,
  relationKind: LanguageSemanticEvidenceV1['relationKind'],
  symbolName: string | null,
  typeText: string | null,
  semanticEngineRevision: string,
  producerRevision: string,
  suffix: string,
): LanguageSemanticEvidenceV1 {
  return LanguageSemanticEvidenceV1Schema.parse({
    schema: 'atlas.language-semantic-evidence.v1',
    observationId: `${candidate.sourceRef}:${candidate.startChar}:${candidate.endChar}:${suffix}`,
    language: 'TYPESCRIPT',
    engine: 'TS_MORPH',
    authority: 'COMPILER_SEMANTIC_OBSERVATION',
    relationKind,
    subjectCanonicalId: candidate.canonicalId,
    objectCanonicalId: null,
    symbolName,
    typeText,
    coordinate: {
      sourceRef: candidate.sourceRef,
      filePath: candidate.filePath,
      startByte: candidate.startByte,
      endByte: candidate.endByte,
      startChar: candidate.startChar,
      endChar: candidate.endChar,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
    },
    evidenceRefs: [candidate.sourceRef],
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    grammarRevision: candidate.grammarRevision,
    semanticEngineRevision,
    requiresCanonicalPromotion: true,
    canonicalWritesAllowed: false,
    producerRevision,
  });
}

export function createTsMorphProject(tsConfigFilePath: string | null): Project {
  if (tsConfigFilePath) {
    return new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: false });
  }
  return new Project({
    compilerOptions: { allowJs: true, checkJs: false, noEmit: true, skipLibCheck: true },
    skipFileDependencyResolution: false,
    skipLoadingLibFiles: false,
    useInMemoryFileSystem: false,
  });
}

export function enrichGroundedTypeScriptCandidate(
  project: Project,
  candidateValue: TsMorphGroundedCandidateV1,
  optionsValue: TsMorphSemanticEnrichmentOptionsV1,
): TsMorphSemanticEnrichmentResultV1 {
  const candidate = TsMorphGroundedCandidateV1Schema.parse(candidateValue);
  const options = TsMorphSemanticEnrichmentOptionsV1Schema.parse(optionsValue);
  const normalizedCandidatePath = normalizePath(candidate.filePath);
  const sourceFile = project.getSourceFiles().find((file) => normalizePath(file.getFilePath()).endsWith(normalizedCandidatePath))
    ?? project.addSourceFileAtPathIfExists(candidate.filePath);

  if (!sourceFile) throw new Error(`TS_MORPH_SOURCE_FILE_NOT_FOUND:${candidate.filePath}`);

  const containing = findSmallestContainingNode(sourceFile, candidate.startChar, candidate.endChar);
  if (!containing) throw new Error(`TS_MORPH_GROUNDED_NODE_NOT_FOUND:${candidate.filePath}:${candidate.startChar}-${candidate.endChar}`);
  const anchor = findSemanticAnchor(containing);

  const symbolName = safeSymbolName(anchor);
  const symbolKind = safeSymbolKind(anchor);
  const typeText = safeTypeText(anchor);
  const signatureText = safeSignatureText(anchor);
  const definitions = options.includeDefinitions ? definitionsFor(anchor) : [];
  const implementations = options.includeImplementations ? implementationsFor(anchor) : [];
  const references = options.includeReferences ? referencesFor(anchor, options.maxReferences) : [];

  const evidence: LanguageSemanticEvidenceV1[] = [];
  if (typeText) evidence.push(semanticEvidence(candidate, 'TYPE_OF', symbolName, typeText, options.semanticEngineRevision, options.producerRevision, 'type'));
  if (definitions.length > 0) evidence.push(semanticEvidence(candidate, 'DEFINES', symbolName, typeText, options.semanticEngineRevision, options.producerRevision, 'definitions'));
  if (references.length > 0) evidence.push(semanticEvidence(candidate, 'REFERENCES', symbolName, typeText, options.semanticEngineRevision, options.producerRevision, 'references'));
  if (implementations.length > 0) evidence.push(semanticEvidence(candidate, 'IMPLEMENTS', symbolName, typeText, options.semanticEngineRevision, options.producerRevision, 'implementations'));

  return TsMorphSemanticEnrichmentResultV1Schema.parse({
    schema: 'atlas.ts-morph-semantic-enrichment-result.v1',
    candidate,
    symbolName,
    symbolKind,
    signatureText,
    typeText,
    definitions,
    implementations,
    references,
    evidence,
    structuralCoordinatesPreserved: true,
    sourceOrderPreserved: true,
    treeNodeIdInvented: false,
    canonicalWritesAllowed: false,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    semanticEngineRevision: options.semanticEngineRevision,
    producerRevision: options.producerRevision,
  });
}
