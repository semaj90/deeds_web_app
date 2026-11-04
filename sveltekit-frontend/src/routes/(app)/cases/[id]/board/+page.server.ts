import { db } from '$lib/server/db/client';
import { canvasStates, evidence, evidenceBoardConnections } from '$lib/server/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { cases } from '$lib/server/db/schema-postgres.js';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { clientKey, TTL } from '$lib/server/cache-keys.js';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> =>
	Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), 5000))]).catch(() => fb);

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) throw redirect(302, '/login');
  const userId = Number(locals.user.id);
  if (!Number.isInteger(userId) || userId <= 0) throw error(401, 'Unauthorized');
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isValidUuid) throw error(400, 'Invalid case ID format');

  // Check membership before any cached response or case-scoped data access.
  const [authorizedCase] = await db.select({ id: cases.id }).from(cases)
    .where(and(eq(cases.id, id), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))))
    .limit(1);
  if (!authorizedCase) throw error(404, 'Case not found');

  // Client view cache check
  const vKey = clientKey.view(userId, id, 'board-v2');
  const memHit = getFromMemoryCache(vKey);
  if (memHit.found && memHit.value) return memHit.value as any;
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const hit = await getRedis().get(vKey);
    if (hit) {
      const p = JSON.parse(hit);
      if (p) return p;
    }
  } catch {
    /* miss */
  }

  try {
    // Load canvas state, evidence, and connections in parallel
    const [savedState, evidenceItems, connections] = await Promise.all([
      safe(
        db.query.canvasStates.findFirst({
          where: eq(canvasStates.caseId, id),
        }),
        null
      ),
      safe(
        db.query.evidence.findMany({
          where: eq(evidence.caseId, id),
          orderBy: (evidence, { desc }) => [desc(evidence.uploadedAt)],
          limit: 100,
        }),
        []
      ),
      safe(
        db.select().from(evidenceBoardConnections).where(eq(evidenceBoardConnections.caseId, id)),
        []
      ),
    ]);

    const result = {
      caseId: id,
      initialState: savedState ? savedState.stateData : null,
      evidence: evidenceItems.map((item) => {
        const meta = (item.metadata || {}) as Record<string, any>;
        const analysis = (item.aiAnalysis || {}) as Record<string, any>;
        const depthAnalysis = analysis.depthAnalysis as { sourceRevision?: string } | undefined;
        const sourceRevision = typeof item.hash === 'string'
          ? item.hash.startsWith('sha256:') ? item.hash : `sha256:${item.hash}`
          : null;
        const hasSourceBoundDepth = Boolean(
          depthAnalysis?.sourceRevision && depthAnalysis.sourceRevision === sourceRevision
        );
        return {
          id: item.id,
          title: item.title || 'Untitled Evidence',
          type: item.evidenceType || 'document',
          date: item.uploadedAt?.split('T')[0] || '',
          location: meta.location || '',
          thumbnail: `/api/evidence/${encodeURIComponent(item.id)}/download?inline=1&caseId=${encodeURIComponent(id)}`,
          depthMapUrl: hasSourceBoundDepth
            ? `/api/evidence/${encodeURIComponent(item.id)}/depth-map`
            : null,
          description: item.description || '',
          fileType: item.fileType || '',
          confidence: meta.confidence || 0,
          keyPoints: (analysis.keyPoints as string[]) ?? [],
        };
      }),
      connections: connections.map((c) => ({
        id: c.id,
        fromEvidenceId: c.fromEvidenceId,
        toEvidenceId: c.toEvidenceId,
        connectionType: c.connectionType,
        label: c.label,
        notes: c.notes,
        strength: c.strength,
        isVisible: c.isVisible,
      })),
    };

    // Persist to client view cache (non-blocking)
    setCache(vKey, result, TTL.CLIENT_VIEW * 1000).catch(() => {});
    return result;
  } catch (e) {
    console.error('Failed to load board data:', e);
    return {
      caseId: id,
      initialState: null,
      evidence: [],
      connections: [],
    };
  }
};
