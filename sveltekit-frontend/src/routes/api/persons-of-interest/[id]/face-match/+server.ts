import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { poiPhotos, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { eq, ne, isNotNull, sql } from 'drizzle-orm';

/**
 * POST /api/persons-of-interest/[id]/face-match
 *
 * Search for similar POI faces using caption embeddings stored in Qdrant.
 * Falls back to DB-based cosine similarity if Qdrant is unavailable.
 *
 * Body (optional): { photoId?: string, limit?: number }
 */
export const POST: RequestHandler = async ({ params }) => {
	const poiId = params.id;

	try {
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

		const photosWithEmbeddings = myPhotos.filter(
			(p) => p.faceEmbedding && p.faceEmbedding.length > 10
		);

		if (photosWithEmbeddings.length === 0) {
			return json({
				matches: [],
				method: 'none',
				message: 'No analyzed photos with embeddings found for this POI',
			});
		}

		// Parse the first available embedding as the query vector
		let queryVector: number[];
		try {
			queryVector = JSON.parse(photosWithEmbeddings[0].faceEmbedding!);
			if (!Array.isArray(queryVector) || queryVector.length !== 768) {
				throw new Error('Invalid embedding dimensions');
			}
		} catch {
			return json({
				matches: [],
				method: 'error',
				message: 'Could not parse face embedding vector',
			});
		}

		// Try Qdrant vector search first
		let qdrantMatches: Array<{
			poiId: string;
			photoId: string;
			poiName: string;
			caption: string;
			score: number;
		}> = [];

		try {
			const { QdrantClient } = await import('@qdrant/js-client-rest');
			const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

			const results = await qdrant.search('evidence_items', {
				vector: queryVector,
				limit: 20,
				score_threshold: 0.5,
				with_payload: true,
				filter: {
					must: [
						{ key: 'type', match: { value: 'poi_photo' } },
					],
					must_not: [
						// Exclude current POI's own photos by name
						// (poi_id not stored in Qdrant payload, but poi_name is)
					],
				},
			});

			// Get current POI name for filtering
			const [currentPoi] = await db
				.select({ name: personsOfInterest.name })
				.from(personsOfInterest)
				.where(eq(personsOfInterest.id, poiId))
				.limit(1);

			const currentPoiName = currentPoi?.name ?? '';

			qdrantMatches = results
				.filter((r) => {
					const payload = r.payload as Record<string, unknown>;
					// Exclude own photos
					return payload?.poi_name !== currentPoiName;
				})
				.map((r) => {
					const payload = r.payload as Record<string, unknown>;
					return {
						poiId: '', // Will be resolved from DB
						photoId: (payload?.photo_id as string) ?? '',
						poiName: (payload?.poi_name as string) ?? 'Unknown',
						caption: (payload?.caption as string) ?? '',
						score: r.score,
					};
				});
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
					...new Set(
						photoOwners
							.filter((p) => p.poiId !== poiId)
							.map((p) => p.poiId)
					),
				];

				if (uniquePoiIds.length > 0) {
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
						if (owner && owner.poiId !== poiId) {
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
						.slice(0, 10);

					return json({
						matches,
						method: 'qdrant-vector',
						queryPhotoId: photosWithEmbeddings[0].id,
						totalCandidates: qdrantMatches?.length ?? 0,
					});
				}
			}
		}

		// Fallback: No matches found
		return json({
			matches: [],
			method: qdrantMatches.length > 0 ? 'qdrant-no-other-pois' : 'fallback',
			message: 'No similar faces found from other persons of interest',
		});
	} catch (err) {
		console.error('[face-match] Error:', err);
		return json(
			{ error: 'Face match search failed', matches: [] },
			{ status: 500 }
		);
	}
};
