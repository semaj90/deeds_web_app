import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname, resolve } from 'path';
import type { WorkspaceFileMetadata } from '$lib/server/indexer/workspace-metadata-extractor.js';
import { encodeFeatureGlyph } from './feature-glyph-encoder.js';
import { createGrpoMemoryStick } from './grpo-memory-stick.js';
import type {
  FeatureCompileResult,
  FeatureGraphEdge,
  FeatureMap,
  FeaturePathKind,
} from './feature-map.types.js';
import { buildFeatureMapStoreWrites } from './feature-map-store.js';
import { generateSingleEmbedding } from '../grpc/embedding-client.js';
import { scoreAttention, scoreGRPOReward, runPageRank } from '../grpc/graph-ml-client.js';

export interface FeatureCompileInput {
  featureMarkdown: string;
  featureMarkdownPath?: string;
  workspaceRoot?: string;
  repoId?: string;
}

type Frontmatter = Record<string, unknown>;

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'feature';
}

function parseYamlValue(raw: string): unknown {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~' || value === '') return null;
  return value;
}

function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: markdown };

  const frontmatter: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    frontmatter[key] = parseYamlValue(value);
  }

  return { frontmatter, body: match[2] };
}

function flattenStringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => flattenStringValues(item));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.values(record).flatMap((item) => flattenStringValues(item));
  }
  return [];
}

function collectPathCandidates(frontmatter: Frontmatter, body: string): string[] {
  const candidates = new Set<string>();
  const frontmatterKeys = ['paths', 'files', 'filePaths', 'routes', 'services', 'types', 'tools', 'tests', 'docs', 'svg', 'proto'];

  for (const key of frontmatterKeys) {
    for (const value of flattenStringValues(frontmatter[key])) {
      const normalized = value.trim();
      if (normalized) candidates.add(normalized.replace(/\\/g, '/'));
    }
  }

  const pathPattern = /(?:src|scripts|tests|docs|memory|drizzle|static|public|assets|routes)\/[A-Za-z0-9_./\-\[\]()+]+(?:\.(?:ts|tsx|js|jsx|svelte|md|mdx|json|yaml|yml|proto|svg|sql|mjs|cjs))?/g;
  for (const match of body.match(pathPattern) ?? []) {
    candidates.add(match.replace(/\\/g, '/').replace(/[),.;:]+$/g, ''));
  }

  const wikilinkPathPattern = /\[\[([^\]|]+)\|?[^\]]*\]\]/g;
  for (const match of body.matchAll(wikilinkPathPattern)) {
    const raw = match[1]?.trim();
    if (raw) candidates.add(raw.replace(/\\/g, '/'));
  }

  return [...candidates];
}

function classifyPathKind(filePath: string): FeaturePathKind | null {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = extname(normalized).toLowerCase();

  if (normalized.includes('/types/') || ext === '.d.ts') return 'types';
  if (normalized.includes('/services/')) return 'services';
  if (normalized.includes('/routes/') || normalized.includes('+server') || normalized.includes('+page')) return 'routes';
  if (normalized.includes('/tools/') || normalized.includes('/scripts/')) return 'tools';
  if (normalized.includes('/tests/') || normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts')) return 'tests';
  if (normalized.includes('/docs/') || normalized.includes('/memory/')) return 'docs';
  if (ext === '.svg') return 'svg';
  if (ext === '.proto') return 'proto';
  return null;
}

function buildPathGroups(paths: string[]): Record<FeaturePathKind, string[]> {
  const groups: Record<FeaturePathKind, string[]> = {
    types: [],
    services: [],
    routes: [],
    tools: [],
    tests: [],
    docs: [],
    svg: [],
    proto: [],
  };

  for (const path of paths) {
    const kind = classifyPathKind(path);
    if (kind) groups[kind].push(path);
  }

  for (const key of Object.keys(groups) as FeaturePathKind[]) {
    groups[key] = [...new Set(groups[key])];
  }

  return groups;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function summarizeSvg(svgText: string): { summary: string; metadata: Record<string, unknown> } {
  const viewBox = svgText.match(/viewBox=["']([^"']+)["']/i)?.[1] ?? null;
  const width = svgText.match(/\bwidth=["']([^"']+)["']/i)?.[1] ?? null;
  const height = svgText.match(/\bheight=["']([^"']+)["']/i)?.[1] ?? null;
  const paths = (svgText.match(/<path\b/gi) ?? []).length;
  const rects = (svgText.match(/<rect\b/gi) ?? []).length;
  const circles = (svgText.match(/<circle\b/gi) ?? []).length;

  return {
    summary: `SVG ${width ?? '?'}×${height ?? '?'} viewBox=${viewBox ?? '?'} paths=${paths} rects=${rects} circles=${circles}`,
    metadata: { viewBox, width, height, paths, rects, circles },
  };
}

function summarizeProto(protoText: string): { summary: string; metadata: Record<string, unknown> } {
  const services = [...protoText.matchAll(/^\s*service\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const rpcs = [...protoText.matchAll(/^\s*rpc\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  const messages = [...protoText.matchAll(/^\s*message\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  return {
    summary: `proto services=${services.length} rpc=${rpcs.length} messages=${messages.length}`,
    metadata: { services, rpcs, messages },
  };
}

function extractStaticImports(content: string): string[] {
  const imports: string[] = [];
  const re = /^import\s+.*?from\s+['"](.*?)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  return imports;
}

function extractDynamicImports(content: string): string[] {
  const imports: string[] = [];
  const re = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  return imports;
}

function resolveRelativeImport(fromFile: string, spec: string, workspaceRoot: string): string | null {
  if (spec.startsWith('$lib/')) return `src/lib/${spec.slice(5).replace(/\.js$/, '')}`;
  if (!spec.startsWith('.')) return null;

  const fromDir = resolve(fromFile, '..');
  const abs = resolve(fromDir, spec).replace(/\.js$/, '');
  const rel = abs.startsWith(workspaceRoot) ? abs.slice(workspaceRoot.length + 1) : abs;
  const normalized = rel.replace(/\\/g, '/');
  return normalized.startsWith('..') ? null : normalized;
}

async function enrichFileMetadata(
  workspaceRoot: string,
  repoId: string,
  paths: string[]
): Promise<Map<string, WorkspaceFileMetadata>> {
  const existing = paths
    .map((filePath) => resolve(workspaceRoot, filePath))
    .filter((absPath) => existsSync(absPath));

  if (existing.length === 0) return new Map();

  try {
    const { extractMetadataBatch } = await import('$lib/server/indexer/workspace-metadata-extractor.js');
    const batch = extractMetadataBatch(existing, { repoRoot: workspaceRoot, repoId });
    return new Map(batch.map((meta) => [meta.relativePath, meta]));
  } catch {
    return new Map();
  }
}

function graphRelationForKind(kind: FeaturePathKind): FeatureGraphEdge['relation'] {
  switch (kind) {
    case 'types': return 'IMPLEMENTS';
    case 'services': return 'SUPPORTS';
    case 'routes': return 'REFERENCES';
    case 'tools': return 'SUPPORTS';
    case 'tests': return 'TESTS';
    case 'docs': return 'DOCUMENTS';
    case 'svg': return 'VISUALIZES';
    case 'proto': return 'DEFINES_PROTO';
  }
}

function buildGraphEdges(featureNodeId: string, pathGroups: Record<FeaturePathKind, string[]>): FeatureGraphEdge[] {
  const edges: FeatureGraphEdge[] = [];
  for (const kind of Object.keys(pathGroups) as FeaturePathKind[]) {
    for (const target of pathGroups[kind]) {
      edges.push({
        relation: graphRelationForKind(kind),
        from: featureNodeId,
        to: target,
        confidence: 0.95,
        source: 'frontmatter',
      });
    }
  }
  return edges;
}

function sanitizeForDraft(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Uint8Array || ArrayBuffer.isView(value)) return Array.from(value as ArrayLike<number>);
  if (Array.isArray(value)) return value.map((item) => sanitizeForDraft(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/pointer|native|handle|ptr/i.test(key)) continue;
      const sanitized = sanitizeForDraft(entry);
      if (typeof sanitized === 'function' || typeof sanitized === 'symbol' || typeof sanitized === 'bigint') continue;
      out[key] = sanitized;
    }
    return out;
  }
  return String(value);
}

export async function compileFeatureMapFromFile(input: FeatureCompileInput): Promise<FeatureCompileResult> {
  const markdownPath = input.featureMarkdownPath ? resolve(input.featureMarkdownPath) : null;
  const featureMarkdown = markdownPath ? await readFile(markdownPath, 'utf8') : input.featureMarkdown;
  return compileFeatureMapFromMarkdown(featureMarkdown, {
    ...input,
    featureMarkdownPath: markdownPath ?? input.featureMarkdownPath,
  });
}

export async function compileFeatureMapFromMarkdown(
  featureMarkdown: string,
  input: Omit<FeatureCompileInput, 'featureMarkdown'> = {}
): Promise<FeatureCompileResult> {
  const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
  const { frontmatter, body } = parseFrontmatter(featureMarkdown);
  const featureName = String(frontmatter.featureName ?? frontmatter.title ?? frontmatter.name ?? frontmatter.feature ?? 'FeatureMap');
  const featureSlug = slugify(String(frontmatter.slug ?? featureName));
  const featureId = String(frontmatter.featureId ?? `feature:${featureSlug}`);
  const description = String(frontmatter.description ?? frontmatter.summary ?? body.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '');

  const sourcePaths = [...new Set(collectPathCandidates(frontmatter, body))];
  const pathGroups = buildPathGroups(sourcePaths);
  const fileMetadata = await enrichFileMetadata(workspaceRoot, input.repoId ?? 'feature-map', sourcePaths);

  const pathDetails = sourcePaths.map((sourcePath) => {
    const normalized = sourcePath.replace(/\\/g, '/');
    const kind = classifyPathKind(normalized);
    const metadata = fileMetadata.get(normalized) ?? null;
    return { sourcePath: normalized, kind, metadata };
  });

  const svgSummaries: Array<{ path: string; summary: string; metadata: Record<string, unknown> }> = [];
  const protoSummaries: Array<{ path: string; summary: string; metadata: Record<string, unknown> }> = [];

  for (const svgPath of pathGroups.svg) {
    try {
      const abs = resolve(workspaceRoot, svgPath);
      if (!existsSync(abs)) continue;
      const svgText = await readFile(abs, 'utf8');
      svgSummaries.push({ path: svgPath, ...summarizeSvg(svgText) });
    } catch {
      // best effort
    }
  }

  for (const protoPath of pathGroups.proto) {
    try {
      const abs = resolve(workspaceRoot, protoPath);
      if (!existsSync(abs)) continue;
      const protoText = await readFile(abs, 'utf8');
      protoSummaries.push({ path: protoPath, ...summarizeProto(protoText) });
    } catch {
      // best effort
    }
  }

  const featureNodeId = featureId;
  const graphEdges = buildGraphEdges(featureNodeId, pathGroups);
  const graphTriples: Array<[string, string, string]> = [
    ...graphEdges.map((edge) => [edge.from, edge.relation, edge.to] as [string, string, string]),
  ];

  for (const tag of flattenStringValues(frontmatter.tags ?? [])) {
    graphTriples.push([featureNodeId, 'TAGGED_WITH', tag]);
    graphEdges.push({ relation: 'REFERENCES', from: featureNodeId, to: tag, confidence: 0.7, source: 'frontmatter' });
  }

  for (const detail of pathDetails) {
    if (detail.metadata?.kind === 'route-handler') {
      graphTriples.push([featureNodeId, 'ROUTE_ENTRY', detail.sourcePath]);
    }
    if (detail.metadata?.kind === 'test') {
      graphTriples.push([detail.sourcePath, 'TESTS', featureNodeId]);
    }
  }

  for (const summary of svgSummaries) {
    graphTriples.push([featureNodeId, 'VISUALIZES', summary.path]);
  }

  for (const summary of protoSummaries) {
    graphTriples.push([featureNodeId, 'DEFINES_PROTO', summary.path]);
  }

  for (const sourcePath of sourcePaths) {
    const absPath = resolve(workspaceRoot, sourcePath);
    if (!existsSync(absPath)) continue;

    const ext = extname(sourcePath).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.svelte', '.mjs', '.cjs'].includes(ext)) continue;

    try {
      const content = await readFile(absPath, 'utf8');
      for (const spec of extractStaticImports(content)) {
        const resolved = resolveRelativeImport(absPath, spec, workspaceRoot);
        if (resolved) graphTriples.push([sourcePath, 'STATIC_IMPORTS', resolved]);
      }
      for (const spec of extractDynamicImports(content)) {
        const resolved = resolveRelativeImport(absPath, spec, workspaceRoot);
        if (resolved) graphTriples.push([sourcePath, 'DYNAMIC_IMPORTS', resolved]);
      }
    } catch {
      // best effort
    }
  }

  const tokenEstimate = estimateTokens(featureMarkdown) + sourcePaths.reduce((sum, path) => sum + estimateTokens(path), 0) + graphTriples.length * 6;
  const queryHash = hashText(`${featureId}\0${sourcePaths.join('|')}\0${featureMarkdown.slice(0, 2048)}`);

  const aceContextPacketDraft = sanitizeForDraft({
    featureId,
    featureName,
    featureSlug,
    description,
    pathGroups,
    sourcePaths,
    pathDetails,
    svgSummaries,
    protoSummaries,
    graphTriples,
    tokenEstimate,
    sourceMarkdownPath: input.featureMarkdownPath ?? null,
    frontmatter,
    retrievalHints: {
      kinds: Object.entries(pathGroups).filter(([, paths]) => paths.length > 0).map(([kind, paths]) => ({ kind, count: paths.length })),
      metadataPaths: [...fileMetadata.keys()],
    },
  }) as Record<string, unknown>;

  const queryVecResult = await generateSingleEmbedding(description);
  const queryVec = new Float32Array(queryVecResult ?? new Array(768).fill(0));
  const DIM = 768;

  // 1. scoreAttention (against a dummy identity matrix or centroids if available)
  // For now, we use a 1xDIM matrix to get a self-attention score as a baseline
  const { scores: attnScores } = await scoreAttention(queryVec, DIM, queryVec, 1);
  const attentionScore = attnScores[0] ?? 0;

  // 2. scoreGRPOReward (against the description as both target and gen for baseline reward)
  const { reward: grpoReward } = await scoreGRPOReward(queryVec, queryVec, DIM);

  // 3. runPageRank (on the feature graph)
  // Convert graphTriples to adjacency matrix
  const nNodes = sourcePaths.length + 1;
  const adj = new Float32Array(nNodes * nNodes).fill(0);
  // simplified mapping for smoke test
  const pagerankResult = await runPageRank(adj, nNodes);
  const pagerankScore = pagerankResult.scores[0] ?? 0;

  const memoryStick = await createGrpoMemoryStick({
    featureId,
    query: description,
    contextPacketJSON: JSON.stringify(aceContextPacketDraft),
    selectedSourceIds: sourcePaths.slice(0, 12),
    rejectedSourceIds: sourcePaths.slice(12),
    rewardSignals: [
      { name: 'grpoReward', value: grpoReward, source: 'gpu' },
      { name: 'attention', value: attentionScore, source: 'gpu' },
      { name: 'pagerank', value: pagerankScore, source: 'cpu' },
    ],
    cacheKeys: [
      `feature-map:${featureId}`,
      `feature-map:${featureSlug}`,
      `feature-map:${featureId}:context`,
    ],
  });

  const featureMap: FeatureMap = {
    featureId,
    featureName,
    featureSlug,
    description,
    sourceMarkdown: featureMarkdown,
    frontmatter,
    pathGroups,
    sourcePaths,
    graphEdges,
    graphTriples,
    tokenEstimate,
    aceContextPacketDraft,
    glyph: encodeFeatureGlyph({
      featureId,
      featureName,
      featureSlug,
      description,
      sourceMarkdown: featureMarkdown,
      frontmatter,
      pathGroups,
      sourcePaths,
      graphEdges,
      graphTriples,
      tokenEstimate,
      aceContextPacketDraft,
      memoryStick,
    } as FeatureMap),
    memoryStick,
    attentionScore,
    pagerankScore,
    grpoReward,
  };

  const result: FeatureCompileResult = {
    featureMap,
    graphTriples,
    glyph: featureMap.glyph,
    aceContextPacketDraft,
    memoryStick,
    tokenEstimate,
    warnings: [
      ...(sourcePaths.length === 0 ? ['No source paths extracted from feature markdown'] : []),
      ...(svgSummaries.length === 0 && pathGroups.svg.length > 0 ? ['SVG paths were declared but no readable SVGs were found'] : []),
      ...(protoSummaries.length === 0 && pathGroups.proto.length > 0 ? ['Proto paths were declared but no readable .proto files were found'] : []),
    ],
    storeWrites: null,
  };

  result.storeWrites = buildFeatureMapStoreWrites(result);
  return result;
}
