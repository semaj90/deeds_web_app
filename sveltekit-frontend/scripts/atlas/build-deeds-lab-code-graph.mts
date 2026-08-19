import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';
import {
  CodeAssetGraphV1Schema,
  CodeAssetNodeV1Schema,
  CodeAssetEdgeV1Schema,
  classifyCodeAssetDomains,
  codeAssetEdgeId,
  codeAssetId,
  normalizeCodeAssetSourceRef,
  repairEvidenceCodeAsset,
  reusableCodeAsset,
  type CodeAssetDomain,
  type CodeAssetEdgeV1,
  type CodeAssetKind,
  type CodeAssetNodeV1,
} from '../../src/lib/server/atlas/code-archaeology/code-asset-graph.js';

/**
 * Builds a non-destructive source-code archaeology graph under deeds_lab/.
 *
 * IMPORTANT:
 * - No source files are moved, renamed, deleted, reformatted, or rewritten.
 * - deeds_labs/ (plural, the historical ignored archive) is never traversed.
 * - deeds_lab/ (singular, this generated/reference layer) is never recursively indexed.
 * - Output is evidence/index material only; it has no canonical mutation authority.
 *
 * Output:
 *   deeds_lab/parent-atlas-code-graph/code-asset-graph.json
 *   deeds_lab/parent-atlas-code-graph/nodes.jsonl
 *   deeds_lab/parent-atlas-code-graph/edges.jsonl
 *   deeds_lab/parent-atlas-code-graph/reusable-assets.json
 *   deeds_lab/parent-atlas-code-graph/repair-assets.json
 */

const PRODUCER_REVISION = 'atlas.deeds-lab-code-graph.v1';
const EXTRACTION_REVISION = process.env.ATLAS_CODE_GRAPH_REVISION?.trim() || PRODUCER_REVISION;
const WORKSPACE_REVISION = process.env.ATLAS_WORKSPACE_REVISION?.trim() || 'UNPROVEN_LOCAL_WORKTREE';
const SOURCE_REVISION = process.env.ATLAS_SOURCE_REVISION?.trim() || 'UNPROVEN_LOCAL_WORKTREE';

const SKIP_DIRS = new Set([
  '.git', '.svelte-kit', '.turbo', '.vite', '.cache', '.tmp', '.temp',
  'node_modules', 'build', 'dist', 'coverage', 'test-results',
  'deeds_lab', 'deeds_labs', 'qdrant_storage', 'models', 'local-models',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.cs', '.c', '.cc', '.cpp', '.h', '.hpp',
  '.proto', '.sql', '.md', '.json', '.yaml', '.yml', '.toml',
]);

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const MAX_AUXILIARY_FILE_BYTES = 1_000_000;

function findRepoRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === 'sveltekit-frontend') return path.dirname(cwd);
  if (path.basename(cwd).toLowerCase() === 'deeds_web_app' || path.basename(cwd).toLowerCase() === 'deeds-web-app') return cwd;
  if (path.basename(path.dirname(cwd)).toLowerCase() === 'sveltekit-frontend') return path.dirname(path.dirname(cwd));
  throw new Error(`Run from deeds_web_app/ or sveltekit-frontend/. cwd=${cwd}`);
}

const repoRoot = findRepoRoot();
const frontendRoot = path.join(repoRoot, 'sveltekit-frontend');
const outputRoot = path.join(repoRoot, 'deeds_lab', 'parent-atlas-code-graph');

const SOURCE_ROOTS = [
  path.join(frontendRoot, 'src'),
  path.join(frontendRoot, 'scripts'),
  path.join(repoRoot, 'scripts', 'atlas'),
  path.join(repoRoot, 'scripts', 'ingest'),
  path.join(repoRoot, 'python'),
  path.join(repoRoot, 'proto', 'active'),
  path.join(repoRoot, 'openspec'),
].filter((value, index, all) => all.indexOf(value) === index);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sourceRefFor(filePath: string): string {
  return normalizeCodeAssetSourceRef(path.relative(repoRoot, filePath));
}

function languageFor(sourceRef: string): string {
  const ext = path.extname(sourceRef).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.mts': 'typescript', '.cts': 'typescript',
    '.js': 'javascript', '.jsx': 'jsx', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.cs': 'csharp',
    '.c': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.h': 'c-cpp-header', '.hpp': 'cpp-header',
    '.proto': 'protobuf', '.sql': 'sql', '.md': 'markdown', '.json': 'json',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  };
  return map[ext] ?? 'text';
}

function fileKind(sourceRef: string, text: string): CodeAssetKind {
  const lower = sourceRef.toLowerCase();
  if (lower.endsWith('.proto')) return 'PROTO';
  if (lower.includes('/openspec/') || lower.startsWith('openspec/')) return 'OPEN_SPEC';
  if (lower.endsWith('.md')) return 'DOCUMENT';
  if (/sidecar/i.test(sourceRef) || /FastAPI\s*\(/.test(text) || /HTTPServer\s*\(/.test(text)) return 'SIDECAR';
  if (lower.includes('/scripts/') || lower.startsWith('scripts/')) return 'SCRIPT';
  return 'FILE';
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await visit(full);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }
  await visit(root);
  return files;
}

function lineSpan(node: Node) {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndColumnAtPos(node.getStart());
  const end = sourceFile.getLineAndColumnAtPos(node.getEnd());
  return {
    startLine: start.line,
    startColumn: Math.max(0, start.column - 1),
    endLine: end.line,
    endColumn: Math.max(0, end.column - 1),
  };
}

function signatureFor(node: Node): string {
  const text = node.getText().trim().replace(/\s+/g, ' ');
  const firstBody = text.indexOf('{');
  return (firstBody >= 0 ? text.slice(0, firstBody) : text).slice(0, 512).trim();
}

function isAsyncNode(node: Node): boolean {
  const text = signatureFor(node);
  return /(?:^|\s)async(?:\s|$)/.test(text);
}

function exportedNodePositions(sourceFile: SourceFile): Set<number> {
  const positions = new Set<number>();
  for (const declarations of sourceFile.getExportedDeclarations().values()) {
    for (const declaration of declarations) positions.add(declaration.getStart());
  }
  return positions;
}

function variableKind(declaration: VariableDeclaration): CodeAssetKind {
  const initializer = declaration.getInitializer();
  const text = initializer?.getText() ?? '';
  const name = declaration.getName();
  if (/Schema$/.test(name) || /\bz\.(?:object|enum|union|discriminatedUnion|array|record|tuple|literal|intersection)\s*\(/.test(text)) return 'ZOD_SCHEMA';
  if (initializer && [SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression].includes(initializer.getKind())) return 'FUNCTION';
  return 'VARIABLE';
}

function symbolName(node: Node, fallback = ''): string {
  if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node)
      || Node.isTypeAliasDeclaration(node) || Node.isEnumDeclaration(node) || Node.isMethodDeclaration(node)
      || Node.isVariableDeclaration(node)) {
    return node.getName() || fallback;
  }
  return fallback;
}

function qualifiedName(node: Node, name: string): string {
  const parents: string[] = [];
  for (const ancestor of node.getAncestors().reverse()) {
    if (Node.isClassDeclaration(ancestor) || Node.isInterfaceDeclaration(ancestor)) {
      const parentName = ancestor.getName();
      if (parentName) parents.push(parentName);
    }
  }
  return [...parents, name].filter(Boolean).join('.') || name;
}

function createNode(input: {
  kind: CodeAssetKind;
  name: string;
  qualifiedName: string;
  sourceRef: string;
  language: string;
  span: ReturnType<typeof lineSpan> | null;
  exported: boolean;
  async: boolean;
  signature: string;
  textForDomains: string;
  tags?: string[];
}): CodeAssetNodeV1 {
  const domains = classifyCodeAssetDomains(input.sourceRef, input.name, input.signature, input.textForDomains);
  return CodeAssetNodeV1Schema.parse({
    schema: 'atlas.code-asset-node.v1',
    assetId: codeAssetId({ sourceRef: input.sourceRef, kind: input.kind, qualifiedName: input.qualifiedName }),
    kind: input.kind,
    name: input.name,
    qualifiedName: input.qualifiedName,
    sourceRef: input.sourceRef,
    language: input.language,
    span: input.span,
    domains,
    exported: input.exported,
    async: input.async,
    signature: input.signature,
    sourceRevision: SOURCE_REVISION,
    workspaceRevision: WORKSPACE_REVISION,
    tags: [...new Set(input.tags ?? [])].sort(),
    reusableForNewFileCreation: reusableCodeAsset(domains, input.kind),
    repairEvidenceCandidate: repairEvidenceCodeAsset(domains),
    canonicalWritesAllowed: false,
    producerRevision: PRODUCER_REVISION,
  });
}

function addEdge(edges: Map<string, CodeAssetEdgeV1>, input: {
  from: CodeAssetNodeV1;
  to: CodeAssetNodeV1;
  relation: CodeAssetEdgeV1['relation'];
  sourceRef: string;
  confidence: number;
  exact: boolean;
  evidence: string;
}): void {
  const edge = CodeAssetEdgeV1Schema.parse({
    schema: 'atlas.code-asset-edge.v1',
    edgeId: codeAssetEdgeId({
      fromAssetId: input.from.assetId,
      relation: input.relation,
      toAssetId: input.to.assetId,
      sourceRevision: SOURCE_REVISION,
    }),
    fromAssetId: input.from.assetId,
    toAssetId: input.to.assetId,
    relation: input.relation,
    sourceRef: input.sourceRef,
    confidence: input.confidence,
    exact: input.exact,
    evidence: input.evidence,
    sourceRevision: SOURCE_REVISION,
    canonicalWritesAllowed: false,
    producerRevision: PRODUCER_REVISION,
  });
  edges.set(edge.edgeId, edge);
}

function enclosingAsset(symbols: readonly CodeAssetNodeV1[], sourceRef: string, line: number): CodeAssetNodeV1 | null {
  const candidates = symbols.filter((node) =>
    node.sourceRef === sourceRef && node.span !== null
    && node.span.startLine <= line && node.span.endLine >= line);
  candidates.sort((a, b) => {
    const aSize = (a.span!.endLine - a.span!.startLine) * 10_000 + (a.span!.endColumn - a.span!.startColumn);
    const bSize = (b.span!.endLine - b.span!.startLine) * 10_000 + (b.span!.endColumn - b.span!.startColumn);
    return aSize - bSize;
  });
  return candidates[0] ?? null;
}

function isTsFile(filePath: string): boolean {
  return TS_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function main(): Promise<void> {
  const discovered = (await Promise.all(SOURCE_ROOTS.map(walk))).flat();
  const sourceFiles = [...new Set(discovered)].sort((a, b) => a.localeCompare(b));
  const tsFiles = sourceFiles.filter(isTsFile);
  const auxiliaryFiles = sourceFiles.filter((file) => !isTsFile(file));

  const project = new Project({
    tsConfigFilePath: path.join(frontendRoot, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  for (const filePath of tsFiles) project.addSourceFileAtPathIfExists(filePath);
  project.resolveSourceFileDependencies();

  const nodes = new Map<string, CodeAssetNodeV1>();
  const edges = new Map<string, CodeAssetEdgeV1>();
  const fileNodesByPath = new Map<string, CodeAssetNodeV1>();
  const symbolNodes: CodeAssetNodeV1[] = [];
  const symbolByName = new Map<string, CodeAssetNodeV1[]>();

  for (const sourceFile of project.getSourceFiles().sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()))) {
    const sourceRef = sourceRefFor(sourceFile.getFilePath());
    if (sourceRef.startsWith('deeds_lab/') || sourceRef.startsWith('deeds_labs/')) continue;
    const text = sourceFile.getFullText();
    const language = languageFor(sourceRef);
    const fileNode = createNode({
      kind: fileKind(sourceRef, text),
      name: path.basename(sourceRef),
      qualifiedName: sourceRef,
      sourceRef,
      language,
      span: null,
      exported: false,
      async: false,
      signature: '',
      textForDomains: text.slice(0, 20_000),
      tags: ['typescript-ast-indexed'],
    });
    nodes.set(fileNode.assetId, fileNode);
    fileNodesByPath.set(path.resolve(sourceFile.getFilePath()), fileNode);

    const exportedPositions = exportedNodePositions(sourceFile);
    const declarations: Array<{ node: Node; kind: CodeAssetKind }> = [
      ...sourceFile.getFunctions().map((node) => ({ node, kind: 'FUNCTION' as const })),
      ...sourceFile.getClasses().map((node) => ({ node, kind: 'CLASS' as const })),
      ...sourceFile.getInterfaces().map((node) => ({ node, kind: 'INTERFACE' as const })),
      ...sourceFile.getTypeAliases().map((node) => ({ node, kind: 'TYPE_ALIAS' as const })),
      ...sourceFile.getEnums().map((node) => ({ node, kind: 'ENUM' as const })),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration).map((node) => ({ node, kind: 'METHOD' as const })),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).map((node) => ({ node, kind: variableKind(node) })),
    ];

    const localSeen = new Set<string>();
    for (const declaration of declarations.sort((a, b) => a.node.getStart() - b.node.getStart())) {
      const name = symbolName(declaration.node);
      if (!name) continue;
      const qname = qualifiedName(declaration.node, name);
      const identity = `${declaration.kind}:${qname}:${declaration.node.getStart()}`;
      if (localSeen.has(identity)) continue;
      localSeen.add(identity);
      const signature = signatureFor(declaration.node);
      const symbol = createNode({
        kind: declaration.kind,
        name,
        qualifiedName: qname,
        sourceRef,
        language,
        span: lineSpan(declaration.node),
        exported: exportedPositions.has(declaration.node.getStart())
          || declaration.node.getAncestors().some((ancestor) => exportedPositions.has(ancestor.getStart())),
        async: isAsyncNode(declaration.node),
        signature,
        textForDomains: declaration.node.getText().slice(0, 5_000),
        tags: declaration.kind === 'ZOD_SCHEMA' ? ['zod-schema'] : [],
      });
      nodes.set(symbol.assetId, symbol);
      symbolNodes.push(symbol);
      const bucket = symbolByName.get(name) ?? [];
      bucket.push(symbol);
      symbolByName.set(name, bucket);
      addEdge(edges, {
        from: fileNode, to: symbol, relation: 'CONTAINS', sourceRef,
        confidence: 1, exact: true, evidence: `ts-morph declaration ${declaration.node.getKindName()}`,
      });
      if (symbol.exported) addEdge(edges, {
        from: fileNode, to: symbol, relation: 'EXPORTS', sourceRef,
        confidence: 1, exact: true, evidence: 'ts-morph exported declaration',
      });
    }
  }

  // Exact file/module import edges. External modules become explicit graph nodes.
  for (const sourceFile of project.getSourceFiles().sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()))) {
    const from = fileNodesByPath.get(path.resolve(sourceFile.getFilePath()));
    if (!from) continue;
    for (const declaration of sourceFile.getImportDeclarations()) {
      const moduleName = declaration.getModuleSpecifierValue();
      const resolved = declaration.getModuleSpecifierSourceFile();
      let target: CodeAssetNodeV1;
      if (resolved) {
        const resolvedPath = path.resolve(resolved.getFilePath());
        target = fileNodesByPath.get(resolvedPath) ?? createNode({
          kind: 'FILE', name: path.basename(resolvedPath), qualifiedName: sourceRefFor(resolvedPath),
          sourceRef: sourceRefFor(resolvedPath), language: languageFor(resolvedPath), span: null,
          exported: false, async: false, signature: '', textForDomains: moduleName, tags: ['resolved-import-target'],
        });
      } else {
        const sourceRef = `external:${moduleName}`;
        target = createNode({
          kind: 'EXTERNAL_MODULE', name: moduleName, qualifiedName: moduleName, sourceRef,
          language: 'module', span: null, exported: false, async: false, signature: '',
          textForDomains: moduleName, tags: ['external-module'],
        });
      }
      nodes.set(target.assetId, target);
      addEdge(edges, {
        from, to: target, relation: 'IMPORTS', sourceRef: from.sourceRef,
        confidence: 1, exact: true, evidence: declaration.getText().slice(0, 512),
      });
    }
  }

  // Conservative call graph nominations: only connect when a callee identifier
  // maps to exactly one indexed local symbol. This is still CALLS_CANDIDATE;
  // ts-morph/LSP exact semantic resolution remains a later promotion step.
  for (const sourceFile of project.getSourceFiles()) {
    const sourceRef = sourceRefFor(sourceFile.getFilePath());
    const fileNode = fileNodesByPath.get(path.resolve(sourceFile.getFilePath()));
    if (!fileNode) continue;
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression().getText().trim();
      const calleeName = expression.split(/[.?!()[\]\s]/).filter(Boolean).at(-1) ?? expression;
      const targets = symbolByName.get(calleeName) ?? [];
      if (targets.length !== 1) continue;
      const line = sourceFile.getLineAndColumnAtPos(call.getStart()).line;
      const owner = enclosingAsset(symbolNodes, sourceRef, line) ?? fileNode;
      const target = targets[0]!;
      if (owner.assetId === target.assetId) continue;
      addEdge(edges, {
        from: owner, to: target, relation: 'CALLS_CANDIDATE', sourceRef,
        confidence: 0.7, exact: false,
        evidence: `unique-name call candidate: ${expression}`,
      });
    }
  }

  // Lightweight file-level nodes for Python/proto/OpenSpec/docs/config artifacts.
  for (const filePath of auxiliaryFiles) {
    const sourceRef = sourceRefFor(filePath);
    if (sourceRef.startsWith('deeds_lab/') || sourceRef.startsWith('deeds_labs/')) continue;
    let fileStat;
    try { fileStat = await stat(filePath); } catch { continue; }
    let text = '';
    if (fileStat.size <= MAX_AUXILIARY_FILE_BYTES) {
      try { text = await readFile(filePath, 'utf8'); } catch { text = ''; }
    }
    const asset = createNode({
      kind: fileKind(sourceRef, text),
      name: path.basename(sourceRef), qualifiedName: sourceRef, sourceRef,
      language: languageFor(sourceRef), span: null, exported: false, async: false,
      signature: '', textForDomains: text.slice(0, 20_000),
      tags: fileStat.size > MAX_AUXILIARY_FILE_BYTES ? ['metadata-only-large-file'] : ['lightweight-file-index'],
    });
    nodes.set(asset.assetId, asset);
  }

  const orderedNodes = [...nodes.values()].sort((a, b) =>
    a.sourceRef.localeCompare(b.sourceRef) || a.kind.localeCompare(b.kind) || a.qualifiedName.localeCompare(b.qualifiedName));
  const orderedEdges = [...edges.values()].sort((a, b) =>
    a.fromAssetId.localeCompare(b.fromAssetId) || a.relation.localeCompare(b.relation) || a.toAssetId.localeCompare(b.toAssetId));

  const stableGraphMaterial = {
    workspaceRevision: WORKSPACE_REVISION,
    extractionRevision: EXTRACTION_REVISION,
    sourceRoots: SOURCE_ROOTS.map(sourceRefFor).sort(),
    nodeIds: orderedNodes.map((node) => node.assetId),
    edgeIds: orderedEdges.map((edge) => edge.edgeId),
  };
  const graph = CodeAssetGraphV1Schema.parse({
    schema: 'atlas.code-asset-graph.v1',
    graphId: sha256(stableJson(stableGraphMaterial)),
    workspaceRevision: WORKSPACE_REVISION,
    extractionRevision: EXTRACTION_REVISION,
    generatedAt: new Date().toISOString(),
    sourceRoots: stableGraphMaterial.sourceRoots,
    nodes: orderedNodes,
    edges: orderedEdges,
    statistics: {
      files: orderedNodes.filter((node) => ['FILE', 'SCRIPT', 'SIDECAR', 'PROTO', 'OPEN_SPEC', 'DOCUMENT'].includes(node.kind)).length,
      symbols: orderedNodes.filter((node) => ['FUNCTION', 'METHOD', 'CLASS', 'INTERFACE', 'TYPE_ALIAS', 'ENUM', 'VARIABLE'].includes(node.kind)).length,
      schemas: orderedNodes.filter((node) => node.kind === 'ZOD_SCHEMA').length,
      sidecars: orderedNodes.filter((node) => node.kind === 'SIDECAR').length,
      edges: orderedEdges.length,
    },
    invariants: {
      sourceRefRequired: true,
      originalsPreserved: true,
      noMoves: true,
      noDeletes: true,
      canonicalWritesAllowed: false,
      executorMultiplicityAddsVotes: false,
    },
    producerRevision: PRODUCER_REVISION,
  });

  const reusable = orderedNodes.filter((node) => node.reusableForNewFileCreation);
  const repair = orderedNodes.filter((node) => node.repairEvidenceCandidate);
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputRoot, 'code-asset-graph.json'), `${JSON.stringify(graph, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputRoot, 'nodes.jsonl'), orderedNodes.map((node) => JSON.stringify(node)).join('\n') + '\n', 'utf8'),
    writeFile(path.join(outputRoot, 'edges.jsonl'), orderedEdges.map((edge) => JSON.stringify(edge)).join('\n') + '\n', 'utf8'),
    writeFile(path.join(outputRoot, 'reusable-assets.json'), `${JSON.stringify({ schema: 'atlas.reusable-code-assets.v1', graphId: graph.graphId, rows: reusable }, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputRoot, 'repair-assets.json'), `${JSON.stringify({ schema: 'atlas.repair-code-assets.v1', graphId: graph.graphId, rows: repair }, null, 2)}\n`, 'utf8'),
  ]);

  console.log(JSON.stringify({
    ok: true,
    outputRoot: sourceRefFor(outputRoot),
    graphId: graph.graphId,
    ...graph.statistics,
    reusableAssets: reusable.length,
    repairAssets: repair.length,
    originalsPreserved: true,
    noMoves: true,
    noDeletes: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
