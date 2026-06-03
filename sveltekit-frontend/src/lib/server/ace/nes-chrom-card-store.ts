/**
 * nes-chrom-card-store.ts
 *
 * CRUD for NES/CHROM cards — the Parent Atlas card objects that live in
 * .opencode/cards/*.json and get loaded into Redis as hot lookup packets.
 *
 * Card ID normalization is the critical piece here: the same file can appear as:
 *   file:src/lib/server/cache/valkey-client.ts       (gemma4_candidates namespace)
 *   src/lib/server/cache/valkey-client.ts            (relative path)
 *   sveltekit-frontend/src/lib/server/cache/...      (repo-relative)
 *   C:\...\sveltekit-frontend\src\lib\server\cache\...  (absolute Windows)
 *   valkey-client                                     (stem only)
 *
 * normalizeCardId() maps all of these to the canonical `src/...` form.
 */

import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import crypto from 'crypto';

export interface NesChromCard {
  id: string;                  // hex ID from .opencode/cards/
  source_ref: string;          // canonical normalized path e.g. src/lib/server/cache/valkey-client.ts
  alias_ids: string[];         // all known ID variants for this card
  title: string | null;
  som_row: number | null;
  som_col: number | null;
  som_distance: number | null;
  cluster_id: string | null;   // `${som_row}:${som_col}`
  feature_ids: string[];
  top_feature: string | null;
  workspace_task_id: string | null;
  summary: string | null;
  keywords: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

const TTL = 86_400; // 24h

// ── ID Normalization ──────────────────────────────────────────────────────

const STRIP_PREFIXES = [
  /^file:/,
  /^sveltekit-frontend[/\\]/,
  /^[A-Za-z]:[/\\].*?sveltekit-frontend[/\\]/,
  /^[/\\]+/,
  /^\.\//,
];

/**
 * Normalize any card/source ID variant to canonical `src/...` form.
 * Returns the normalized string, or null if it can't be resolved.
 */
export function normalizeCardId(raw: string): string {
  let s = raw.replace(/\\/g, '/').trim();

  // Strip known prefixes in order
  for (const prefix of STRIP_PREFIXES) {
    s = s.replace(prefix, '');
  }

  // If it starts with src/ we're done
  if (s.startsWith('src/')) return s;

  // If it's a stem-only (no slashes, no extension) — keep as-is for stem matching
  if (!s.includes('/')) return s;

  return s;
}

export function normalizeSourceRef(raw: string): string {
  return normalizeCardId(raw);
}

/** Build all likely lookup keys for a given source path */
export function cardIdVariants(sourceRef: string): string[] {
  const norm = normalizeCardId(sourceRef);
  const stem = norm.split('/').pop() ?? norm;
  const stemNoExt = stem.replace(/\.[^.]+$/, '');
  return [
    norm,
    `file:${norm}`,
    `sveltekit-frontend/${norm}`,
    stem,
    stemNoExt,
  ].filter((v, i, a) => a.indexOf(v) === i);
}

// ── Redis key helpers ─────────────────────────────────────────────────────

function cardKey(id: string): string {
  return `nes:card:${id}`;
}

function sourceRefIndexKey(sourceRef: string): string {
  const h = crypto.createHash('sha256').update(normalizeCardId(sourceRef)).digest('hex').slice(0, 12);
  return `nes:ref:${h}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function createCard(card: Omit<NesChromCard, 'created_at' | 'updated_at'>): Promise<NesChromCard> {
  const redis = getValkeyClient();
  const now = new Date().toISOString();
  const full: NesChromCard = { ...card, created_at: now, updated_at: now };
  const norm = normalizeCardId(card.source_ref);

  const pipeline = redis.pipeline();
  pipeline.set(cardKey(card.id), JSON.stringify(full), 'EX', TTL);

  // Index all variants so lookups succeed regardless of which ID form is used
  for (const variant of cardIdVariants(norm)) {
    pipeline.set(sourceRefIndexKey(variant), card.id, 'EX', TTL);
  }

  await pipeline.exec();
  return full;
}

export async function readCardById(id: string): Promise<NesChromCard | null> {
  const redis = getValkeyClient();
  const raw = await redis.get(cardKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as NesChromCard; } catch { return null; }
}

export async function readCardBySourceRef(sourceRef: string): Promise<NesChromCard | null> {
  const redis = getValkeyClient();
  const variants = cardIdVariants(normalizeCardId(sourceRef));

  for (const v of variants) {
    const id = await redis.get(sourceRefIndexKey(v));
    if (id) {
      const card = await readCardById(id);
      if (card) return card;
    }
  }
  return null;
}

export async function updateCardFeatures(
  id: string,
  patch: Partial<Pick<NesChromCard, 'feature_ids' | 'top_feature' | 'workspace_task_id' | 'keywords' | 'tags' | 'summary'>>
): Promise<NesChromCard | null> {
  const existing = await readCardById(id);
  if (!existing) return null;

  const updated: NesChromCard = { ...existing, ...patch, updated_at: new Date().toISOString() };
  const redis = getValkeyClient();
  await redis.set(cardKey(id), JSON.stringify(updated), 'EX', TTL);
  return updated;
}

export async function deleteCard(id: string): Promise<boolean> {
  const card = await readCardById(id);
  if (!card) return false;

  const redis = getValkeyClient();
  const pipeline = redis.pipeline();
  pipeline.del(cardKey(id));
  for (const v of cardIdVariants(normalizeCardId(card.source_ref))) {
    pipeline.del(sourceRefIndexKey(v));
  }
  await pipeline.exec();
  return true;
}

/**
 * Bulk-load cards from .opencode/cards/*.json into Redis.
 * Called after ndjson:mapreduce completes.
 */
export async function bulkLoadCards(
  rawCards: Array<{
    id: string;
    source?: string;
    title?: string;
    som_bmu_row?: number;
    som_bmu_col?: number;
    som_bmu_distance?: number;
    [k: string]: unknown;
  }>
): Promise<{ loaded: number; skipped: number }> {
  let loaded = 0;
  let skipped = 0;

  for (const raw of rawCards) {
    if (!raw.id || !raw.source) { skipped++; continue; }
    const norm = normalizeCardId(raw.source);
    const somRow = raw.som_bmu_row ?? null;
    const somCol = raw.som_bmu_col ?? null;

    try {
      await createCard({
        id: raw.id,
        source_ref: norm,
        alias_ids: cardIdVariants(norm),
        title: (raw.title as string) ?? null,
        som_row: somRow,
        som_col: somCol,
        som_distance: raw.som_bmu_distance ?? null,
        cluster_id: somRow != null && somCol != null ? `${somRow}:${somCol}` : null,
        feature_ids: [],
        top_feature: null,
        workspace_task_id: null,
        summary: null,
        keywords: [],
        tags: [],
      });
      loaded++;
    } catch {
      skipped++;
    }
  }

  return { loaded, skipped };
}
