/**
 * cluster-tags-cache.ts
 *
 * Module-level LRU for the latest qdrant_cluster_tags.json artifact.
 * Shared between context-assembler and multi-lane-retrieval to avoid
 * file reads on every request. Refreshes every 5 min.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ClusterTagsEntry {
  clusterKey: string;
  fileCount: number;
  topoClasses: string[];
  topTags: Array<{ tag: string; count: number }>;
  topFiles: (string | null)[];
  clusterSrc?: string;
  // Synthesized metadata from GraphRAG/Raptor
  summary?: string;
  purpose?: string;
  risk_level?: string;
  mitigation_protocols?: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache: ClusterTagsEntry[] | null = null;
let _cacheAt = 0;
let _relCache: string | null = null;
let _relCacheAt = 0;

export function readLatestQdrantClusterTags(): ClusterTagsEntry[] {
  const now = Date.now();
  if (_cache !== null && now - _cacheAt < CACHE_TTL_MS) return _cache;
  try {
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const runsDir = resolve(__dirname, '../../../../../memory/runs');
    const entries = readdirSync(runsDir)
      .filter((e) => /^\d{4}-\d{2}-\d{2}T/.test(e))
      .sort();
    if (!entries.length) { _cache = []; _cacheAt = now; return []; }
    const latest = entries[entries.length - 1];
    const latestDir = join(runsDir, latest);
    const raw = readFileSync(join(latestDir, 'qdrant_cluster_tags.json'), 'utf-8');
    const tags = JSON.parse(raw) as ClusterTagsEntry[];

    // Optional: merge synthesis summary
    try {
      const synPath = join(latestDir, 'synthesis_summary.json');
      const synRaw = readFileSync(synPath, 'utf-8');
      const synData = JSON.parse(synRaw) as Array<{
        cluster_id: number;
        summary: string;
        purpose: string;
        risk_level?: string;
        mitigation_protocols?: string[];
      }>;
      const synMap = new Map(synData.map(s => [`cluster:gpu:${s.cluster_id}`, s]));
      
      for (const t of tags) {
        const s = synMap.get(t.clusterKey);
        if (s) {
          t.summary = s.summary;
          t.purpose = s.purpose;
          t.risk_level = s.risk_level;
          t.mitigation_protocols = s.mitigation_protocols;
        }
      }
    } catch { /* skip synthesis enrichment if file missing */ }

    _cache = tags;
    _cacheAt = now;
    return _cache;
  } catch {
    _cache = [];
    _cacheAt = now;
    return [];
  }
}

/**
 * Read the pre-computed relationship-aware synthesisBlock from the latest run.
 * Returns empty string if no run exists or artifact is missing.
 * TTL: same 5-min refresh as cluster tags.
 */
export function readLatestRelationSynthesis(): string {
  const now = Date.now();
  if (_relCache !== null && now - _relCacheAt < CACHE_TTL_MS) return _relCache;
  try {
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const runsDir = resolve(__dirname, '../../../../../memory/runs');
    const entries = readdirSync(runsDir)
      .filter((e) => /^\d{4}-\d{2}-\d{2}T/.test(e))
      .sort();
    if (!entries.length) { _relCache = ''; _relCacheAt = now; return ''; }
    const latest = entries[entries.length - 1];
    const raw = readFileSync(join(runsDir, latest, 'llm_synthesis_mapping.json'), 'utf-8');
    const mapping = JSON.parse(raw) as { synthesisBlock?: string };
    _relCache = mapping.synthesisBlock ?? '';
    _relCacheAt = now;
    return _relCache;
  } catch {
    _relCache = '';
    _relCacheAt = now;
    return '';
  }
}

/** Score a cluster's relevance to a query by tag + topo-class overlap. */
export function scoreClusterRelevance(
  entry: ClusterTagsEntry,
  queryLower: string,
  queryTerms: Set<string>
): number {
  let score = 0;
  for (const { tag, count } of entry.topTags) {
    const tl = tag.toLowerCase();
    if (queryLower.includes(tl) || queryTerms.has(tl)) {
      score += Math.min(0.15, 0.05 * Math.log2(count + 1));
    }
  }
  for (const tc of entry.topoClasses) {
    if (queryLower.includes(tc.toLowerCase())) score += 0.10;
  }
  return score;
}
