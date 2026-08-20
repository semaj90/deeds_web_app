import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  CodeAssetDomainSchema,
  CodeAssetGraphV1Schema,
  CodeAssetKindSchema,
  normalizeCodeAssetSourceRef,
  type CodeAssetDomain,
  type CodeAssetGraphV1,
  type CodeAssetNodeV1,
} from './code-asset-graph.js';

export const CodeArchaeologyTaskKindSchema = z.enum([
  'NEW_FILE',
  'REPAIR',
  'REFACTOR_PROPOSAL',
  'OWNER_DISCOVERY',
]);
export type CodeArchaeologyTaskKind = z.infer<typeof CodeArchaeologyTaskKindSchema>;

export const CodeArchaeologyQueryV1Schema = z.object({
  schema: z.literal('atlas.code-archaeology-query.v1'),
  taskKind: CodeArchaeologyTaskKindSchema,
  queryText: z.string().trim().min(1).max(8192),
  desiredDomains: z.array(CodeAssetDomainSchema).max(32),
  desiredKinds: z.array(CodeAssetKindSchema).max(32),
  seedSourceRefs: z.array(z.string().min(1)).max(64),
  maxAssets: z.number().int().positive().max(512),
  graphHopBonusDepth: z.number().int().min(0).max(4),
  workspaceRevision: z.string().min(1),
  queryRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type CodeArchaeologyQueryV1 = z.infer<typeof CodeArchaeologyQueryV1Schema>;

export const RankedCodeAssetEvidenceV1Schema = z.object({
  assetId: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRef: z.string().min(1),
  kind: CodeAssetKindSchema,
  name: z.string().min(1),
  qualifiedName: z.string().min(1),
  domains: z.array(CodeAssetDomainSchema).min(1),
  scoreMilli: z.number().int(),
  rank: z.number().int().positive(),
  graphDistanceFromSeed: z.number().int().nonnegative().nullable(),
  reasons: z.array(z.string().min(1)).min(1),
  evidenceRef: z.string().min(1),
  exactSourceHydrationRequired: z.literal(true),
}).strict();
export type RankedCodeAssetEvidenceV1 = z.infer<typeof RankedCodeAssetEvidenceV1Schema>;

export const CodeSynthesisEvidencePackV1Schema = z.object({
  schema: z.literal('atlas.code-synthesis-evidence-pack.v1'),
  packId: z.string().regex(/^[a-f0-9]{64}$/),
  graphId: z.string().regex(/^[a-f0-9]{64}$/),
  taskKind: CodeArchaeologyTaskKindSchema,
  queryRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  assets: z.array(RankedCodeAssetEvidenceV1Schema),
  sourceRefs: z.array(z.string().min(1)),
  domainCoverage: z.array(CodeAssetDomainSchema),
  ace: z.object({
    candidatePacketKeys: z.array(z.string().min(1)),
    sourceRefs: z.array(z.string().min(1)),
    cacheIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    contextRole: z.literal('CODE_ARCHAEOLOGY_EVIDENCE'),
  }).strict(),
  rlm: z.object({
    inspectSourceRefs: z.array(z.string().min(1)),
    inspectAssetIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
    maxDepthHint: z.number().int().nonnegative(),
  }).strict(),
  acceleratorHints: z.object({
    turbovecCandidate: z.boolean(),
    diskannCandidate: z.boolean(),
    cuvsCandidate: z.boolean(),
    cugraphCandidate: z.boolean(),
    cudaGraphReplayCandidate: z.boolean(),
  }).strict(),
  invariants: z.object({
    originalsPreserved: z.literal(true),
    directSourceCopyAuthorized: z.literal(false),
    exactSourceHydrationRequired: z.literal(true),
    compilerOrLspValidationRequired: z.literal(true),
    mutationDagAuthorizationRequired: z.literal(true),
    canonicalWritesAllowed: z.literal(false),
    logicalLaneVoteAdded: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type CodeSynthesisEvidencePackV1 = z.infer<typeof CodeSynthesisEvidencePackV1Schema>;

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

function tokens(value: string): string[] {
  return [...new Set(value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2))];
}

function tokenOverlapPermille(query: readonly string[], asset: readonly string[]): number {
  if (query.length === 0 || asset.length === 0) return 0;
  const q = new Set(query);
  const a = new Set(asset);
  let intersection = 0;
  for (const token of q) if (a.has(token)) intersection += 1;
  const union = new Set([...q, ...a]).size;
  return union === 0 ? 0 : Math.floor((intersection * 1000) / union);
}

function buildUndirectedAdjacency(graph: CodeAssetGraphV1): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const left = map.get(edge.fromAssetId) ?? new Set<string>();
    const right = map.get(edge.toAssetId) ?? new Set<string>();
    left.add(edge.toAssetId);
    right.add(edge.fromAssetId);
    map.set(edge.fromAssetId, left);
    map.set(edge.toAssetId, right);
  }
  return new Map([...map.entries()].map(([key, value]) => [key, [...value].sort()]));
}

function seedDistances(graph: CodeAssetGraphV1, seedSourceRefs: readonly string[], maxDepth: number): Map<string, number> {
  if (maxDepth <= 0 || seedSourceRefs.length === 0) return new Map();
  const wanted = new Set(seedSourceRefs.map(normalizeCodeAssetSourceRef));
  const seeds = graph.nodes.filter((node) => wanted.has(normalizeCodeAssetSourceRef(node.sourceRef))).map((node) => node.assetId);
  if (seeds.length === 0) return new Map();

  const adjacency = buildUndirectedAdjacency(graph);
  const distance = new Map<string, number>();
  let frontier = [...new Set(seeds)].sort();
  for (const seed of frontier) distance.set(seed, 0);
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const assetId of frontier) {
      for (const neighbor of adjacency.get(assetId) ?? []) {
        if (distance.has(neighbor)) continue;
        distance.set(neighbor, depth + 1);
        next.push(neighbor);
      }
    }
    frontier = [...new Set(next)].sort();
  }
  return distance;
}

function evidenceRef(node: CodeAssetNodeV1): string {
  if (!node.span) return node.sourceRef;
  return `${node.sourceRef}#L${node.span.startLine}-L${node.span.endLine}`;
}

function scoreNode(input: {
  node: CodeAssetNodeV1;
  query: CodeArchaeologyQueryV1;
  queryTokens: readonly string[];
  seedDistance: number | null;
}): { scoreMilli: number; reasons: string[] } {
  const { node, query, queryTokens, seedDistance } = input;
  const reasons: string[] = [];
  const desiredDomains = new Set(query.desiredDomains);
  const domainMatches = node.domains.filter((domain) => desiredDomains.has(domain));
  const kindMatch = query.desiredKinds.length === 0 || query.desiredKinds.includes(node.kind);
  const lexical = tokenOverlapPermille(queryTokens, tokens(`${node.name} ${node.qualifiedName} ${node.signature} ${node.domains.join(' ')}`));
  let scoreMilli = lexical * 2;

  if (domainMatches.length > 0) {
    scoreMilli += Math.min(3000, domainMatches.length * 750);
    reasons.push(`DOMAIN_MATCH:${domainMatches.join(',')}`);
  }
  if (kindMatch) {
    scoreMilli += query.desiredKinds.length > 0 ? 800 : 100;
    if (query.desiredKinds.length > 0) reasons.push(`KIND_MATCH:${node.kind}`);
  } else {
    scoreMilli -= 1200;
  }
  if (node.exported) {
    scoreMilli += 250;
    reasons.push('EXPORTED_OWNER');
  }
  if (node.reusableForNewFileCreation && query.taskKind === 'NEW_FILE') {
    scoreMilli += 900;
    reasons.push('REUSABLE_FOR_NEW_FILE');
  }
  if (node.repairEvidenceCandidate && query.taskKind === 'REPAIR') {
    scoreMilli += 1100;
    reasons.push('REPAIR_EVIDENCE_CANDIDATE');
  }
  if (query.seedSourceRefs.some((ref) => normalizeCodeAssetSourceRef(ref) === normalizeCodeAssetSourceRef(node.sourceRef))) {
    scoreMilli += 4000;
    reasons.push('EXACT_SEED_SOURCE_REF');
  }
  if (seedDistance !== null) {
    scoreMilli += Math.max(0, 1800 - seedDistance * 450);
    reasons.push(`GRAPH_DISTANCE:${seedDistance}`);
  }
  if (lexical > 0) reasons.push(`TOKEN_OVERLAP_PERMILLE:${lexical}`);
  if (reasons.length === 0) reasons.push('LOW_SIGNAL_ARCHAEOLOGY_CANDIDATE');
  return { scoreMilli, reasons };
}

export function selectCodeSynthesisEvidence(input: {
  graph: CodeAssetGraphV1;
  query: CodeArchaeologyQueryV1;
}): CodeSynthesisEvidencePackV1 {
  const graph = CodeAssetGraphV1Schema.parse(input.graph);
  const query = CodeArchaeologyQueryV1Schema.parse(input.query);
  if (query.workspaceRevision !== graph.workspaceRevision && graph.workspaceRevision !== 'UNPROVEN_LOCAL_WORKTREE') {
    throw new Error('CODE_ARCHAEOLOGY_WORKSPACE_REVISION_MISMATCH');
  }

  const queryTokens = tokens(query.queryText);
  const distances = seedDistances(graph, query.seedSourceRefs, query.graphHopBonusDepth);
  const scored = graph.nodes.map((node) => {
    const distance = distances.get(node.assetId) ?? null;
    return { node, distance, ...scoreNode({ node, query, queryTokens, seedDistance: distance }) };
  }).sort((a, b) =>
    b.scoreMilli - a.scoreMilli
    || (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER)
    || a.node.sourceRef.localeCompare(b.node.sourceRef)
    || a.node.kind.localeCompare(b.node.kind)
    || a.node.qualifiedName.localeCompare(b.node.qualifiedName)
    || a.node.assetId.localeCompare(b.node.assetId));

  const selected = scored.slice(0, Math.min(query.maxAssets, scored.length));
  const assets = selected.map((row, index) => RankedCodeAssetEvidenceV1Schema.parse({
    assetId: row.node.assetId,
    sourceRef: row.node.sourceRef,
    kind: row.node.kind,
    name: row.node.name,
    qualifiedName: row.node.qualifiedName,
    domains: row.node.domains,
    scoreMilli: row.scoreMilli,
    rank: index + 1,
    graphDistanceFromSeed: row.distance,
    reasons: row.reasons,
    evidenceRef: evidenceRef(row.node),
    exactSourceHydrationRequired: true,
  }));

  const sourceRefs = [...new Set(assets.map((row) => row.sourceRef))];
  const domainCoverage = [...new Set(assets.flatMap((row) => row.domains))] as CodeAssetDomain[];
  const packIdentity = {
    graphId: graph.graphId,
    taskKind: query.taskKind,
    queryRevision: query.queryRevision,
    workspaceRevision: query.workspaceRevision,
    queryText: query.queryText,
    desiredDomains: [...query.desiredDomains].sort(),
    desiredKinds: [...query.desiredKinds].sort(),
    seedSourceRefs: query.seedSourceRefs.map(normalizeCodeAssetSourceRef).sort(),
    assetIds: assets.map((row) => row.assetId),
  };
  const packId = sha256(stableJson(packIdentity));
  const domainSet = new Set(domainCoverage);

  return CodeSynthesisEvidencePackV1Schema.parse({
    schema: 'atlas.code-synthesis-evidence-pack.v1',
    packId,
    graphId: graph.graphId,
    taskKind: query.taskKind,
    queryRevision: query.queryRevision,
    workspaceRevision: query.workspaceRevision,
    assets,
    sourceRefs,
    domainCoverage,
    ace: {
      candidatePacketKeys: assets.map((row) => `code-asset:${row.assetId}`),
      sourceRefs,
      cacheIdentity: sha256(stableJson({ graphId: graph.graphId, packId, queryRevision: query.queryRevision })),
      contextRole: 'CODE_ARCHAEOLOGY_EVIDENCE',
    },
    rlm: {
      inspectSourceRefs: sourceRefs,
      inspectAssetIds: assets.map((row) => row.assetId),
      maxDepthHint: query.graphHopBonusDepth,
    },
    acceleratorHints: {
      turbovecCandidate: domainSet.has('TURBOVEC'),
      diskannCandidate: domainSet.has('DISKANN'),
      cuvsCandidate: domainSet.has('CUVS'),
      cugraphCandidate: domainSet.has('CUGRAPH') || domainSet.has('GRAPH'),
      cudaGraphReplayCandidate: domainSet.has('CUDA') && assets.some((row) => row.domains.includes('DAG')),
    },
    invariants: {
      originalsPreserved: true,
      directSourceCopyAuthorized: false,
      exactSourceHydrationRequired: true,
      compilerOrLspValidationRequired: true,
      mutationDagAuthorizationRequired: true,
      canonicalWritesAllowed: false,
      logicalLaneVoteAdded: false,
    },
    producerRevision: query.producerRevision,
  });
}
