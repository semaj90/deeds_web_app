/**
 * CouchDB Mango index bootstrap + schema types for the memory fabric.
 *
 * Ensures required indexes exist on:
 *   karpathy_wiki   — cluster wiki notes, directory summaries, LLMS.md docs
 *   research_memory — official/GitHub/Reddit research notes
 *   synthesis_memory — ACE synthesis outputs, LLM answer cache
 *   trace_events    — TRACE retrieval run audit trail
 *
 * Atlas-specific indexes (workspace, runId, clusterId, featureKey, routeId,
 * updatedAt) are applied to karpathy_wiki only since that is the primary
 * writer target for the AgentsDirectoryCard pipeline.
 *
 * Call ensureMangoIndexes() once at startup (idempotent).
 */
import { ENV } from '$lib/server/env.server.js';

const COUCHDB_URL  = ENV.COUCHDB_URL;
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = (process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass');

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryDocType =
  | 'wiki_note'
  | 'research_note'
  | 'synthesis_memory'
  | 'directory_summary'
  | 'cluster_summary'
  | 'LLMS.md'
  | 'trace_event';

export interface MemoryDoc {
  _id:            string;
  _rev?:          string;
  type:           MemoryDocType;
  stableKey:      string;
  clusterKey?:    string;
  directoryPath?: string;
  tags:           string[];
  /** LegalProduction | DevCodeIntel */
  domain?:        'LegalProduction' | 'DevCodeIntel';
  trustTier?:     'official' | 'community' | 'internal' | 'synthetic';
  gainScore?:     number;
  source?:        string;
  manifold4?:     [number, number, number, number];
  qdrantPointId?: string;
  neo4jNodeId?:   string;
  outputMeta?:    Record<string, unknown>;
  lastSyncedAt?:  string;
  createdAt:      string;

  // ── Writer-stamped fields (A4+) ──────────────────────────────────────────
  /** Run identifier for rollback via rollbackByRunId(). */
  runId?:         string;
  /** Logical workspace (e.g. 'deeds-web-app', 'legal-ai'). */
  workspace?:     string;
  /** ISO timestamp of last write — distinct from lastSyncedAt. */
  updatedAt?:     string;
  /** GPU k-means cluster integer ID (distinct from clusterKey slug). */
  clusterId?:     string | number;
  /** Feature-flag / feature-card key for atlas retrieval. */
  featureKey?:    string;
  /** SvelteKit route ID for route-card atlas lookup. */
  routeId?:       string;
}

export interface WikiNote extends MemoryDoc {
  type:          'wiki_note';
  title:         string;
  body:          string;
  obsidianPath?: string;
}

export interface ResearchNote extends MemoryDoc {
  type:       'research_note';
  title:      string;
  summary:    string;
  sourceUrl?: string;
  trustTier:  'official' | 'community' | 'internal' | 'synthetic';
}

export interface SynthesisMemory extends MemoryDoc {
  type:       'synthesis_memory';
  queryHash:  string;
  answer:     string;
  contextIds: string[];
}

// ── Database list ─────────────────────────────────────────────────────────────

export const MEMORY_DATABASES = [
  'karpathy_wiki',
  'research_memory',
  'synthesis_memory',
  'trace_events',
] as const;

export type MemoryDatabase = (typeof MEMORY_DATABASES)[number];

// ── Index definitions ─────────────────────────────────────────────────────────

/** Applied to all memory databases. */
const COMMON_INDEXES = [
  { name: 'type-stablekey',      fields: ['type', 'stableKey'] },
  { name: 'type-cluster-gain',   fields: ['type', 'clusterKey', 'gainScore', 'lastSyncedAt'] },
  { name: 'type-dir-trust',      fields: ['type', 'directoryPath', 'trustTier'] },
  { name: 'tags-source',         fields: ['tags', 'source'] },
  // A4+ additions: rollback and cross-database filtering
  { name: 'run-id',              fields: ['runId'] },
  { name: 'workspace-type',      fields: ['workspace', 'type'] },
  { name: 'updated-at-type',     fields: ['updatedAt', 'type'] },
];

/** Applied only to karpathy_wiki (the primary atlas writer target). */
const ATLAS_INDEXES = [
  { name: 'cluster-id-type',     fields: ['clusterId', 'type'] },
  { name: 'feature-key',         fields: ['featureKey'] },
  { name: 'route-id',            fields: ['routeId'] },
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeader(): string {
  return 'Basic ' + Buffer.from(COUCHDB_USER + ':' + COUCHDB_PASS).toString('base64');
}

async function couchFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(COUCHDB_URL + '/' + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init?.headers ?? {}),
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a database if it doesn't exist (idempotent).
 */
export async function ensureDatabase(dbName: MemoryDatabase): Promise<void> {
  const res = await couchFetch(dbName, { method: 'PUT' });
  if (!res.ok && res.status !== 412) {
    throw new Error(`[mango-indexes] Failed to create DB ${dbName}: ${res.status}`);
  }
}

/**
 * Create or update a Mango index (idempotent — CouchDB de-dupes by name).
 */
export async function ensureIndex(
  dbName: string,
  name:   string,
  fields: string[],
): Promise<void> {
  const body = JSON.stringify({ index: { fields }, name, type: 'json' });
  const res  = await couchFetch(dbName + '/_index', { method: 'POST', body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[mango-indexes] Failed to create index ${name} on ${dbName}: ${res.status} ${text}`);
  }
}

/**
 * Ensure all required databases and Mango indexes exist.
 * Safe to call on every startup — all operations are idempotent.
 */
export async function ensureMangoIndexes(): Promise<{ ok: boolean; created: string[] }> {
  const created: string[] = [];
  const errors:  string[] = [];

  for (const db of MEMORY_DATABASES) {
    try {
      await ensureDatabase(db);

      // Common indexes — applied to every database
      for (const idx of COMMON_INDEXES) {
        try {
          await ensureIndex(db, idx.name, idx.fields);
          created.push(`${db}/${idx.name}`);
        } catch (err) {
          errors.push(String(err));
        }
      }

      // Atlas indexes — karpathy_wiki only (primary writer target)
      if (db === 'karpathy_wiki') {
        for (const idx of ATLAS_INDEXES) {
          try {
            await ensureIndex(db, idx.name, idx.fields);
            created.push(`${db}/${idx.name}`);
          } catch (err) {
            errors.push(String(err));
          }
        }
      }
    } catch (err) {
      errors.push(String(err));
    }
  }

  if (errors.length > 0) {
    console.warn('[mango-indexes] Some indexes failed:', errors.slice(0, 3));
  }

  return { ok: errors.length === 0, created };
}

/**
 * Mango find query with full typing.
 */
export async function findDocs<T extends MemoryDoc>(
  dbName:   string,
  selector: Record<string, unknown>,
  opts?:    { limit?: number; sort?: Record<string, 'asc' | 'desc'>[]; fields?: string[] },
): Promise<T[]> {
  const body = JSON.stringify({
    selector,
    limit:  opts?.limit ?? 25,
    sort:   opts?.sort,
    fields: opts?.fields,
  });
  const res = await couchFetch(dbName + '/_find', { method: 'POST', body });
  if (!res.ok) throw new Error(`[mango-indexes] _find failed on ${dbName}: ${res.status}`);
  const data = await res.json() as { docs: T[] };
  return data.docs;
}
