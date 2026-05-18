import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCommunityContext, getDirectoryKAGContext, resolveAgentsMdQuickHit } from '$lib/server/graph/community-graph.js';
import { searchNotecards } from '$lib/server/kb/search-logic.js';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ACTIVITY_LOG_PATH = join(FRONTEND_ROOT, 'logs', 'activity', 'user.activity.jsonl');

export interface ActivityLogEntry {
  timestamp?: string;
  event?: string;
  filePath: string;
  symbols?: string[];
  lane?: string;
}

export interface PrefetchAgentsMdHit {
  source: 'redis' | 'disk';
  resolvedPath: string;
  resolvedKey?: string;
  markdownPreview: string;
  markdownLength: number;
}

export interface PrefetchDirectoryContext {
  dir: string;
  summary: string;
  tags: string[];
  score: number;
  auditScore?: number;
  somBmuRow?: number | null;
  somBmuCol?: number | null;
  scoringMethod?: 'gpu-cosine' | 'keyword';
  agentsMd: PrefetchAgentsMdHit | null;
}

export interface PrefetchCommunityContext {
  id: number;
  purpose: string;
  summary: string;
  tags: string[];
  similarity: number;
}

export interface PrefetchNotecardHit {
  card_id: string;
  source_path: string;
  score: number;
  why: string[];
  context_text: string;
  kind: string;
  tags: string[];
  rank_score?: number;
}

export interface PrefetchKnowledgeDelta {
  filePath: string;
  directory: string;
  symbols: string[];
  recencyScore: number;
  directoryScore: number;
  communityScore: number;
  notecardScore: number;
  deltaScore: number;
  reasons: string[];
  agentsMd: PrefetchAgentsMdHit | null;
}

export interface FeaturePrefetchContextInput {
  path?: string;
  query?: string;
  limit?: number;
  activityLimit?: number;
  includeCommunity?: boolean;
  includeNotecards?: boolean;
  includeAgentsMd?: boolean;
}

export interface FeaturePrefetchContextResult {
  query: string;
  path: string | null;
  generatedAt: string;
  activity: {
    logPath: string;
    totalEntries: number;
    recentFiles: Array<{
      timestamp: string;
      filePath: string;
      directory: string;
      symbols: string[];
      lane?: string;
    }>;
  };
  directoryContexts: PrefetchDirectoryContext[];
  communityContexts: PrefetchCommunityContext[];
  notecardHits: PrefetchNotecardHit[];
  knowledgeDelta: PrefetchKnowledgeDelta[];
  prefetchTargets: Array<{
    path: string;
    kind: 'source' | 'agents-md' | 'notecard';
    score: number;
    reasons: string[];
  }>;
  sourceRefs: string[];
}

function normalizeWorkspacePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function directoryFromPath(value: string): string {
  const normalized = normalizeWorkspacePath(value);
  const directory = posix.dirname(normalized);
  return directory === '.' ? '' : directory;
}

function baseNameFromPath(value: string): string {
  return posix.basename(normalizeWorkspacePath(value));
}

function tailJsonl(filePath: string, lineLimit: number): ActivityLogEntry[] {
  if (!existsSync(filePath)) return [];

  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const recentLines = lines.slice(-Math.max(1, lineLimit));
  const entries: ActivityLogEntry[] = [];

  for (const line of recentLines) {
    try {
      const parsed = JSON.parse(line) as Partial<ActivityLogEntry>;
      if (!parsed || typeof parsed.filePath !== 'string') continue;
      entries.push({
        timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString(),
        event: typeof parsed.event === 'string' ? parsed.event : 'file_edit',
        filePath: normalizeWorkspacePath(parsed.filePath),
        symbols: Array.isArray(parsed.symbols) ? parsed.symbols.filter((symbol): symbol is string => typeof symbol === 'string') : [],
        lane: typeof parsed.lane === 'string' ? parsed.lane : undefined,
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function dedupeRecentActivity(entries: ActivityLogEntry[]): Array<Required<Pick<ActivityLogEntry, 'timestamp' | 'filePath'>> & Pick<ActivityLogEntry, 'symbols' | 'lane'> & { directory: string }> {
  const byPath = new Map<string, ActivityLogEntry>();

  for (const entry of [...entries].reverse()) {
    const normalizedPath = normalizeWorkspacePath(entry.filePath);
    if (!normalizedPath || byPath.has(normalizedPath)) continue;
    byPath.set(normalizedPath, { ...entry, filePath: normalizedPath });
  }

  return Array.from(byPath.values())
    .reverse()
    .map((entry) => ({
      timestamp: entry.timestamp ?? new Date().toISOString(),
      filePath: normalizeWorkspacePath(entry.filePath),
      symbols: Array.isArray(entry.symbols) ? entry.symbols : [],
      lane: entry.lane,
      directory: directoryFromPath(entry.filePath),
    }));
}

function normalizeScore(score: number | undefined): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  if (score <= 1) return Math.max(0, Math.min(1, score));
  return Math.max(0, Math.min(1, score / 100));
}

function summarizeAgentsHit(hit: Awaited<ReturnType<typeof resolveAgentsMdQuickHit>>): PrefetchAgentsMdHit | null {
  if (!hit) return null;

  return {
    source: hit.source,
    resolvedPath: hit.resolvedPath,
    resolvedKey: hit.resolvedKey,
    markdownPreview: hit.markdown.slice(0, 1000),
    markdownLength: hit.markdown.length,
  };
}

function buildSourceRefs(entries: string[]): string[] {
  return Array.from(new Set(entries.filter(Boolean)));
}

export async function buildFeaturePrefetchContext(input: FeaturePrefetchContextInput): Promise<FeaturePrefetchContextResult> {
  const workspacePath = input.path ? normalizeWorkspacePath(input.path) : null;
  const querySeed = [input.query?.trim(), workspacePath, input.path ? baseNameFromPath(input.path) : null]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .trim();

  const activityEntries = dedupeRecentActivity(tailJsonl(ACTIVITY_LOG_PATH, input.activityLimit ?? 24));
  const recentSeedEntries = workspacePath
    ? [...activityEntries, { timestamp: new Date().toISOString(), filePath: workspacePath, directory: directoryFromPath(workspacePath), symbols: [], lane: 'prefetch-input' }]
    : activityEntries;

  const recentUnique = dedupeRecentActivity(recentSeedEntries).slice(0, Math.max(1, input.limit ?? 4));

  const [directoryContextsRaw, communityContextsRaw, notecardHitsRaw] = await Promise.all([
    querySeed
      ? getDirectoryKAGContext(querySeed, Math.max(1, Math.min(8, input.limit ?? 4))).catch(() => [])
      : Promise.resolve([]),
    input.includeCommunity !== false && querySeed
      ? getCommunityContext(querySeed, Math.max(1, Math.min(5, input.limit ?? 4))).catch(() => [])
      : Promise.resolve([]),
    input.includeNotecards !== false && querySeed
      ? searchNotecards({ query: querySeed, limit: Math.max(3, Math.min(12, (input.limit ?? 4) * 3)) }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const directoryContexts: PrefetchDirectoryContext[] = [];
  for (const dirContext of directoryContextsRaw) {
    const agentsHit = input.includeAgentsMd !== false
      ? summarizeAgentsHit(await resolveAgentsMdQuickHit(dirContext.dir).catch(() => null))
      : null;

    directoryContexts.push({
      dir: dirContext.dir,
      summary: dirContext.summary,
      tags: dirContext.tags,
      score: dirContext.score,
      auditScore: dirContext.auditScore,
      somBmuRow: dirContext.somBmuRow ?? null,
      somBmuCol: dirContext.somBmuCol ?? null,
      scoringMethod: dirContext.scoringMethod,
      agentsMd: agentsHit,
    });
  }

  const communityContexts: PrefetchCommunityContext[] = communityContextsRaw.map((community) => ({
    id: community.id,
    purpose: community.purpose,
    summary: community.summary,
    tags: community.tags,
    similarity: community.similarity,
  }));

  const notecardHits: PrefetchNotecardHit[] = notecardHitsRaw.map((hit) => ({
    card_id: hit.card_id,
    source_path: normalizeWorkspacePath(hit.source_path),
    score: hit.score,
    why: hit.why,
    context_text: hit.context_text,
    kind: hit.kind,
    tags: hit.tags,
    rank_score: hit.rank_score,
  }));

  const topCommunityScore = communityContexts[0]?.similarity ?? 0;
  const topDirectoryScore = directoryContexts[0]?.score ?? 0;

  const knowledgeDelta: PrefetchKnowledgeDelta[] = recentUnique.map((entry, index) => {
    const directory = entry.directory;
    const matchedDirectory = directoryContexts.find((context) => normalizeWorkspacePath(context.dir) === directory) ?? directoryContexts[0] ?? null;
    const matchedCommunity = communityContexts[0] ?? null;
    const matchedNotecard = notecardHits.find((hit) => normalizeWorkspacePath(hit.source_path) === entry.filePath)
      ?? notecardHits.find((hit) => directory && normalizeWorkspacePath(hit.source_path).startsWith(directory + '/'))
      ?? null;

    const recencyScore = Math.max(0.35, 1 - index * 0.08);
    const directoryScore = matchedDirectory?.score ?? topDirectoryScore;
    const communityScore = matchedCommunity?.similarity ?? topCommunityScore;
    const notecardScore = normalizeScore(matchedNotecard?.score);
    const contextScore = Math.max(directoryScore, communityScore, notecardScore);
    const deltaScore = Number((1 - Math.min(1, contextScore)).toFixed(3));

    const reasons = [
      'recent edit',
      `recency=${recencyScore.toFixed(2)}`,
    ];
    if (matchedDirectory) {
      reasons.push(`directory=${matchedDirectory.dir}`);
      reasons.push(`som=${matchedDirectory.somBmuRow ?? 'n/a'},${matchedDirectory.somBmuCol ?? 'n/a'}`);
    }
    if (matchedCommunity) {
      reasons.push(`community=${matchedCommunity.id}`);
      reasons.push(`communitySimilarity=${matchedCommunity.similarity.toFixed(3)}`);
    }
    if (matchedNotecard) {
      reasons.push(`notecard=${matchedNotecard.source_path}`);
    }

    return {
      filePath: entry.filePath,
      directory,
      symbols: entry.symbols ?? [],
      recencyScore,
      directoryScore,
      communityScore,
      notecardScore,
      deltaScore,
      reasons,
      agentsMd: matchedDirectory?.agentsMd ?? null,
    };
  });

  const prefetchedTargets = new Map<string, { path: string; kind: 'source' | 'agents-md' | 'notecard'; score: number; reasons: string[] }>();

  const upsertTarget = (path: string, kind: 'source' | 'agents-md' | 'notecard', score: number, reason: string) => {
    const normalized = normalizeWorkspacePath(path);
    if (!normalized) return;
    const existing = prefetchedTargets.get(normalized);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    prefetchedTargets.set(normalized, {
      path: normalized,
      kind,
      score,
      reasons: [reason],
    });
  };

  for (const delta of knowledgeDelta) {
    upsertTarget(delta.filePath, 'source', delta.recencyScore, 'recent edit');
    if (delta.agentsMd) {
      upsertTarget(delta.agentsMd.resolvedPath, 'agents-md', Math.max(delta.directoryScore, delta.recencyScore), 'nearest LLMS.md');
    }
  }

  for (const hit of notecardHits.slice(0, Math.max(3, input.limit ?? 4))) {
    upsertTarget(hit.source_path, 'notecard', normalizeScore(hit.score), 'notecard search hit');
  }

  const sourceRefs = buildSourceRefs([
    ACTIVITY_LOG_PATH,
    ...directoryContexts.map((context) => context.agentsMd?.resolvedPath ?? ''),
    ...notecardHits.map((hit) => hit.source_path),
    ...recentUnique.map((entry) => entry.filePath),
  ]);

  return {
    query: querySeed || input.query?.trim() || workspacePath || '',
    path: workspacePath,
    generatedAt: new Date().toISOString(),
    activity: {
      logPath: ACTIVITY_LOG_PATH,
      totalEntries: activityEntries.length,
      recentFiles: recentUnique,
    },
    directoryContexts,
    communityContexts,
    notecardHits,
    knowledgeDelta: knowledgeDelta.sort((a, b) => b.deltaScore - a.deltaScore),
    prefetchTargets: Array.from(prefetchedTargets.values()).sort((a, b) => b.score - a.score),
    sourceRefs,
  };
}
