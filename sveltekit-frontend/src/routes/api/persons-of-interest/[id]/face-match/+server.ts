import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { poiPhotos, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const faceMatchSchema = z.object({
  photoId: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

/**
 * POST /api/persons-of-interest/[id]/face-match
 *
 * Search for similar POI faces using embeddings stored in Qdrant.
 * Falls back to pgvector cosine similarity if Qdrant is unavailable.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });
  const poiId = params.id;
  const raw = await request.json().catch(() => ({}));
  const parsed = faceMatchSchema.safeParse(raw);
  const limit = parsed.success ? parsed.data.limit : 10;

  try {
    const [poi] = await db
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(and(eq(personsOfInterest.id, poiId), or(eq(personsOfInterest.createdBy, Number(locals.user.id)), isNull(personsOfInterest.createdBy))))
      .limit(1);

    if (!poi) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

    // Get photos with embeddings for this POI
    const myPhotos = await db
      .select({
        id: poiPhotos.id,
        faceEmbedding: poiPhotos.faceEmbedding,
        thumbnailUrl: poiPhotos.thumbnailUrl,
      })
      .from(poiPhotos)
      .where(eq(poiPhotos.poiId, poiId))
      .limit(10);

    // faceEmbedding is native vector(768) — Drizzle returns number[]
    const photosWithEmbeddings = myPhotos.filter(
      (p) => Array.isArray(p.faceEmbedding) && p.faceEmbedding.length === 768
    );

    if (photosWithEmbeddings.length === 0) {
      return json({
        matches: [],
        method: 'none',
        message: 'No analyzed photos with embeddings found for this POI',
      });
    }

    const queryVector = photosWithEmbeddings[0].faceEmbedding as number[];

    // Try Qdrant vector search — poi_profiles first, evidence_items fallback
    let qdrantMatches: Array<{
      poiId: string;
      photoId: string;
      poiName: string;
      caption: string;
      score: number;
      collection: string;
    }> = [];

    try {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      const qdrant = new QdrantClient({ url: ENV.QDRANT_URL });

      // Get current POI name for filtering
      const [currentPoi] = await db
        .select({ name: personsOfInterest.name })
        .from(personsOfInterest)
        .where(eq(personsOfInterest.id, poiId))
        .limit(1);

      const currentPoiName = currentPoi?.name ?? '';

      // Primary search: poi_profiles collection (dedicated POI vectors)
      try {
        const poiResults = await qdrant.search('poi_profiles', {
          vector: { name: 'embedding', vector: queryVector },
          limit: 20,
          score_threshold: 0.7,
          with_payload: true,
          filter: {
            must: [{ key: 'type', match: { value: 'poi_photo' } }],
            must_not: [{ key: 'poi_id', match: { value: poiId } }],
          },
        });

        qdrantMatches = poiResults.map((r) => {
          const payload = r.payload as Record<string, unknown>;
          return {
            poiId: (payload?.poi_id as string) ?? '',
            photoId: (payload?.photo_id as string) ?? '',
            poiName: (payload?.poi_name as string) ?? 'Unknown',
            caption: (payload?.caption as string) ?? '',
            score: r.score,
            collection: 'poi_profiles',
          };
        });
      } catch {
        // poi_profiles collection may not exist yet — fall through
      }

      // Fallback: evidence_items collection (broader, lower threshold)
      if (qdrantMatches.length === 0) {
        const results = await qdrant.search('evidence_items', {
          vector: queryVector,
          limit: 20,
          score_threshold: 0.5,
          with_payload: true,
          filter: {
            must: [{ key: 'type', match: { value: 'poi_photo' } }],
          },
        });

        qdrantMatches = results
          .filter((r) => {
            const payload = r.payload as Record<string, unknown>;
            return payload?.poi_name !== currentPoiName;
          })
          .map((r) => {
            const payload = r.payload as Record<string, unknown>;
            return {
              poiId: '',
              photoId: (payload?.photo_id as string) ?? '',
              poiName: (payload?.poi_name as string) ?? 'Unknown',
              caption: (payload?.caption as string) ?? '',
              score: r.score,
              collection: 'evidence_items',
            };
          });
      }
    } catch (err) {
      console.warn('[face-match] Qdrant search failed, falling back to DB:', err);
    }

    // Resolve Qdrant matches to POI records
    if (qdrantMatches.length > 0) {
      const photoIds = qdrantMatches.map((m) => m.photoId).filter(Boolean);

      if (photoIds.length > 0) {
        // Look up which POIs own these photos
        const photoOwners = await db
          .select({
            photoId: poiPhotos.id,
            poiId: poiPhotos.poiId,
            url: poiPhotos.url,
            thumbnailUrl: poiPhotos.thumbnailUrl,
            originalName: poiPhotos.originalName,
          })
          .from(poiPhotos)
          .where(
            sql`${poiPhotos.id} IN (${sql.join(
              photoIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );

        // Get unique POI IDs (excluding self)
        const uniquePoiIds = [
          ...new Set(photoOwners.filter((p) => p.poiId !== poiId).map((p) => p.poiId)),
        ];

        if (uniquePoiIds.length > 0) {
          return json(
            await buildMatchResponse(
              uniquePoiIds,
              qdrantMatches,
              photoOwners,
              poiId,
              limit,
              photosWithEmbeddings[0].id,
              qdrantMatches[0]?.collection ?? 'evidence_items'
            )
          );
        }
      }
    }

    // DB fallback: pgvector cosine similarity (HNSW indexed)
    try {
      const vectorStr = `[${queryVector.join(',')}]`;
      const dbMatches = await db.execute(sql`
				SELECT
					pp.id as photo_id,
					pp.poi_id,
					pp.url,
					pp.thumbnail_url,
					poi.name as poi_name,
					poi.status,
					poi.threat_level,
					1 - (pp.face_embedding <=> ${vectorStr}::vector) as similarity
				FROM poi_photos pp
				JOIN persons_of_interest poi ON poi.id = pp.poi_id
				WHERE pp.face_embedding IS NOT NULL
					AND pp.poi_id != ${poiId}
				ORDER BY pp.face_embedding <=> ${vectorStr}::vector
				LIMIT ${limit * 2}
			`);

      const rows = (dbMatches as unknown as { rows: Record<string, any>[] }).rows ?? [];
      if (rows.length > 0) {
        // Group by POI, take best score per POI
        const byPoi = new Map<
          string,
          {
            poi: {
              id: string;
              name: string;
              threatLevel: string;
              photos: Array<{ url: string; thumbnailUrl: string }>;
            };
            similarity: number;
            photos: Array<{ url: string; thumbnailUrl: string }>;
          }
        >();
        for (const row of rows) {
          const pid = row.poi_id;
          const sim = Number(row.similarity);
          if (sim < 0.5) continue;
          const existing = byPoi.get(pid);
          if (!existing) {
            byPoi.set(pid, {
              poi: {
                id: pid,
                name: row.poi_name ?? 'Unknown',
                threatLevel: row.threat_level ?? 'unknown',
                photos: [],
              },
              similarity: sim,
              photos: [{ url: row.url, thumbnailUrl: row.thumbnail_url ?? row.url }],
            });
          } else {
            if (sim > existing.similarity) existing.similarity = sim;
            existing.photos.push({ url: row.url, thumbnailUrl: row.thumbnail_url ?? row.url });
          }
        }

        const matches = [...byPoi.values()]
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit)
          .map((m) => ({
            poi: { ...m.poi, photos: m.photos.slice(0, 5) },
            similarity: m.similarity,
            confidence:
              m.similarity >= 0.85
                ? ('high' as const)
                : m.similarity >= 0.65
                  ? ('medium' as const)
                  : ('low' as const),
          }));

        if (matches.length > 0) {
          return json({
            matches,
            method: 'pgvector-cosine',
            queryPhotoId: photosWithEmbeddings[0].id,
            totalCandidates: rows.length,
          });
        }
      }
    } catch (err) {
      console.warn('[face-match] pgvector fallback failed:', err);
    }

    // Fallback: No matches found
    return json({
      matches: [],
      method: qdrantMatches.length > 0 ? 'qdrant-no-other-pois' : 'fallback',
      message: 'No similar faces found from other persons of interest',
    });
  } catch (err) {
    console.error('[face-match] Error:', err);
    return json({ error: 'Face match search failed', matches: [] }, { status: 500 });
  }
};

/** Build structured match response from Qdrant results + DB lookups */
async function buildMatchResponse(
	uniquePoiIds: string[],
	qdrantMatches: Array<{ photoId: string; score: number }>,
	photoOwners: Array<{ photoId: string; poiId: string }>,
	selfPoiId: string,
	limit: number,
	queryPhotoId: string,
	collection: string,
) {
	// Fetch POI details
	const pois = await db
		.select({
			id: personsOfInterest.id,
			name: personsOfInterest.name,
			status: personsOfInterest.status,
			threatLevel: personsOfInterest.threatLevel,
		})
		.from(personsOfInterest)
		.where(
			sql`${personsOfInterest.id} IN (${sql.join(
				uniquePoiIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		);

	// Get all photos for matched POIs
	const matchedPhotos = await db
		.select({
			id: poiPhotos.id,
			poiId: poiPhotos.poiId,
			url: poiPhotos.url,
			thumbnailUrl: poiPhotos.thumbnailUrl,
		})
		.from(poiPhotos)
		.where(
			sql`${poiPhotos.poiId} IN (${sql.join(
				uniquePoiIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		);

	// Build match response
	const poiMap = new Map(pois.map((p) => [p.id, p]));
	const photosByPoi = new Map<string, typeof matchedPhotos>();
	for (const photo of matchedPhotos) {
		const arr = photosByPoi.get(photo.poiId) ?? [];
		arr.push(photo);
		photosByPoi.set(photo.poiId, arr);
	}

	// Best score per POI from qdrant matches
	const scoreByPoi = new Map<string, number>();
	for (const m of qdrantMatches) {
		const owner = photoOwners.find((p) => p.photoId === m.photoId);
		if (owner && owner.poiId !== selfPoiId) {
			const existing = scoreByPoi.get(owner.poiId) ?? 0;
			if (m.score > existing) {
				scoreByPoi.set(owner.poiId, m.score);
			}
		}
	}

	const matches = uniquePoiIds
		.map((pid) => {
			const poi = poiMap.get(pid);
			const photos = photosByPoi.get(pid) ?? [];
			const similarity = scoreByPoi.get(pid) ?? 0;
			if (!poi) return null;
			return {
				poi: {
					id: poi.id,
					name: poi.name ?? 'Unknown',
					threatLevel: poi.threatLevel ?? 'unknown',
					photos: photos.map((p) => ({
						url: p.url,
						thumbnailUrl: p.thumbnailUrl ?? p.url,
					})),
				},
				similarity,
				confidence:
					similarity >= 0.85
						? ('high' as const)
						: similarity >= 0.65
							? ('medium' as const)
							: ('low' as const),
			};
		})
		.filter(Boolean)
		.sort((a, b) => b!.similarity - a!.similarity)
		.slice(0, limit);

	return {
		matches,
		method: 'qdrant-vector',
		collection,
		queryPhotoId,
		totalCandidates: qdrantMatches.length,
	};
}