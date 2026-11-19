import { db } from '$lib/server/db/client';
import { canvasStates, evidence, evidenceBoardConnections } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { clientKey, TTL } from '$lib/server/cache-keys.js';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { loadSceneSnapshot } from '$lib/server/scene-markers/scene-snapshot-v1.js';
import { loadBoardDossierContext } from '$lib/server/evidence/board-dossier-context.js';
import type { BoardDossierContext } from '$lib/components/evidence/board-dossier-context.js';

const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			timer = setTimeout(() => reject(new Error('Board query timed out')), 5000);
		})
	]).finally(() => clearTimeout(timer));
};

const EMPTY_BOARD = (id: string) => ({
  caseId: id,
  caseNumber: null,
  caseTitle: null,
  initialState: null,
  evidence: [],
  connections: [],
  loadError: null,
});

const BOARD_INLINE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
function boardPreviewMime(item: { mimeType?: string | null; fileType?: string | null }): string | null {
  const candidates = [item.mimeType, item.fileType]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase());
  return candidates.find((value) => BOARD_INLINE_IMAGE_MIMES.has(value)) ?? null;
}

async function loadBoardCore(id: string, userId: number) {
  // Client view cache check
  const vKey = clientKey.view(String(userId), id, 'board-v4');
  const memHit = getFromMemoryCache(vKey);
  if (memHit.found && memHit.value) return { ...(memHit.value as object), loadError: null } as any;
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const hit = await getRedis().get(vKey);
    if (hit) {
      const p = JSON.parse(hit);
      if (p) return { ...p, loadError: null };
    }
  } catch {
    /* miss */
  }

  try {
    // Load canvas state, evidence, and connections in parallel
    const [savedState, evidenceItems, connections] = await Promise.all([
      withTimeout<Awaited<ReturnType<typeof db.query.canvasStates.findFirst>>>(
        db.query.canvasStates.findFirst({
          where: eq(canvasStates.caseId, id),
        })
      ),
      withTimeout<(typeof evidence.$inferSelect)[]>(
        db.query.evidence.findMany({
          where: and(eq(evidence.caseId, id), isNull(evidence.deletedAt)),
          orderBy: (evidence, { desc }) => [desc(evidence.uploadedAt)],
          limit: 100,
        })
      ),
      withTimeout<(typeof evidenceBoardConnections.$inferSelect)[]>(
        db.select().from(evidenceBoardConnections).where(eq(evidenceBoardConnections.caseId, id))
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
          poiId: meta.admitted_via === 'poi-photo' && typeof meta.poi_id === 'string' ? meta.poi_id : null,
          sourceRevision,
          title: item.title || 'Untitled Evidence',
          type: item.evidenceType || 'document',
          date: item.uploadedAt?.split('T')[0] || '',
          location: meta.location || '',
          mimeType: item.mimeType || null,
          // The canvas thumbnail is rendered through Image(), so only request
          // media that can be safely displayed as an image. Documents and
          // unsupported MIME types stay selectable without triggering an
          // expected inline-preview 415 on every board hydration.
          thumbnail: boardPreviewMime(item)
            ? `/api/evidence/${encodeURIComponent(item.id)}/download?inline=1&caseId=${encodeURIComponent(id)}`
            : undefined,
          depthMapUrl: hasSourceBoundDepth
            ? `/api/evidence/${encodeURIComponent(item.id)}/depth-map`
            : null,
          description: item.description || '',
          fileType: item.fileType || item.mimeType || '',
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
      loadError: null,
    };

    // Persist to client view cache (non-blocking)
    setCache(vKey, result, TTL.CLIENT_VIEW * 1000).catch(() => {});
    return result;
  } catch (e) {
    console.error('Failed to load board data:', e);
    return {
      ...EMPTY_BOARD(id),
      loadError: 'Could not load this case’s evidence board. Try again in a moment.'
    };
  }
}

/**
 * Board load: the cached/core board data plus a fresh, authorized scene snapshot for the Noir view.
 * The snapshot is never cached, so a saved marker move is visible on the next load.
 */
export const load: PageServerLoad = async (event) => {
	const caseId = event.params.id;
	const numericUserId = Number(event.locals.user?.id);
	const authorized = Number.isSafeInteger(numericUserId) && numericUserId > 0 &&
		(await getAuthorizedCase(caseId, numericUserId).catch(() => null));
	if (!authorized) return { ...EMPTY_BOARD(caseId), sceneSnapshot: null, dossierContext: null };

	const [core, sceneSnapshot, dossierContext] = await Promise.all([
		loadBoardCore(caseId, numericUserId),
		loadSceneSnapshot(caseId),
		withTimeout(loadBoardDossierContext(caseId, numericUserId)).catch((): BoardDossierContext => ({
			reports: [], people: [], unavailable: ['reports', 'people'],
		})),
	]);
	return { ...core, caseNumber: authorized.caseNumber ?? null, caseTitle: authorized.title ?? null, sceneSnapshot, dossierContext };
};
