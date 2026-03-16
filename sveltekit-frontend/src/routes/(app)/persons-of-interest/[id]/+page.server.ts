import { db } from '$lib/server/db/client';
import { personsOfInterest, poiPhotos } from '$lib/server/db/schema-postgres';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
	const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
		Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]).catch(() => fallback);

	const results = await safe(
		db.select().from(personsOfInterest).where(eq(personsOfInterest.id, params.id)).limit(1),
		[]
	);

	const poi = results[0];

	if (!poi) {
		return { poi: null, photos: [], loadError: 'Person of interest not found or database unavailable' };
	}

	const photos = await safe(
		db.select().from(poiPhotos).where(eq(poiPhotos.poiId, params.id)).orderBy(desc(poiPhotos.uploadedAt)),
		[]
	);

	return {
    poi: {
      id: poi.id,
      name: poi.name,
      status: poi.status,
      threatLevel: poi.threatLevel,
      description: poi.description,
      relationship: poi.relationship,
      aliases: poi.aliases,
      caseIds: poi.caseIds,
      caseId: poi.caseIds?.[0] ?? null,
      aiProfile: poi.aiProfile,
      who: poi.who,
      what: poi.what,
      why: poi.why,
      how: poi.how,
      risk: poi.risk,
      confidence: poi.confidence,
      createdAt: poi.createdAt?.toISOString() ?? '',
      updatedAt: poi.updatedAt?.toISOString() ?? '',
    },
    photos: photos.map((p) => ({
      id: p.id,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl ?? p.url,
      originalName: p.originalName,
      mimeType: p.mimeType,
      size: p.size,
      aiCaption: p.aiCaption,
      aiTags: p.aiTags,
      exifData: p.exifData,
      forensicData: p.forensicData,
      uploadedAt: p.uploadedAt?.toISOString() ?? '',
    })),
    loadError: null,
  };
};
