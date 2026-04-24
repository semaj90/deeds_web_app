/**
 * AST-Aware Code Chunker
 *
 * Chunks TypeScript/Svelte files by semantic boundaries (functions, classes,
 * exports, route handlers) instead of naive line/character splitting.
 *
 * For +server.ts files: chunks per HTTP handler (GET, POST, PATCH, DELETE)
 * For schema files: chunks per table definition
 * For lib files: chunks per exported function/class/const
 *
 * Each chunk includes metadata for Qdrant payload:
 * { path, kind, symbol, routeId, exports, httpMethod, tags, lineStart, lineEnd }
 */
import { readFile } from 'fs/promises';
import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph';
import { basename, relative, extname } from 'path';
import { logAstParse } from './ast-ingest-logger.js';
import { extractMetadata, persistFileFeature } from './workspace-metadata-extractor.js';

export interface CodeChunk {
	id: string;
	content: string;
	signature: string; // AST-derived signature for dual embedding
	metadata: ChunkMetadata;
}

export interface ChunkMetadata {
	path: string;
	relativePath: string;
	kind: 'route-handler' | 'table-def' | 'function' | 'class' | 'const' | 'type' | 'component' | 'unknown';
	symbol: string;
	httpMethod?: string;
	routeId?: string;
	exports: string[];
	tags: string[];
	lineStart: number;
	lineEnd: number;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const AST_SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
]);
const INDEXABLE_SOURCE_EXTENSIONS = new Set([
  ...AST_SOURCE_EXTENSIONS,
  '.svelte',
  '.json',
  '.sql',
  '.proto',
  '.py',
  '.go',
  '.rs',
  '.css',
  '.scss',
  '.yml',
  '.yaml',
  '.html',
  '.wgsl',
  '.ps1',
  '.sh',
  '.toml',
]);

/**
 * Derive a routeId from a file path.
 * e.g., src/routes/api/cases/[id]/+server.ts → /api/cases/[id]
 */
function deriveRouteId(filePath: string): string | undefined {
	const match = filePath.match(/src\/routes\/(.+?)\/\+(?:page|server|layout)/);
	if (!match) return undefined;
	let route = '/' + match[1].replace(/\(.*?\)\//g, ''); // strip route groups
	return route;
}

/**
 * Derive tags from file path and content.
 */
function deriveTags(filePath: string, content: string): string[] {
	const tags: string[] = [];
	const base = basename(filePath);

	if (base === '+server.ts') tags.push('api', 'server');
	else if (base === '+page.server.ts') tags.push('page-server', 'ssr');
	else if (base === '+page.svelte') tags.push('page', 'component');
	else if (base === '+layout.server.ts') tags.push('layout-server');
	else if (base === '+layout.svelte') tags.push('layout', 'component');
	else if (filePath.includes('/db/')) tags.push('database');
	else if (filePath.includes('/ai/')) tags.push('ai');
	else if (filePath.includes('/cache/')) tags.push('cache');
	else if (filePath.includes('/queue/')) tags.push('queue');
	else if (filePath.includes('tests/')) tags.push('test');

	if (content.includes('pgTable')) tags.push('schema', 'drizzle');
	if (content.includes('createMachine') || content.includes('setup(')) tags.push('xstate');
	if (content.includes('Qdrant') || content.includes('qdrant')) tags.push('vector');
	if (content.includes('Redis') || content.includes('redis')) tags.push('redis');
	if (content.includes('amqp') || content.includes('RabbitMQ')) tags.push('rabbitmq');
	if (content.includes('lucia') || content.includes('session')) tags.push('auth');
	if (content.includes('embedding') || content.includes('embed')) tags.push('embedding');

	return [...new Set(tags)];
}

/**
 * Build a signature string from AST metadata.
 * This gets embedded alongside the raw text for better semantic search.
 *
 * Example: "export const POST /api/cases uses db.insert(cases) returns json({success, data})"
 */
function buildSignature(chunk: Omit<CodeChunk, 'signature'>): string {
	const m = chunk.metadata;
	const parts: string[] = [];

	if (m.exports.length > 0) parts.push(`export ${m.exports.join(', ')}`);
	if (m.httpMethod) parts.push(m.httpMethod);
	if (m.routeId) parts.push(m.routeId);
	if (m.symbol && !m.exports.includes(m.symbol)) parts.push(m.symbol);

	// Extract key patterns from content
	const content = chunk.content;
	const dbOps = content.match(/db\.(select|insert|update|delete)\(\)\.from\((\w+)\)/g);
	if (dbOps) parts.push(`uses ${dbOps.join(', ')}`);

	const imports = content.match(/from ['"]([^'"]+)['"]/g);
	if (imports && imports.length <= 3) {
		parts.push(`imports ${imports.map(i => i.replace(/from ['"]/, '').replace(/['"]/, '')).join(', ')}`);
	}

	if (m.tags.length > 0) parts.push(`[${m.tags.join(', ')}]`);

	return parts.join(' ');
}

/**
 * Chunk a TypeScript source file by AST boundaries.
 */
function chunkSourceFile(sourceFile: SourceFile, rootDir: string): CodeChunk[] {
	const chunks: CodeChunk[] = [];
	const filePath = sourceFile.getFilePath();
	const relPath = relative(rootDir, filePath).replace(/\\/g, '/');
	const fileContent = sourceFile.getFullText();
	const tags = deriveTags(relPath, fileContent);
	const routeId = deriveRouteId(relPath);
	let chunkIndex = 0;

	function addChunk(
		node: Node,
		kind: ChunkMetadata['kind'],
		symbol: string,
		httpMethod?: string,
		exports: string[] = []
	) {
		const content = node.getFullText().trim();
		if (content.length < 10) return; // skip trivial nodes

		const lineStart = node.getStartLineNumber();
		const lineEnd = node.getEndLineNumber();

		const metadata: ChunkMetadata = {
			path: filePath,
			relativePath: relPath,
			kind,
			symbol,
			httpMethod,
			routeId,
			exports,
			tags: [...tags],
			lineStart,
			lineEnd
		};

		const partialChunk = {
			id: `${relPath}::${symbol}::${chunkIndex}`,
			content,
			metadata
		};

		chunks.push({
			...partialChunk,
			signature: buildSignature(partialChunk)
		});

		chunkIndex++;
	}

	// 1. Route handler exports (GET, POST, PATCH, DELETE, etc.)
	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const name = varDecl.getName();
		if (HTTP_METHODS.includes(name as any)) {
			const statement = varDecl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
			if (statement) {
				addChunk(statement, 'route-handler', name, name, [name]);
			}
		}
	}

	// 2. Table definitions (pgTable calls)
	for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
		const expr = callExpr.getExpression();
		if (expr.getText() === 'pgTable') {
			const args = callExpr.getArguments();
			const tableName = args[0]?.getText().replace(/['"]/g, '') ?? 'unknown';
			const statement = callExpr.getFirstAncestorByKind(SyntaxKind.VariableStatement);
			if (statement) {
				addChunk(statement, 'table-def', tableName, undefined, [tableName]);
			}
		}
	}

	// 3. Exported functions
	for (const fn of sourceFile.getFunctions()) {
		if (fn.isExported()) {
			addChunk(fn, 'function', fn.getName() ?? 'anonymous', undefined, [fn.getName() ?? '']);
		}
	}

	// 4. Exported classes
	for (const cls of sourceFile.getClasses()) {
		if (cls.isExported()) {
			addChunk(cls, 'class', cls.getName() ?? 'anonymous', undefined, [cls.getName() ?? '']);
		}
	}

	// 5. Exported const/let (non-handler, non-table)
	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const name = varDecl.getName();
		// Skip if already captured as handler or table
		if (HTTP_METHODS.includes(name as any)) continue;
		const statement = varDecl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
		if (statement?.isExported()) {
			const text = statement.getFullText();
			if (text.includes('pgTable')) continue; // already captured
			addChunk(statement, 'const', name, undefined, [name]);
		}
	}

	// 6. Exported types/interfaces (useful for schema discovery)
	for (const typeAlias of sourceFile.getTypeAliases()) {
		if (typeAlias.isExported()) {
			addChunk(typeAlias, 'type', typeAlias.getName(), undefined, [typeAlias.getName()]);
		}
	}
	for (const iface of sourceFile.getInterfaces()) {
		if (iface.isExported()) {
			addChunk(iface, 'type', iface.getName(), undefined, [iface.getName()]);
		}
	}

	// 7. If no chunks extracted (e.g., .svelte compiled or complex file), chunk the whole file
	if (chunks.length === 0 && fileContent.length > 50) {
		const partialChunk = {
			id: `${relPath}::file::0`,
			content: fileContent.slice(0, 4000), // cap at ~4K chars
			metadata: {
				path: filePath,
				relativePath: relPath,
				kind: 'unknown' as const,
				symbol: basename(filePath),
				routeId,
				exports: [],
				tags,
				lineStart: 1,
				lineEnd: sourceFile.getEndLineNumber()
			}
		};
		chunks.push({
			...partialChunk,
			signature: buildSignature(partialChunk)
		});
	}

	return chunks;
}

function chunkRawFile(content: string, filePath: string, rootDir: string): CodeChunk[] {
  const normalizedContent = content.trim();
  if (normalizedContent.length < 10) return [];

  const relPath = relative(rootDir, filePath).replace(/\\/g, '/');
  const tags = deriveTags(relPath, content);
  const routeId = deriveRouteId(relPath);
  const lineCount = content.split(/\r?\n/).length;
  const kind = extname(filePath) === '.svelte' ? 'component' : 'unknown';
  const partialChunk = {
    id: `${relPath}::file::0`,
    content: normalizedContent.slice(0, 4000),
    metadata: {
      path: filePath,
      relativePath: relPath,
      kind,
      symbol: basename(filePath),
      routeId,
      exports: [],
      tags,
      lineStart: 1,
      lineEnd: lineCount,
    },
  };

  return [
    {
      ...partialChunk,
      signature: buildSignature(partialChunk),
    },
  ];
}

function kindBreakdownFor(chunks: CodeChunk[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const chunk of chunks) {
    breakdown[chunk.metadata.kind] = (breakdown[chunk.metadata.kind] ?? 0) + 1;
  }
  return breakdown;
}

async function persistMetadataForFile(
  filePath: string,
  rootDir: string,
  content: string
): Promise<void> {
  const meta = await extractMetadata(filePath, { repoRoot: rootDir, content });
  persistFileFeature(meta).catch(() => {});
}

export interface ChunkFilesProgress {
  totalFiles: number;
  filesProcessed: number;
  chunksGenerated: number;
  chunksTotal: number;
  relativePath: string;
  skipped: boolean;
  durationMs: number;
  error?: string;
}

export interface ChunkFilesOptions {
  onProgress?: (progress: ChunkFilesProgress) => void | Promise<void>;
}

/**
 * Chunk multiple files using AST-aware extraction.
 *
 * @param filePaths - Absolute paths to indexable source files
 * @param rootDir - Root directory for relative path computation
 * @returns Array of code chunks with metadata + signatures
 */
export async function chunkFiles(
  filePaths: string[],
  rootDir: string,
  options: ChunkFilesOptions = {}
): Promise<CodeChunk[]> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
    },
  });

  // Phase 108 fix (regressed, re-applied 2026-04-24):
  // Add all AST-parseable source files ONCE via addSourceFilesAtPaths() instead
  // of per-file addSourceFileAtPath in the loop. The per-file variant triggers
  // ts-morph's module resolver on each call, which chases imports and rebuilds
  // the program graph incrementally — O(n²) total cost when the set has 1000+
  // interconnected files (15-file test ~34s, 2571-file run ~20+ min).
  // Batch form resolves once for the full set, bringing 1335 nodes to 28s.
  const astPaths = filePaths.filter((fp) => AST_SOURCE_EXTENSIONS.has(extname(fp)));
  if (astPaths.length > 0) {
    project.addSourceFilesAtPaths(astPaths);
  }

  const allChunks: CodeChunk[] = [];
  let filesProcessed = 0;

  async function reportProgress(
    progress: Omit<ChunkFilesProgress, 'totalFiles' | 'filesProcessed'>
  ): Promise<void> {
    filesProcessed += 1;
    await options.onProgress?.({
      totalFiles: filePaths.length,
      filesProcessed,
      chunksTotal: allChunks.length,
      ...progress,
    });
  }

  for (const fp of filePaths) {
    const ext = extname(fp);
    if (!INDEXABLE_SOURCE_EXTENSIONS.has(ext)) continue;

    const t0 = performance.now();
    const relativePath = relative(rootDir, fp).replace(/\\/g, '/');
    try {
      let fileContent = '';
      let chunks: CodeChunk[] = [];

      if (AST_SOURCE_EXTENSIONS.has(ext)) {
        // Source file was already added via addSourceFilesAtPaths above —
        // getSourceFile() is O(1) Map lookup. Don't removeSourceFile() either;
        // that would reintroduce incremental graph churn.
        const sourceFile = project.getSourceFile(fp);
        if (!sourceFile) {
          // Shouldn't happen — addSourceFilesAtPaths covered this path — but
          // fall through to raw text chunking if ts-morph somehow skipped it.
          fileContent = await readFile(fp, 'utf8');
          chunks = chunkRawFile(fileContent, fp, rootDir);
        } else {
          fileContent = sourceFile.getFullText();
          chunks = chunkSourceFile(sourceFile, rootDir);
        }
      } else {
        fileContent = await readFile(fp, 'utf8');
        chunks = chunkRawFile(fileContent, fp, rootDir);
      }

      allChunks.push(...chunks);

      logAstParse({
        filePath: fp,
        relativePath,
        chunkCount: chunks.length,
        kindBreakdown: kindBreakdownFor(chunks),
        durationMs: Math.round(performance.now() - t0),
        skipped: false,
      });

      await persistMetadataForFile(fp, rootDir, fileContent);
      await reportProgress({
        relativePath,
        chunksGenerated: chunks.length,
        skipped: false,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      try {
        const fileContent = await readFile(fp, 'utf8');
        const chunks = chunkRawFile(fileContent, fp, rootDir);
        if (chunks.length > 0) {
          allChunks.push(...chunks);
          logAstParse({
            filePath: fp,
            relativePath,
            chunkCount: chunks.length,
            kindBreakdown: kindBreakdownFor(chunks),
            durationMs: Math.round(performance.now() - t0),
            skipped: false,
            error: err instanceof Error ? err.message : String(err),
          });
          await persistMetadataForFile(fp, rootDir, fileContent);
          await reportProgress({
            relativePath,
            chunksGenerated: chunks.length,
            skipped: false,
            durationMs: Math.round(performance.now() - t0),
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      } catch {
        // fall through to skipped log below
      }

      logAstParse({
        filePath: fp,
        relativePath,
        chunkCount: 0,
        kindBreakdown: {},
        durationMs: Math.round(performance.now() - t0),
        skipped: true,
        error: err instanceof Error ? err.message : String(err),
      });
      await reportProgress({
        relativePath,
        chunksGenerated: 0,
        skipped: true,
        durationMs: Math.round(performance.now() - t0),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return allChunks;
}

/**
 * Chunk a single file from its content string (no disk read needed).
 * Useful for indexing in-memory or piping from ripgrep results.
 */
export function chunkFileContent(content: string, filePath: string, rootDir: string): CodeChunk[] {
	const ext = extname(filePath);
  if (!INDEXABLE_SOURCE_EXTENSIONS.has(ext)) return [];
  if (!AST_SOURCE_EXTENSIONS.has(ext)) {
    return chunkRawFile(content, filePath, rootDir);
  }

	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: { allowJs: true, noEmit: true, skipLibCheck: true }
	});

	try {
		const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
		return chunkSourceFile(sourceFile, rootDir);
	} catch {
		return [];
	}
}
