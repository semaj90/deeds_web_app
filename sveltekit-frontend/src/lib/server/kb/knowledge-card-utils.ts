import { createHash } from 'node:crypto';
import { knowledgeCardSchema, type KnowledgeCard, type KnowledgeCardConfidence } from './knowledge-card-schema.js';

function toPosixPath(value: string): string {
  return String(value).replace(/\\/g, '/');
}

export function uniqueStrings(values: unknown, limit = 12): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, limit);
}

export function shortHash(payload: string): string {
  return createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

export function buildKnowledgeCardId(domain: KnowledgeCard['domain'], sourceId: string, sourceHash: string): string {
  return `card:${domain}:${sourceId}:${sourceHash}`;
}

export function estimateKnowledgeCardConfidence(card: {
  summary?: string;
  tags?: string[];
  graph_neighbors?: string[];
  source_path?: string;
}): KnowledgeCardConfidence {
  const hasSummary = Boolean(card.summary?.trim());
  const hasTags = (card.tags?.length ?? 0) > 0;
  const hasNeighbors = (card.graph_neighbors?.length ?? 0) > 0;

  if (hasSummary && hasTags && hasNeighbors) return 'high';
  if (hasSummary || hasTags) return 'medium';
  return 'low';
}

export function buildKnowledgeCardSearchText(card: {
  source_id: string;
  kind: string;
  tags: string[];
  summary: string;
  title: string;
  domain?: string;
  source_path?: string;
  zone?: string;
  line_count?: number;
  risk_score?: number;
  fan_in?: number;
  fan_out?: number;
}): string {
  const extras: string[] = [];
  if (typeof card.domain === 'string') extras.push(card.domain);
  if (typeof card.source_path === 'string') extras.push(card.source_path);
  if (typeof card.zone === 'string') extras.push(card.zone);
  if (typeof card.line_count === 'number') extras.push(`lines ${card.line_count}`);
  if (typeof card.risk_score === 'number') extras.push(`risk ${card.risk_score.toFixed(3)}`);
  if (typeof card.fan_in === 'number' || typeof card.fan_out === 'number') extras.push(`deg ${(card.fan_in ?? 0)}/${(card.fan_out ?? 0)}`);
  return [
    card.title,
    card.source_id,
    card.kind,
    uniqueStrings(card.tags, 12).join(' '),
    card.summary,
    extras.join(' '),
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' | ');
}

export function buildKnowledgeCardContextText(card: KnowledgeCard & Record<string, unknown>): string {
  const lines = [
    `NODE ${card.title}`,
    `domain=${card.domain} kind=${card.kind}`,
    `source_id=${card.source_id}`,
    `hash=${card.source_hash}`,
    `tags=${uniqueStrings(card.tags, 12).join(',') || 'none'}`,
  ];

  if (typeof card.source_path === 'string' && card.source_path) lines.push(`path=${card.source_path}`);
  if (typeof card.zone === 'string' && card.zone) lines.push(`zone=${card.zone}`);
  if (typeof card.line_count === 'number') lines.push(`lines=${card.line_count}`);
  if (typeof card.risk_score === 'number') lines.push(`risk=${card.risk_score.toFixed(3)}`);
  if (typeof card.fan_in === 'number' || typeof card.fan_out === 'number') lines.push(`fan=in:${card.fan_in ?? 0} out:${card.fan_out ?? 0}`);
  if (Array.isArray(card.exports) && card.exports.length > 0) lines.push(`exports=${uniqueStrings(card.exports, 12).join(',')}`);
  if (typeof card.has_auth === 'boolean' || typeof card.has_zod === 'boolean') {
    lines.push(`guards auth=${card.has_auth ? 'true' : 'false'} zod=${card.has_zod ? 'true' : 'false'}`);
  }
  if (Array.isArray(card.graph_neighbors) && card.graph_neighbors.length > 0) {
    lines.push(`neighbors=${uniqueStrings(card.graph_neighbors, 8).join(', ')}`);
  }
  if (Array.isArray(card.citations) && card.citations.length > 0) {
    lines.push(`citations=${uniqueStrings(card.citations, 8).join(', ')}`);
  }
  if (Array.isArray(card.evidence_ids) && card.evidence_ids.length > 0) {
    lines.push(`evidence=${uniqueStrings(card.evidence_ids, 8).join(', ')}`);
  }
  if (card.summary) lines.push(`summary=${card.summary}`);
  return lines.join('\n');
}

export function normalizeKnowledgeCard(card: unknown): KnowledgeCard {
  return knowledgeCardSchema.parse(card);
}

export function buildCodebaseKnowledgeCard(input: {
  source_path?: string;
  file_path?: string;
  filePath?: string;
  rel?: string;
  kind?: string;
  zone?: string;
  tags?: string[];
  hash?: string;
  stable_key?: string;
  summary?: string;
  lineCount?: number;
  line_count?: number;
  fanIn?: number;
  fanOut?: number;
  directFanIn?: number;
  directFanOut?: number;
  exports?: string[];
  neighbors?: string[];
  imports?: string[];
  dynImports?: string[];
  reExports?: string[];
  components?: string[];
  hasAuth?: boolean;
  hasZod?: boolean;
  riskScore?: number;
}): KnowledgeCard & Record<string, unknown> {
  const sourcePath = toPosixPath(String(input.source_path ?? input.file_path ?? input.filePath ?? input.rel ?? '').trim());
  const sourceHash = String(input.hash ?? input.stable_key ?? shortHash(JSON.stringify(input))).slice(0, 12);
  const title = sourcePath || 'codebase-node';
  const kind = String(input.kind ?? 'module').trim() || 'module';
  const tags = uniqueStrings(input.tags, 12);
  const summary = String(input.summary ?? '').trim();
  const fanIn = Number(input.fanIn ?? input.directFanIn ?? 0) || 0;
  const fanOut = Number(input.fanOut ?? input.directFanOut ?? 0) || 0;
  const lineCount = Number(input.lineCount ?? input.line_count ?? 0) || 0;
  const graphNeighbors = uniqueStrings(
    [
      ...(Array.isArray(input.neighbors) ? input.neighbors : []),
      ...(Array.isArray(input.imports) ? input.imports : []),
      ...(Array.isArray(input.dynImports) ? input.dynImports : []),
      ...(Array.isArray(input.reExports) ? input.reExports : []),
      ...(Array.isArray(input.components) ? input.components : []),
    ],
    8,
  );
  const riskScore = typeof input.riskScore === 'number' ? Number(input.riskScore.toFixed(3)) : 0;
  const draft = {
    card_id: buildKnowledgeCardId('codebase', sourcePath || title, sourceHash),
    domain: 'codebase' as const,
    source_id: sourcePath || title,
    source_path: sourcePath || undefined,
    source_hash: sourceHash,
    title,
    kind,
    tags,
    summary,
    citations: [] as string[],
    evidence_ids: [] as string[],
    graph_neighbors: graphNeighbors,
    confidence: estimateKnowledgeCardConfidence({ summary, tags, graph_neighbors: graphNeighbors, source_path: sourcePath }),
    status: 'active' as const,
    updated_at: new Date().toISOString(),
    zone: input.zone ?? undefined,
    hash: sourceHash,
    line_count: lineCount,
    fan_in: fanIn,
    fan_out: fanOut,
    exports: uniqueStrings(input.exports, 12),
    risk_score: riskScore,
    has_auth: Boolean(input.hasAuth),
    has_zod: Boolean(input.hasZod),
    neighbors: graphNeighbors,
  };

  const search_text = buildKnowledgeCardSearchText(draft);
  const context_text = buildKnowledgeCardContextText({
    ...draft,
    search_text,
    context_text: '',
  } as KnowledgeCard & Record<string, unknown>);
  const base = knowledgeCardSchema.parse({
    ...draft,
    search_text,
    context_text,
  });

  return {
    ...base,
    zone: input.zone ?? undefined,
    hash: sourceHash,
    line_count: lineCount,
    fan_in: fanIn,
    fan_out: fanOut,
    exports: uniqueStrings(input.exports, 12),
    graph_neighbors: graphNeighbors,
    neighbors: graphNeighbors,
    risk_score: riskScore,
    has_auth: Boolean(input.hasAuth),
    has_zod: Boolean(input.hasZod),
  };
}
