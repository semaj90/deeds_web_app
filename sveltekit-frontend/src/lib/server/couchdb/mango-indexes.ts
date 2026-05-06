/**
 * CouchDB Mango index bootstrap + schema types for the memory fabric.
 *
 * Ensures required indexes exist on:
 *   karpathy_wiki   — cluster wiki notes, directory summaries, AGENTS.md docs
 *   research_memory — official/GitHub/Reddit research notes
 *   synthesis_memory — ACE synthesis outputs, LLM answer cache
 *   trace_events    — TRACE retrieval run audit trail
 *
 * Call ensureMangoIndexes() once at startup (idempotent).
 */

const COUCHDB_URL  = process.env.COUCHDB_URL  ?? 'http://localhost:5984';
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = (process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass');

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryDocType =
  | 'wiki_note'
  | 'research_note'
  | 'synthesis_memory'
  | 'directory_summary'
  | 'cluster_summary'
  | 'agents_md'
  | 'trace_event';

export interface MemoryDoc {
  _id:         string;
  _rev?:       string;
  type:        MemoryDocType;
  stableKey:   string;
  clusterKey?: string;
  directoryPath?: string;
  tags:        string[];
  /** LegalProduction | DevCodeIntel */
  domain?:     'LegalProduction' | 'DevCodeIntel';
  trustTier?:  'official' | 'community' | 'internal' | 'synthetic';
  gainScore?:  number;
  source?:     string;
  manifold4?:  [number, number, number, number];
  qdrantPointId?: string;
  neo4jNodeId?:   string;
  outputMeta?: Record<string, unknown>;
  lastSyncedAt?: string;
  createdAt:   string;
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

// ── Required indexes ──────────────────────────────────────────────────────────

/** Mango index definitions applied to all memory databases. */
const COMMON_INDEXES = [
  {
    name:   'type-stablekey',
    fields: ['type', 'stableKey'],
  },
  {
    name:   'type-cluster-gain',
    fields: ['type', 'clusterKey', 'gainScore', 'lastSyncedAt'],
  },
  {
    name:   'type-dir-trust',
    fields: ['type', 'directoryPath', 'trustTier'],
  },
  {
    name:   'tags-source',
    fields: ['tags', 'source'],
  },
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
  name: string,
  fields: string[],
): Promise<void> {
  const body = JSON.stringify({
    index: { fields },
    name,
    type: 'json',
  });
  const res = await couchFetch(dbName + '/_index', {
    method: 'POST',
    body,
  });
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
  const errors: string[] = [];

  for (const db of MEMORY_DATABASES) {
    try {
      await ensureDatabase(db);
      for (const idx of COMMON_INDEXES) {
        try {
          await ensureIndex(db, idx.name, idx.fields);
          created.push(`${db}/${idx.name}`);
        } catch (err) {
          errors.push(String(err));
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
  dbName: string,
  selector: Record<string, unknown>,
  opts?: { limit?: number; sort?: Record<string, 'asc' | 'desc'>[]; fields?: string[] },
): Promise<T[]> {
  const body = JSON.stringify({
    selector,
    limit: opts?.limit ?? 25,
    sort: opts?.sort,
    fields: opts?.fields,
  });
  const res = await couchFetch(dbName + '/_find', { method: 'POST', body });
  if (!res.ok) throw new Error(`[mango-indexes] _find failed on ${dbName}: ${res.status}`);
  const data = await res.json() as { docs: T[] };
  return data.docs;
}
