/**
 * POST /api/wiki/sync-to-obsidian — bulk push CouchDB karpathy_wiki → Obsidian vault.
 *
 * Body (optional):
 *   { dryRun?: boolean, limit?: number, types?: ('cluster'|'retrieval'|'playbook'|'research')[] }
 *
 * Flow:
 *   1. listWikiNotes() — pull all notes from CouchDB karpathy_wiki
 *   2. exportToObsidian(note) — render → markdown → PUT to Obsidian REST API
 *   3. Return { written, failed, skipped, notes: [{id, status}] }
 *
 * Smoke test for the Obsidian integration. Gracefully reports if OBSIDIAN_API_KEY
 * isn't set (returns 503 with a clear error rather than failing silently).
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import {
  listWikiNotes,
  exportToObsidian,
} from '$lib/server/features/codebase-intel/index.js';

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  limit:  z.number().int().min(1).max(500).optional(),
  types:  z.array(z.enum(['cluster', 'retrieval', 'playbook', 'research'])).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (!ENV.OBSIDIAN_URL || !ENV.OBSIDIAN_API_KEY) {
    return json(
      {
        error: 'Obsidian not configured',
        hint:  'Set OBSIDIAN_URL + OBSIDIAN_API_KEY in .env. Run GET /api/health/obsidian to verify.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try { body = await request.json().catch(() => ({})); }
  catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });
  const { dryRun, limit, types } = parsed.data;

  const startMs = Date.now();
  // listWikiNotes is per-type; if the caller filtered to specific types, fetch
  // only those buckets. Otherwise fetch all 4 (cluster, retrieval, playbook, research).
  const wantedTypes = (types?.length
    ? types
    : ['cluster', 'retrieval', 'playbook', 'research']) as Array<'cluster' | 'retrieval' | 'playbook' | 'research'>;
  const perBucket = Math.max(1, Math.floor((limit ?? 200) / wantedTypes.length));
  const buckets   = await Promise.all(
    wantedTypes.map((t) => listWikiNotes(t, perBucket).catch(() => [])),
  );
  const allNotes  = buckets.flat();
  const filtered  = allNotes; // types filter already applied above

  if (dryRun) {
    return json({
      dryRun: true,
      total:  filtered.length,
      preview: filtered.slice(0, 10).map((n) => ({ id: getNoteId(n), type: n.type })),
      durationMs: Date.now() - startMs,
    });
  }

  const results: Array<{ id: string; type: string; status: 'ok' | 'failed' }> = [];
  let written = 0, failed = 0;

  for (const note of filtered) {
    const ok = await exportToObsidian(note);
    const id = getNoteId(note);
    results.push({ id, type: note.type, status: ok ? 'ok' : 'failed' });
    if (ok) written++; else failed++;
  }

  return json({
    written,
    failed,
    total:      filtered.length,
    skipped:    allNotes.length - filtered.length,
    durationMs: Date.now() - startMs,
    notes:      results.slice(0, 50),
  });
};

function getNoteId(note: { type: string } & Record<string, unknown>): string {
  switch (note.type) {
    case 'cluster':  return `cluster:${(note as { clusterType?: string }).clusterType ?? '?'}:${(note as { clusterId?: number }).clusterId ?? '?'}`;
    case 'retrieval': return `retrieval:${String((note as { query?: string }).query ?? '').slice(0, 60).replace(/\W+/g, '_')}`;
    case 'playbook':  return `playbook:${String((note as { symptom?: string }).symptom ?? '').slice(0, 60).replace(/\W+/g, '_')}`;
    case 'research':  return `research:${String((note as { query?: string }).query ?? '').slice(0, 60).replace(/\W+/g, '_')}`;
    default:          return 'unknown';
  }
}
