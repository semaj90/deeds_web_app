import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import type { 
  FeatureCompileResult, 
  FeatureMap, 
  FeatureGraphEdge, 
  FeatureGraphRelation 
} from './feature-map.types.js';
import { encodeFeatureGlyph } from './feature-glyph-encoder.js';
import { createGrpoMemoryStick } from './grpo-memory-stick.js';
import { extractSvgMetadata } from './svg-extractor.js';
import { extractProtoMetadata } from './proto-extractor.js';

const DIM = 768;

export type FeatureMapCompileInput = string | {
  featureId?: string;
  featureNotePath: string;
  dryRun?: boolean;
};

/**
 * FeatureMap Compiler — Synthesizes codebase knowledge from markdown notes.
 */
export async function compileFeatureMap(input: FeatureMapCompileInput): Promise<FeatureCompileResult> {
  const warnings: string[] = [];
  const featureNotePath = typeof input === 'string' ? input : input.featureNotePath;
  const requestedFeatureId = typeof input === 'string' ? '' : str(input.featureId);
  const dryRun = typeof input !== 'string' && input.dryRun === true;
  const absPath = resolve(featureNotePath);
  
  if (!existsSync(absPath)) {
    throw new Error(`Feature note not found: ${featureNotePath}`);
  }

  const rawContent = readFileSync(absPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(rawContent);

  const featureId = requestedFeatureId || str(frontmatter.featureId) || str(frontmatter.id) || featureNotePath.split(/[\\/]/).pop()?.replace('.md', '') || 'unknown';
  const title = str(frontmatter.title) || extractH1(body) || featureId;
  const status = (frontmatter.status as any) || 'planning';
  const bodyPaths = extractBacktickedPaths(body);

  // 1. Path discovery from hints
  const paths = {
    featureNote: featureNotePath,
    types: unique([...arr(frontmatter.types), ...bodyPaths.filter(isTypePath)]),
    services: unique([...arr(frontmatter.services), ...bodyPaths.filter(isServicePath)]),
    apiRoutes: unique([...arr(frontmatter.apiRoutes), ...bodyPaths.filter(isRoutePath)]),
    uiComponents: unique([...arr(frontmatter.uiComponents), ...bodyPaths.filter(isComponentPath)]),
    tools: unique([...arr(frontmatter.tools), ...bodyPaths.filter(isToolPath)]),
    tests: unique([...arr(frontmatter.tests), ...bodyPaths.filter(isTestPath)]),
    docs: unique([...arr(frontmatter.docs), ...bodyPaths.filter(isDocPath)]),
    svgDiagrams: unique([...arr(frontmatter.svgDiagrams), ...bodyPaths.filter((p) => p.endsWith('.svg'))]),
    protos: unique([...arr(frontmatter.protos), ...bodyPaths.filter((p) => p.endsWith('.proto'))]),
  };

  // 2. Discover related files via rg if keyword list provided
  const keywords = arr(frontmatter.keywords);
  if (keywords.length > 0) {
    const discovered = discoverFilesByKeywords(keywords);
    // Merge discovered into appropriate path buckets (simplified)
    for (const f of discovered) {
      if (f.includes('/api/')) paths.apiRoutes.push(f);
      else if (f.endsWith('.test.ts') || f.endsWith('.test.js')) paths.tests.push(f);
      else if (f.includes('/lib/server/')) paths.services.push(f);
    }
  }

  // 3. Build Graph Triples & Edges
  const edges: FeatureGraphEdge[] = [];
  
  // Basic path-based edges
  for (const p of paths.services) {
    edges.push({ source: featureId, relation: 'IMPLEMENTS', target: p, confidence: 0.9, sourceKind: 'manual' });
  }
  for (const p of paths.apiRoutes) {
    edges.push({ source: featureId, relation: 'CALLS', target: p, confidence: 0.8, sourceKind: 'manual' });
  }

  // 3b. Extract Metadata and generate edges
  for (const p of paths.svgDiagrams) {
    const meta = extractSvgMetadata(p);
    edges.push({ source: featureId, relation: 'VISUALIZED_BY', target: p, confidence: 0.95, sourceKind: 'svg' });
    for (const label of meta.labels) {
      edges.push({ source: p, relation: 'USES', target: `concept:${label}`, confidence: 0.7, sourceKind: 'llm' });
    }
  }

  for (const p of paths.protos) {
    const meta = extractProtoMetadata(p);
    edges.push({ source: featureId, relation: 'USES_PROTO', target: p, confidence: 0.9, sourceKind: 'proto' });
    for (const msg of meta.messages) {
      edges.push({ source: p, relation: 'EXPORTS_SYMBOL', target: msg, confidence: 0.8, sourceKind: 'ast' });
    }
  }

  // 4. Summaries
  const summaries = {
    short: extractSection(body, 'Summary') || str(frontmatter.summary) || '',
    ace: extractSection(body, 'ACE Context') || undefined,
    svg: extractSection(body, 'SVG Diagram') ? [extractSection(body, 'SVG Diagram')!] : [],
  };

  // 5. Graph-ML Enrichment (placeholder/mock query vector)
  const queryVec = new Float32Array(DIM).fill(0.1); // In real use, embed the summary
  
  let attentionScore = 0;
  let grpoUtility = 0;
  let pagerank = 0;

  try {
    if (dryRun) {
      throw new Error('dryRun=true skipped Graph-ML enrichment');
    }
    const { scoreAttention, scoreGRPOReward, runPageRank } = await import('../grpc/graph-ml-client.js');
    const { scores: attnScores } = await scoreAttention(queryVec, DIM, queryVec, 1);
    attentionScore = attnScores[0] || 0;

    const { reward: grpoReward } = await scoreGRPOReward(queryVec, queryVec, DIM);
    grpoUtility = grpoReward;

    // PageRank mock: normally computed over the whole codebase graph
    const adj = new Float32Array([0, 1, 1, 0]); // 2x2
    const nNodes = 2;
    const pagerankResult = await runPageRank(adj, nNodes);
    pagerank = pagerankResult.scores[0] || 0;
  } catch (err) {
    warnings.push(`Graph-ML enrichment failed: ${(err as Error).message}`);
  }

  // 6. Glyph Generation
  const glyph = encodeFeatureGlyph({
    featureId,
    hasTypes: paths.types.length > 0,
    hasService: paths.services.length > 0,
    hasRoute: paths.apiRoutes.length > 0,
    hasTool: paths.tools.length > 0,
    hasTest: paths.tests.length > 0,
    hasDocs: paths.docs.length > 0,
    hasGraphEdge: edges.length > 0,
    hasCachePacket: false,
  });

  const featureMap: FeatureMap = {
    featureId,
    title,
    status,
    paths,
    graphTriples: edges.map(e => [e.source, e.relation, e.target]),
    edges,
    summaries,
    scores: {
      attentionScore,
      grpoUtility,
      pagerank,
      karpathyBlend: (attentionScore + grpoUtility + pagerank) / 3
    },
    glyph,
    cache: {
      redisKeys: [
        `feature:summary:${featureId}`,
        `feature:glyph:${featureId}`,
        `feature:map:${featureId}`
      ],
      bitfrostKeys: [`bitfrost:feature:${featureId}`],
      qdrantPointIds: [],
      neo4jNodeIds: []
    }
  };

  const selectedSourceIds = unique([
    ...paths.types,
    ...paths.services,
    ...paths.apiRoutes,
    ...paths.uiComponents,
    ...paths.tools,
    ...paths.tests,
    ...paths.docs,
    ...paths.svgDiagrams,
    ...paths.protos
  ]);
  const rejectedSourceIds = unique([
    ...paths.svgDiagrams.filter((p) => !existsSync(resolve(p))),
    ...paths.protos.filter((p) => !existsSync(resolve(p)))
  ]);
  const contextPacketHash = Buffer.from(`${featureId}:${summaries.short}:${featureMap.graphTriples.length}`)
    .toString('base64url')
    .slice(0, 24);
  const grpoMemoryStick = createGrpoMemoryStick({
    featureId,
    query: summaries.short || title,
    contextPacketHash,
    selectedSourceIds,
    rejectedSourceIds,
    rewardSignals: {},
    scores: {
      attentionScore,
      grpoReward: grpoUtility,
      finalUtility: featureMap.scores?.karpathyBlend
    },
    cacheKeys: {
      redis: featureMap.cache.redisKeys,
      bitfrost: featureMap.cache.bitfrostKeys,
      qdrant: featureMap.cache.qdrantPointIds,
      neo4j: featureMap.cache.neo4jNodeIds
    }
  });

  return {
    featureMap,
    grpoMemoryStick,
    warnings
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  
  const fm: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    fm[key] = parseYamlValue(val);
  }
  return { frontmatter: fm, body: match[2] };
}

function parseYamlValue(val: string): any {
  if (val.startsWith('[') && val.endsWith(']')) {
    return val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val.replace(/^['"]|['"]$/g, '');
}

function extractH1(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractSection(body: string, heading: string): string | null {
  const re = new RegExp(`^#{2,3}\\s+${heading}\\s*$`, 'm');
  const start = body.search(re);
  if (start === -1) return null;
  const afterHeading = body.slice(body.indexOf('\n', start) + 1);
  const nextHeading = afterHeading.search(/^#{2,3}\s+/m);
  return (nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)).trim();
}

function discoverFilesByKeywords(keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  try {
    const pattern = keywords.join('|');
    const output = execSync(`rg -l "${pattern}" src`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function str(v: any): string { return v ? String(v).trim() : ''; }
function arr(v: any): string[] { return Array.isArray(v) ? v.map(String) : []; }
function unique(values: string[]): string[] { return Array.from(new Set(values.filter(Boolean))); }

function extractBacktickedPaths(body: string): string[] {
  const paths: string[] = [];
  for (const match of body.matchAll(/`([^`]+)`/g)) {
    const value = match[1].trim();
    if (/^(src|static|proto|docs|documents|scripts|tests)\//.test(value) || /^[A-Za-z]:\//.test(value)) {
      paths.push(value);
    }
  }
  return unique(paths);
}

function isTypePath(path: string): boolean { return path.endsWith('.d.ts') || path.includes('.types.'); }
function isServicePath(path: string): boolean { return path.includes('/lib/server/') && !isTypePath(path); }
function isRoutePath(path: string): boolean { return path.includes('/routes/') || path.includes('/api/'); }
function isComponentPath(path: string): boolean { return path.endsWith('.svelte') || path.includes('/components/'); }
function isToolPath(path: string): boolean { return path.includes('/tools/') || path.includes('/mcp/'); }
function isTestPath(path: string): boolean { return path.includes('/tests/') || /\.test\.[cm]?[tj]s$|\.spec\.[cm]?[tj]s$/.test(path); }
function isDocPath(path: string): boolean { return path.endsWith('.md') && (path.startsWith('docs/') || path.startsWith('documents/')); }
