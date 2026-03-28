import { db } from '$lib/server/db/client';
import { personsOfInterest, poiPhotos } from '$lib/server/db/schema-postgres';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params }) => {
  if (!UUID_PATTERN.test(params.id)) {
    return { poi: null, photos: [], loadError: 'Invalid person of interest id' };
  }

  const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]).catch(() => fallback);

  const results = await safe(
    db.select().from(personsOfInterest).where(eq(personsOfInterest.id, params.id)).limit(1),
    []
  );

  const poi = results[0];

  if (!poi) {
    return {
      poi: null,
      photos: [],
      loadError: 'Person of interest not found or database unavailable',
    };
  }

  const photos = await safe(
    db
      .select()
      .from(poiPhotos)
      .where(eq(poiPhotos.poiId, params.id))
      .orderBy(desc(poiPhotos.uploadedAt)),
    []
  );

  const profileData = (poi.profileData ?? {}) as Record<string, unknown>;

  return {
    poi: {
      id: poi.id,
      name: poi.name,
      status: poi.status,
      threatLevel: poi.threatLevel,
      description: poi.description,
      relationship: poi.relationship,
      aliases: poi.aliases,
      crimes: poi.crimes ?? [],
      caseIds: poi.caseIds,
      caseId: poi.caseIds?.[0] ?? null,
      aiProfile: poi.aiProfile,
      who: poi.who,
      what: poi.what,
      why: poi.why,
      how: poi.how,
      risk: poi.risk,
      confidence: poi.confidence,
      photoUrl: poi.photoUrl,
      notes: poi.notes,
      tags: poi.tags,
      profileData,
      physicalDescription: profileData.physicalDescription ?? null,
      dateOfBirth: profileData.dateOfBirth ?? null,
      lastKnownLocation: profileData.lastKnownLocation ?? null,
      lastSeen: profileData.lastSeen ?? null,
      lastLocation: profileData.lastLocation ?? null,
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
