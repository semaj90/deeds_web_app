/**
 * workspace-metadata-extractor.ts
 *
 * Language-agnostic metadata extraction for every file in the workspace.
 *
 * Extraction tiers (fallback chain):
 *   1. ts-morph   — .ts/.tsx/.js/.jsx  (confidence 0.95)
 *   2. heuristic  — All other languages via language-aware regexes (confidence 0.35-0.6)
 *
 * Both tiers populate the same WorkspaceFileMetadata contract.
 * parserConfidence lets downstream logic weight results without branching on parser name.
 *
 * Batch helpers:
 *   extractMetadataBatch(paths, opts)   — sync, returns WorkspaceFileMetadata[]
 *   persistFileFeatureBatch(metas)      — async batch upsert to astFileFeatures table
 */

import { readFileSync, existsSync } from 'fs';
import { extname, relative } from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { db } from '$lib/server/db/client';
import { astFileFeatures } from '$lib/server/db/schema-postgres';
import { sql as drizzleSql } from 'drizzle-orm';

// ── Public contract ──────────────────────────────────────────────────────────

export interface WorkspaceFileMetadata {
  repoId:             string;
  relativePath:       string;
  language:           string | null;
  extension:          string | null;
  kind:               string | null;
  symbol:             string | null;
  astKind:            string | null;
  importCount:        number;
  exportCount:        number;
  functionCount:      number;
  classCount:         number;
  callCount:          number;
  semanticTags:       string[];
  domain:             string | null;
  graphNodeCount:     number;
  graphEdgeCount:     number;
  parser:             'ts-morph' | 'tree-sitter' | 'heuristic';
  parserVersion:      string | null;
  parserConfidence:   number;
  extractionWarnings: string[];
  metadata:           Record<string, unknown>;
}

// ── Language / extension maps ────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  '.ts':     'typescript',
  '.tsx':    'typescriptreact',
  '.js':     'javascript',
  '.jsx':    'javascriptreact',
  '.svelte': 'svelte',
  '.py':     'python',
  '.go':     'go',
  '.rs':     'rust',
  '.java':   'java',
  '.kt':     'kotlin',
  '.cs':     'csharp',
  '.cpp':    'cpp',
  '.c':      'c',
  '.h':      'c',
  '.hpp':    'cpp',
  '.rb':     'ruby',
  '.php':    'php',
  '.swift':  'swift',
  '.sql':    'sql',
  '.graphql':'graphql',
  '.gql':    'graphql',
  '.proto':  'protobuf',
  '.yaml':   'yaml',
  '.yml':    'yaml',
  '.json':   'json',
  '.toml':   'toml',
  '.sh':     'shell',
  '.bash':   'shell',
  '.ps1':    'powershell',
  '.md':     'markdown',
  '.mdx':    'markdown',
};

const TS_MORPH_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// ── Domain / kind / tag detection ────────────────────────────────────────────

function detectDomain(relPath: string): string | null {
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('routes/api/'))       return 'api';
  if (p.includes('routes/'))           return 'ui';
  if (p.includes('lib/server/'))       return 'server';
  if (p.includes('lib/ai/'))           return 'ai';
  if (p.includes('lib/stores'))        return 'state';
  if (p.includes('lib/components/'))   return 'component';
  if (p.includes('tests/') || p.includes('__tests__') || p.includes('.test.') || p.includes('.spec.')) return 'test';
  if (p.includes('drizzle/') || p.includes('migrations/')) return 'migration';
  if (p.includes('scripts/'))          return 'tooling';
  if (p.includes('mcp/') || p.includes('fastmcp')) return 'mcp';
  return null;
}

function detectFileKind(relPath: string, ext: string, content: string): string {
  const p = relPath.replace(/\\/g, '/');
  if (p.endsWith('+server.ts') || p.endsWith('+server.js'))    return 'route-handler';
  if (p.endsWith('+page.server.ts') || p.endsWith('+page.server.js')) return 'page-server';
  if (p.endsWith('+page.svelte'))                              return 'page-component';
  if (p.endsWith('+layout.svelte'))                            return 'layout-component';
  if (p.endsWith('.test.ts') || p.endsWith('.spec.ts') ||
      p.endsWith('.test.js') || p.endsWith('.spec.js'))        return 'test';
  if (ext === '.svelte')                                       return 'component';
  if (p.includes('schema') && (ext === '.ts' || ext === '.sql')) return 'schema';
  if (p.includes('migration') || p.includes('drizzle/'))       return 'migration';
  if (p.includes('store') && ext === '.svelte.ts')             return 'store';
  if (p.includes('worker') || content.includes('self.postMessage')) return 'worker';
  if (ext === '.sql')                                          return 'sql';
  if (ext === '.proto')                                        return 'proto';
  if (ext === '.graphql' || ext === '.gql')                    return 'graphql';
  if (p.includes('lib/server/'))                               return 'server-lib';
  if (p.includes('lib/'))                                      return 'lib';
  return 'module';
}

// ── Semantic tag builder ─────────────────────────────────────────────────────
//
// Tags are normalized and boring — language, framework, role.
// TS-specific richness goes inside metadata.ast_features, not here.

const FRAMEWORK_PATTERNS: Array<[RegExp, string]> = [
  [/from ['"]svelte|SvelteKit|sveltekit/i,          'sveltekit'],
  [/from ['"]@sveltejs\/kit/,                        'sveltekit'],
  [/from ['"]bits-ui/,                               'bits-ui'],
  [/from ['"]drizzle-orm/,                           'drizzle'],
  [/import.*drizzle/,                                'drizzle'],
  [/from ['"]ioredis|from ['"]redis/,                'redis'],
  [/from ['"]amqplib|RabbitMQ/i,                     'rabbitmq'],
  [/from ['"]qdrant/i,                               'qdrant'],
  [/from ['"]xstate/,                                'xstate'],
  [/from ['"]fuse\.js/i,                             'fuse'],
  [/from ['"]zod/,                                   'zod'],
  [/superValidate|sveltekit-superforms/,             'superforms'],
  [/from ['"]ollama/i,                               'ollama'],
  [/from ['"]@anthropic|anthropic-sdk/i,             'anthropic'],
  [/from ['"]openai/,                                'openai'],
  [/fastapi|uvicorn/i,                               'fastapi'],
  [/from ['"]express/,                               'express'],
  [/from ['"]hono/,                                  'hono'],
  [/from ['"]ts-morph/,                              'ts-morph'],
  [/from ['"]lokijs|from ['"]loki/i,                 'lokijs'],
  [/onnxruntime|ort\./,                              'onnx'],
  [/from ['"]pg['"]|node-postgres/,                  'postgres'],
  [/from ['"]minio/i,                                'minio'],
  [/pgvector|vector_cosine/,                         'pgvector'],
];

const ROLE_PATTERNS: Array<[RegExp, string]> = [
  [/export\s+(const\s+)?(GET|POST|PUT|PATCH|DELETE)\s*=/,     'route-handler'],
  [/export\s+(async\s+)?function\s+load\b/,                   'page-loader'],
  [/export\s+(async\s+)?function\s+actions\b/,                'form-action'],
  [/db\.(select|insert|update|delete|execute)\b/,             'db-query'],
  [/drizzle\(|pgTable\b|mysqlTable\b/,                        'schema'],
  [/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i,              'migration'],
  [/\bvitest\b|\bdescribe\b|\btest\b|\bit\(['"`]/,             'test'],
  [/new\s+Worker\(|self\.postMessage/,                        'worker'],
  [/StreamingTextResponse|createEventStream|text\/event-stream/, 'sse'],
  [/getRedis\(\)|redis\.set\b|redis\.get\b/,                  'cache-layer'],
  [/qdrant|qdrantMgr|QdrantClient/i,                          'vector-search'],
  [/embed\(|getEmbedding|ollamaEmbed/i,                       'embedding'],
  [/\$state\(|\$derived\(|\$effect\(/,                        'runes'],
  [/export\s+default\s+class\b|class\s+\w+\s+extends/,        'class-module'],
];

function extractSemanticTags(relPath: string, content: string, lang: string | null, kind: string | null): string[] {
  const tags = new Set<string>();

  // language tag
  if (lang) tags.add(lang);

  // role tags from kind
  if (kind) tags.add(kind);

  // framework tags from content
  for (const [re, tag] of FRAMEWORK_PATTERNS) {
    if (re.test(content)) tags.add(tag);
  }

  // role tags from content patterns
  for (const [re, tag] of ROLE_PATTERNS) {
    if (re.test(content)) tags.add(tag);
  }

  // path-based role hints
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('routes/api/'))  tags.add('api');
  if (p.includes('lib/server/'))  tags.add('server');
  if (p.includes('tests/'))       tags.add('test');
  if (p.includes('drizzle/'))     tags.add('migration');
  if (p.includes('mcp/'))         tags.add('mcp');
  if (p.includes('scratch/'))     tags.add('scratch');

  return [...tags];
}

// ── ts-morph extractor ────────────────────────────────────────────────────────
// Uses an in-memory Project per call. Fast enough for incremental indexing;
// do not run on every hot-path request.

interface TsMorphFeatures {
  importCount:   number;
  exportCount:   number;
  functionCount: number;
  classCount:    number;
  callCount:     number;
  primarySymbol: string | null;
  primaryKind:   string;
  exportedSymbols: string[];
  hasRouteHandlers: boolean;
  hasDbAccess:    boolean;
  hasTryCatch:    boolean;
}

function extractTsMorphFeatures(code: string, virtualPath: string): TsMorphFeatures {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: 1 as any },
  });
  const sf = project.createSourceFile(virtualPath, code, { overwrite: true });

  const fns = sf.getFunctions();
  const exportedDecls = sf.getExportedDeclarations();
  const exportedSymbols = [...exportedDecls.keys()].slice(0, 20);

  const hasRouteHandlers = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].some(
    (m) => exportedDecls.has(m)
  );

  const bodyText = code;
  const hasDbAccess = /\bdb\.(select|insert|update|delete|execute)\b/.test(bodyText);
  const hasTryCatch = sf.getDescendantsOfKind(SyntaxKind.TryStatement).length > 0;

  return {
    importCount:     sf.getImportDeclarations().length,
    exportCount:     exportedDecls.size,
    functionCount:   fns.length,
    classCount:      sf.getClasses().length,
    callCount:       sf.getDescendantsOfKind(SyntaxKind.CallExpression).length,
    primarySymbol:   fns[0]?.getName() ?? exportedSymbols[0] ?? null,
    primaryKind:     fns.length > 0 ? 'FunctionDeclaration' : (sf.getClasses().length > 0 ? 'ClassDeclaration' : 'Module'),
    exportedSymbols,
    hasRouteHandlers,
    hasDbAccess,
    hasTryCatch,
  };
}

// ── Language-aware heuristic counters ────────────────────────────────────────
// Each language gets its own pattern set. Returns normalized counts
// matching the ts-morph shape so callers don't need to branch.

interface HeuristicFeatures {
  importCount:   number;
  exportCount:   number;
  functionCount: number;
  classCount:    number;
  callCount:     number;
  confidence:    number;
  primarySymbol: string | null;
}

function extractHeuristicFeatures(content: string, ext: string): HeuristicFeatures {
  const lines = content.split('\n');
  let imp = 0, exp = 0, fn = 0, cls = 0, calls = 0;

  switch (ext) {
    case '.py': {
      for (const l of lines) {
        if (/^\s*(import\s|from\s+\S+\s+import)/.test(l)) imp++;
        if (/^(def\s|async\s+def\s)/.test(l))             { fn++; calls++; }
        if (/^class\s/.test(l))                            cls++;
        if (/^(export\s|__all__)/.test(l))                 exp++;
      }
      break;
    }
    case '.go': {
      for (const l of lines) {
        if (/^\s*import\b/.test(l) || /^\t"/.test(l))     imp++;
        if (/^func\s/.test(l))                             fn++;
        if (/^type\s+\w+\s+struct/.test(l))                cls++;
        if (/^func\s+\w+\s*\(/.test(l))                   exp++;
      }
      break;
    }
    case '.rs': {
      for (const l of lines) {
        if (/^\s*use\s/.test(l))                           imp++;
        if (/^\s*pub\s+fn\b/.test(l))                      { fn++; exp++; }
        if (/^\s*fn\s/.test(l) && !/pub/.test(l))         fn++;
        if (/^\s*(pub\s+)?struct\s/.test(l))               cls++;
        if (/^\s*(pub\s+)?impl\s/.test(l))                 cls++;
      }
      break;
    }
    case '.java':
    case '.kt': {
      for (const l of lines) {
        if (/^\s*import\s/.test(l))                        imp++;
        if (/\b(public|private|protected)?\s*(static\s+)?[\w<>]+\s+\w+\s*\(/.test(l)) fn++;
        if (/\b(class|interface|enum)\s/.test(l))          cls++;
        if (/\bpublic\s/.test(l))                          exp++;
      }
      break;
    }
    case '.sql': {
      const upper = content.toUpperCase();
      imp = 0;
      fn  = (upper.match(/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/g) ?? []).length +
            (upper.match(/\bCREATE\s+(OR\s+REPLACE\s+)?PROCEDURE\b/g) ?? []).length;
      cls = (upper.match(/\bCREATE\s+(TABLE|VIEW|MATERIALIZED\s+VIEW)\b/g) ?? []).length;
      calls = (upper.match(/\b(SELECT|INSERT|UPDATE|DELETE|TRUNCATE)\b/g) ?? []).length;
      exp = cls;
      break;
    }
    case '.graphql':
    case '.gql': {
      fn  = (content.match(/\b(type|interface)\s+\w+/g) ?? []).length;
      cls = fn;
      exp = (content.match(/\btype\s+Query\b|\btype\s+Mutation\b/g) ?? []).length;
      break;
    }
    case '.proto': {
      fn  = (content.match(/^\s*rpc\s/gm) ?? []).length;
      cls = (content.match(/^\s*message\s/gm) ?? []).length;
      exp = (content.match(/^\s*service\s/gm) ?? []).length;
      break;
    }
    case '.svelte': {
      // Count <script> block features + rune patterns
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      const script = scriptMatch?.[1] ?? '';
      for (const l of script.split('\n')) {
        if (/\bimport\b/.test(l)) imp++;
        if (/\bexport\b/.test(l)) exp++;
        if (/\bfunction\b/.test(l)) fn++;
        if (/\$state\(|\$derived\(|\$effect\(/.test(l)) fn++;
      }
      // template markers
      calls = (content.match(/\{[^}]+\}/g) ?? []).length;
      break;
    }
    default: {
      // Generic fallback — works for .sh, .yaml, .json, etc.
      for (const l of lines) {
        if (/\bimport\b|\brequire\b|\binclude\b/.test(l)) imp++;
        if (/\bfunction\b|\bfunc\b|\bdef\b/.test(l))     fn++;
        if (/\bclass\b|\bstruct\b|\binterface\b/.test(l)) cls++;
      }
    }
  }

  // First def/fn name as symbol hint
  const symMatch = content.match(
    /\bdef\s+(\w+)|^func\s+(\w+)|^fn\s+(\w+)|^function\s+(\w+)|export\s+function\s+(\w+)/m
  );
  const primarySymbol = symMatch ? (symMatch[1] ?? symMatch[2] ?? symMatch[3] ?? symMatch[4] ?? symMatch[5] ?? null) : null;

  // Confidence: higher for well-known structured languages, lower for markup/config
  const wellKnown = new Set(['.py', '.go', '.rs', '.java', '.kt', '.sql', '.svelte', '.proto', '.graphql', '.gql']);
  const confidence = wellKnown.has(ext) ? 0.55 : 0.35;

  return { importCount: imp, exportCount: exp, functionCount: fn, classCount: cls, callCount: calls, confidence, primarySymbol };
}

// ── Core extractor ────────────────────────────────────────────────────────────

export async function extractMetadata(
  absolutePath: string,
  opts: { repoId?: string; repoRoot: string; content?: string }
): Promise<WorkspaceFileMetadata> {
  const repoId   = opts.repoId ?? 'default';
  const relPath  = relative(opts.repoRoot, absolutePath).replace(/\\/g, '/');
  const ext      = extname(absolutePath).toLowerCase();
  const lang     = EXT_TO_LANG[ext] ?? null;
  const content  = opts.content ?? (existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '');
  const warnings: string[] = [];

  const kind   = detectFileKind(relPath, ext, content);
  const domain = detectDomain(relPath);

  if (TS_MORPH_EXTS.has(ext)) {
    try {
      const f = extractTsMorphFeatures(content, `file${ext}`);
      const tags = extractSemanticTags(relPath, content, lang, kind);
      return {
        repoId, relativePath: relPath, language: lang, extension: ext,
        kind, symbol: f.primarySymbol, astKind: f.primaryKind,
        importCount: f.importCount, exportCount: f.exportCount,
        functionCount: f.functionCount, classCount: f.classCount,
        callCount: f.callCount, semanticTags: tags, domain,
        graphNodeCount: f.functionCount + f.classCount,
        graphEdgeCount: f.importCount + f.callCount,
        parser: 'ts-morph', parserVersion: null, parserConfidence: 0.95,
        extractionWarnings: [],
        metadata: {
          ast_features: {
            hasRouteHandlers: f.hasRouteHandlers,
            hasDbAccess:      f.hasDbAccess,
            hasTryCatch:      f.hasTryCatch,
            exportedSymbols:  f.exportedSymbols,
          },
        },
      };
    } catch (e: any) {
      warnings.push(`ts-morph: ${e.message}`);
    }
  }

  // Heuristic path (all other languages + ts-morph fallback)
  const h    = extractHeuristicFeatures(content, ext);
  const tags = extractSemanticTags(relPath, content, lang, kind);
  return {
    repoId, relativePath: relPath, language: lang, extension: ext,
    kind, symbol: h.primarySymbol, astKind: null,
    importCount: h.importCount, exportCount: h.exportCount,
    functionCount: h.functionCount, classCount: h.classCount,
    callCount: h.callCount, semanticTags: tags, domain,
    graphNodeCount: h.functionCount + h.classCount,
    graphEdgeCount: h.importCount,
    parser: 'heuristic', parserVersion: null, parserConfidence: h.confidence,
    extractionWarnings: warnings,
    metadata: { ast_features: {} },
  };
}

// ── Sync batch extractor ──────────────────────────────────────────────────────
// Called from orchestrate endpoint: synchronous, best-effort (errors are swallowed per file).
// absolutePaths: full absolute paths to process
// Returns metadata array in same order; failures produce minimal placeholder entries.

export function extractMetadataBatch(
  absolutePaths: string[],
  opts: { repoId?: string; repoRoot: string }
): WorkspaceFileMetadata[] {
  const repoId = opts.repoId ?? 'default';
  const results: WorkspaceFileMetadata[] = [];

  for (const absPath of absolutePaths) {
    try {
      const relPath  = relative(opts.repoRoot, absPath).replace(/\\/g, '/');
      const ext      = extname(absPath).toLowerCase();
      const lang     = EXT_TO_LANG[ext] ?? null;
      const content  = existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';
      const kind     = detectFileKind(relPath, ext, content);
      const domain   = detectDomain(relPath);
      const warnings: string[] = [];

      if (TS_MORPH_EXTS.has(ext)) {
        try {
          const f    = extractTsMorphFeatures(content, `file${ext}`);
          const tags = extractSemanticTags(relPath, content, lang, kind);
          results.push({
            repoId, relativePath: relPath, language: lang, extension: ext,
            kind, symbol: f.primarySymbol, astKind: f.primaryKind,
            importCount: f.importCount, exportCount: f.exportCount,
            functionCount: f.functionCount, classCount: f.classCount,
            callCount: f.callCount, semanticTags: tags, domain,
            graphNodeCount: f.functionCount + f.classCount,
            graphEdgeCount: f.importCount + f.callCount,
            parser: 'ts-morph', parserVersion: null, parserConfidence: 0.95,
            extractionWarnings: [],
            metadata: {
              ast_features: {
                hasRouteHandlers: f.hasRouteHandlers,
                hasDbAccess:      f.hasDbAccess,
                hasTryCatch:      f.hasTryCatch,
                exportedSymbols:  f.exportedSymbols,
              },
            },
          });
          continue;
        } catch (e: any) {
          warnings.push(`ts-morph: ${e.message}`);
        }
      }

      const h    = extractHeuristicFeatures(content, ext);
      const tags = extractSemanticTags(relPath, content, lang, kind);
      results.push({
        repoId, relativePath: relPath, language: lang, extension: ext,
        kind, symbol: h.primarySymbol, astKind: null,
        importCount: h.importCount, exportCount: h.exportCount,
        functionCount: h.functionCount, classCount: h.classCount,
        callCount: h.callCount, semanticTags: tags, domain,
        graphNodeCount: h.functionCount + h.classCount,
        graphEdgeCount: h.importCount,
        parser: 'heuristic', parserVersion: null, parserConfidence: h.confidence,
        extractionWarnings: warnings,
        metadata: { ast_features: {} },
      });
    } catch {
      // Per-file failure: push minimal placeholder so caller always gets same-length array
      const relPath = relative(opts.repoRoot, absPath).replace(/\\/g, '/');
      results.push({
        repoId, relativePath: relPath, language: null, extension: extname(absPath).toLowerCase(),
        kind: 'module', symbol: null, astKind: null,
        importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, callCount: 0,
        semanticTags: [], domain: null, graphNodeCount: 0, graphEdgeCount: 0,
        parser: 'heuristic', parserVersion: null, parserConfidence: 0,
        extractionWarnings: ['extraction-failed'],
        metadata: {},
      });
    }
  }

  return results;
}

// ── Persist helpers ───────────────────────────────────────────────────────────

export async function persistFileFeature(meta: WorkspaceFileMetadata): Promise<void> {
  await db.insert(astFileFeatures).values({
    repoId: meta.repoId, filePath: meta.relativePath, language: meta.language,
    extension: meta.extension, importCount: meta.importCount, exportCount: meta.exportCount,
    functionCount: meta.functionCount, classCount: meta.classCount, callCount: meta.callCount,
    semanticTags: meta.semanticTags, domain: meta.domain, parser: meta.parser,
    metadata: meta.metadata, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [astFileFeatures.repoId, astFileFeatures.filePath],
    set: {
      language: meta.language, extension: meta.extension,
      importCount: meta.importCount, exportCount: meta.exportCount,
      functionCount: meta.functionCount, classCount: meta.classCount,
      callCount: meta.callCount, semanticTags: meta.semanticTags,
      domain: meta.domain, parser: meta.parser, metadata: meta.metadata,
      updatedAt: drizzleSql`now()`,
    },
  });
}

/**
 * Batch upsert — inserts up to 200 rows at a time to avoid PG parameter limits.
 * Non-blocking errors per chunk are logged and swallowed so one bad row
 * doesn't abort the whole batch.
 */
export async function persistFileFeatureBatch(metas: WorkspaceFileMetadata[]): Promise<void> {
  if (metas.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < metas.length; i += CHUNK) {
    const slice = metas.slice(i, i + CHUNK);
    try {
      await db.insert(astFileFeatures).values(
        slice.map((meta) => ({
          repoId: meta.repoId, filePath: meta.relativePath, language: meta.language,
          extension: meta.extension, importCount: meta.importCount, exportCount: meta.exportCount,
          functionCount: meta.functionCount, classCount: meta.classCount, callCount: meta.callCount,
          semanticTags: meta.semanticTags, domain: meta.domain, parser: meta.parser,
          metadata: meta.metadata, updatedAt: new Date(),
        }))
      ).onConflictDoUpdate({
        target: [astFileFeatures.repoId, astFileFeatures.filePath],
        set: {
          language:      drizzleSql`excluded.language`,
          extension:     drizzleSql`excluded.extension`,
          importCount:   drizzleSql`excluded.import_count`,
          exportCount:   drizzleSql`excluded.export_count`,
          functionCount: drizzleSql`excluded.function_count`,
          classCount:    drizzleSql`excluded.class_count`,
          callCount:     drizzleSql`excluded.call_count`,
          semanticTags:  drizzleSql`excluded.semantic_tags`,
          domain:        drizzleSql`excluded.domain`,
          parser:        drizzleSql`excluded.parser`,
          metadata:      drizzleSql`excluded.metadata`,
          updatedAt:     drizzleSql`now()`,
        },
      });
    } catch (err) {
      console.warn(`[workspace-metadata-extractor] batch upsert failed for chunk ${i}-${i + slice.length}:`, (err as Error).message);
    }
  }
}
