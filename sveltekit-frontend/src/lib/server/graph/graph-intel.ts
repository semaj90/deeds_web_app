/**
 * Graph Intel — fast codebase-graph.json reader for ACE + Gemma4 tool-calling
 *
 * Loads docs/graph/codebase-graph.json (written by `npm run index:codebase:fast`)
 * and exposes typed query helpers consumed by:
 *   - ACE context-assembler  → ## Codebase Graph Intel section
 *   - gemma4-agent tools     → graph_search, wiki_note_lookup, audit_hotspots
 *
 * The JSON is cached in-process (LRU-lite: invalidated when mtime changes).
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync }     from 'node:fs';
import path               from 'node:path';
import { getRedis }       from '$lib/server/redis.js';

// ── JSON schema (subset used by this module) ─────────────────────────────────

export interface GraphFile {
  rel:           string;
  tags:          string[];
  summary:       string;
  routeHandlers: string[];
  todos:         string[];
  isRoute:       boolean;
  hasAuth?:      boolean;
  hasZod?:       boolean;
  lineCount?:    number;
  auditScore?:   number;
}

export interface GraphDir {
  dir:       string;
  score:     number;
  fileCount: number;
  lines:     number;
  apis:      number;
  authCount: number;
  todos:     number;
  tagList:   string[];
  summary:   string;
}

export interface GraphData {
  files:     GraphFile[];
  dirs?:     GraphDir[];
  metadata:  { createdAt: string; fileCount: number; mode: string };
}

// ── In-process mtime-gated cache ────────────────────────────────────────────

const GRAPH_PATH = path.resolve('docs/graph/codebase-graph.json');

let _cached:   GraphData | null = null;
let _cachedAt: number           = 0;   // mtime ms

async function loadGraph(): Promise<GraphData | null> {
  if (!existsSync(GRAPH_PATH)) return null;
  try {
    const { mtimeMs } = await stat(GRAPH_PATH);
    if (_cached && mtimeMs === _cachedAt) return _cached;
    const raw  = await readFile(GRAPH_PATH, 'utf-8');
    _cached    = JSON.parse(raw) as GraphData;
    _cachedAt  = mtimeMs;
    return _cached;
  } catch {
    return null;
  }
}

// ── Public query helpers ─────────────────────────────────────────────────────

export interface GraphSearchResult {
  rel:     string;
  summary: string;
  tags:    string[];
  score:   number;
  isRoute: boolean;
  todos:   string[];
  hasAuth: boolean;
}

/**
 * Search files in the graph by tag keywords, returning the top-k matches.
 * Scores by tag overlap + TODO penalty + auth gap penalty.
 */
export async function searchGraph(
  query:  string,
  topK  = 8,
  filter?: { onlyRoutes?: boolean; onlyNoAuth?: boolean; hasTodos?: boolean }
): Promise<GraphSearchResult[]> {
  const graph = await loadGraph();
  if (!graph) return [];

  const words = new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const results: (GraphSearchResult & { _score: number })[] = [];

  for (const f of graph.files) {
    if (filter?.onlyRoutes  && !f.isRoute)  continue;
    if (filter?.onlyNoAuth  && f.hasAuth)   continue;
    if (filter?.hasTodos    && !f.todos.length) continue;

    const tagWords = new Set(
      (f.tags.join(' ') + ' ' + f.rel + ' ' + f.summary).toLowerCase().split(/\W+/)
    );
    const overlap  = [...words].filter((w) => tagWords.has(w)).length;
    if (overlap === 0) continue;

    const authPenalty  = f.isRoute && !f.hasAuth ? -0.05 : 0;
    const todoPenalty  = f.todos.length * -0.01;
    const _score       = overlap / words.size + authPenalty + todoPenalty;

    results.push({
      rel:     f.rel,
      summary: f.summary,
      tags:    f.tags,
      score:   Math.max(0, _score),
      isRoute: f.isRoute,
      todos:   f.todos,
      hasAuth: Boolean(f.hasAuth),
      _score,
    });
  }

  return results
    .sort((a, b) => b._score - a._score)
    .slice(0, topK)
    .map(({ _score: _, ...r }) => r);
}

export interface AuditHotspot {
  dir:       string;
  score:     number;
  reason:    string[];
  todos:     number;
  authGaps:  number;
  fileCount: number;
  tags:      string[];
}

/**
 * Return the worst-scoring directories — for agentic fix planning.
 * Reasons: low audit score, TODO density, missing auth on API routes.
 */
export async function getAuditHotspots(limit = 10): Promise<AuditHotspot[]> {
  const graph = await loadGraph();
  if (!graph) return [];

  // Build dir → file aggregation if `dirs` key absent (older graph format)
  const dirMap = new Map<string, { files: GraphFile[] }>();
  for (const f of graph.files) {
    const parts = f.rel.split('/');
    if (parts.length < 2) continue;
    const dir = parts.slice(0, -1).join('/');
    if (!dirMap.has(dir)) dirMap.set(dir, { files: [] });
    dirMap.get(dir)!.files.push(f);
  }

  const hotspots: AuditHotspot[] = [];

  // Use pre-computed dirs if available
  const dirs: GraphDir[] = graph.dirs ?? [...dirMap.entries()].map(([dir, { files }]) => ({
    dir,
    score:     files.reduce((s, f) => s + (f.auditScore ?? 80), 0) / files.length,
    fileCount: files.length,
    lines:     files.reduce((s, f) => s + (f.lineCount ?? 0), 0),
    apis:      files.filter((f) => f.isRoute).length,
    authCount: files.filter((f) => f.hasAuth).length,
    todos:     files.reduce((s, f) => s + f.todos.length, 0),
    tagList:   [...new Set(files.flatMap((f) => f.tags))].slice(0, 6),
    summary:   '',
  }));

  for (const d of dirs) {
    const reason: string[] = [];
    if (d.score < 60)               reason.push(`low-score(${d.score})`);
    if (d.todos > 2)                reason.push(`todos(${d.todos})`);
    if (d.apis > 0 && d.authCount < d.apis) reason.push(`auth-gap(${d.apis - d.authCount}/${d.apis})`);
    if (reason.length === 0) continue;

    hotspots.push({
      dir:       d.dir,
      score:     d.score,
      reason,
      todos:     d.todos,
      authGaps:  Math.max(0, d.apis - d.authCount),
      fileCount: d.fileCount,
      tags:      d.tagList,
    });
  }

  return hotspots
    .sort((a, b) => a.score - b.score || b.todos - a.todos)
    .slice(0, limit);
}

export interface WikiNoteLookupResult {
  dir:        string;
  summary:    string;
  tags:       string[];
  auditScore: number | null;
  somBmuRow:  number | null;
  somBmuCol:  number | null;
}

/**
 * Look up wiki:note:dir:* entries from Redis matching a query.
 * Falls back to keys scan when fast-AST tag index is cold.
 */
export async function lookupWikiNotes(
  query:  string,
  limit = 5,
): Promise<WikiNoteLookupResult[]> {
  try {
    const redis = getRedis();
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

    // Resolve candidate keys from tag index
    const candidateKeys = new Set<string>();
    for (const word of words.slice(0, 5)) {
      const raw = await redis.get(`code:index:tag:${word}`).catch(() => null);
      if (!raw) continue;
      const paths: string[] = JSON.parse(raw);
      for (const p of paths.slice(0, 10)) {
        const dir   = p.split('/').slice(0, -1).join('/');
        const docId = `dir:${dir.replace(/[^a-z0-9]/gi, '_')}`;
        candidateKeys.add(`wiki:note:dir:${docId}`);
      }
    }

    // Fallback: scan all dir notes
    if (candidateKeys.size === 0) {
      const scanned = await redis.keys('wiki:note:dir:*').catch(() => [] as string[]);
      scanned.slice(0, 40).forEach((k) => candidateKeys.add(k));
    }

    const results: WikiNoteLookupResult[] = [];
    for (const key of candidateKeys) {
      const raw = await redis.get(key).catch(() => null);
      if (!raw) continue;
      const note = JSON.parse(raw) as Record<string, unknown>;
      const dir  = String(note['directoryPath'] ?? '');
      if (!dir) continue;

      // keyword score to filter relevance
      const noteText = (dir + ' ' + String(note['summary'] ?? '') + ' ' +
        (Array.isArray(note['dominantTags']) ? (note['dominantTags'] as string[]).join(' ') : ''))
        .toLowerCase();
      const overlap = words.filter((w) => noteText.includes(w)).length;
      if (overlap === 0 && candidateKeys.size > 10) continue;

      results.push({
        dir,
        summary:    String(note['summary'] ?? '').slice(0, 400),
        tags:       Array.isArray(note['dominantTags']) ? (note['dominantTags'] as string[]) : [],
        auditScore: typeof note['auditScore'] === 'number' ? note['auditScore'] : null,
        somBmuRow:  typeof note['somBmuRow']  === 'number' ? note['somBmuRow']  : null,
        somBmuCol:  typeof note['somBmuCol']  === 'number' ? note['somBmuCol']  : null,
      });

      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Lightweight ACE context snippet from graph JSON.
 * Returns a compact summary of top hotspot directories for injection into the
 * ACE prompt as "## Codebase Graph Intel".
 */
export async function getGraphIntelContext(query: string): Promise<string | null> {
  const [hits, hotspots] = await Promise.all([
    searchGraph(query, 5),
    getAuditHotspots(4),
  ]);

  const parts: string[] = [];

  if (hits.length) {
    parts.push(
      '### Relevant Files\n' +
      hits.map((h) =>
        `- \`${h.rel}\` (tags: ${h.tags.slice(0, 4).join(', ')})${h.todos.length ? ` ⚠️ ${h.todos.length} TODO(s)` : ''}${h.isRoute && !h.hasAuth ? ' 🔴no-auth' : ''}`
      ).join('\n')
    );
  }

  if (hotspots.length) {
    parts.push(
      '### Audit Hotspots (lowest score first)\n' +
      hotspots.map((h) =>
        `- \`${h.dir}\` score=${h.score} [${h.reason.join(', ')}]`
      ).join('\n')
    );
  }

  if (!parts.length) return null;
  return '\n## Codebase Graph Intel (fast-AST)\n' + parts.join('\n\n');
}
