import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/drizzle';
import { eq, desc } from '$lib/server/db/utils';
import { citations } from '$lib/server/db/schema';
import { CONFIG } from '$lib/config/env.server';
import { getUserId } from '$lib/server/auth/utils';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

/** Typed structure for the Citation record */
type Citation = {
  id: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  category: string;
  isFavorite: boolean;
  notes?: string;
  savedAt: string;
  contextData?: Record<string, string>;
};

/**
 * 🧠 Server Load: /saved-citations
 * Fetches user citations from Postgres (via Drizzle).
 * Falls back to MinIO (S3) if Postgres query fails or returns nothing.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return { savedCitations: [] as Citation[], user: null };
  }

  try {
    // resolve stable user ID
    const rawUserId = getUserId(locals);
    const userId =
      typeof rawUserId === 'string' && rawUserId ? rawUserId : (locals.user as { id?: string })?.id;

    if (!userId) {
      console.warn('⚠️ No userId available — returning mock data');
      return { savedCitations: mockCitations(), user: locals.user };
    }

    /** 1️⃣ Query PostgreSQL via Drizzle */
    let records: Citation[] = [];
    try {
      const result = await db
        .select()
        .from(citations)
        .where(eq(citations.userId, userId))
        .orderBy(desc(citations.savedAt))
        .execute();

      records = result.map((r) => {
        const savedAtRaw = (r as any).savedAt;
        const savedAtIso =
          savedAtRaw instanceof Date
            ? savedAtRaw.toISOString()
            : new Date(String(savedAtRaw ?? Date.now())).toISOString();

        return {
          id: r.id,
          title: r.title,
          content: r.content ?? '',
          source: r.source ?? '',
          tags: r.tags ?? [],
          category: r.category ?? 'general',
          isFavorite: !!r.isFavorite,
          notes: r.notes ?? undefined,
          savedAt: savedAtIso,
          contextData: r.contextData ?? {},
        } as Citation;
      });
    } catch (dbErr) {
      console.warn('⚠️ DB fetch failed, attempting MinIO fallback:', dbErr);
    }

    /** 2️⃣ Fallback to MinIO if empty or failed */
    if (records.length === 0) {
      try {
        const minioCitations = await fetchCitationsFromMinIO(userId);
        if (minioCitations.length > 0) {
          records = minioCitations;
        }
      } catch (minioErr) {
        console.warn('⚠️ MinIO fallback failed:', minioErr);
      }
    }

    /** 3️⃣ Final fallback mock data (guarantees UI stability) */
    const savedCitations = records.length > 0 ? records : mockCitations();

    return { savedCitations, user: locals.user };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error loading saved citations:', message);
    return {
      savedCitations: [],
      user: locals.user,
      error: 'Failed to load saved citations',
    };
  }
};

/** 🧰 MinIO Fallback Fetcher */
async function fetchCitationsFromMinIO(userId: string): Promise<Citation[]> {
  const client = new S3Client({
    endpoint: CONFIG.MINIO_URL,
    region: CONFIG.MINIO_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: CONFIG.MINIO_ACCESS_KEY,
      secretAccessKey: CONFIG.MINIO_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  const key = `citations/${userId}.json`;
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: CONFIG.MINIO_BUCKET, Key: key }));

    // Narrow possible Body types coming from AWS SDK v3:
    // NodeJS.ReadableStream | ReadableStream<Uint8Array> | Blob | Uint8Array | string | undefined
    const body = obj.Body as
      | NodeJS.ReadableStream
      | ReadableStream<Uint8Array>
      | Blob
      | Uint8Array
      | string
      | undefined;

    if (!body) return [];
    const text = await streamToString(body);
    const parsed = JSON.parse(text) as Citation[];
    return parsed;
  } catch (err) {
    console.warn(`⚠️ No MinIO citations for user ${userId}:`, err);
    return [];
  }
}

/** Utility: convert various stream/body types → string */
async function streamToString(
  body: NodeJS.ReadableStream | ReadableStream<Uint8Array> | Blob | Uint8Array | string
): Promise<string> {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf-8');

  // Blob (browser / some AWS runtimes)
  // Blob has .text() in modern runtimes
  if (typeof (body as Blob).text === 'function') {
    return await (body as Blob).text();
  }

  // Web ReadableStream (browser or polyfilled)
  if (typeof (body as ReadableStream<Uint8Array>)?.getReader === 'function') {
    // use Response to consume the stream reliably
    // (Node 18+ and modern runtimes have global Response)
    return await new Response(body as ReadableStream<Uint8Array>).text();
  }

  // Fallback: NodeJS.ReadableStream (async iterable of Buffer | string | Uint8Array)
  const chunks: Uint8Array[] = [];
  const nodeStream = body as AsyncIterable<Buffer | Uint8Array | string>;
  for await (const chunk of nodeStream) {
    if (typeof chunk === 'string') chunks.push(<any>(<any>Buffer.from(chunk)));
    else if (Buffer.isBuffer(chunk)) chunks.push(<any>(<any>chunk));
    else chunks.push(<any>(<any>Buffer.from(chunk)));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** 🧩 Local mock fallback (for offline mode) */
function mockCitations(): Citation[] {
  return [
    {
      id: '1',
      title: 'Fourth Amendment Search and Seizure',
      content:
        'The right of the people to be secure in their persons, houses, papers, and effects, against unreasonable searches and seizures...',
      source: 'U.S. Constitution, Amendment IV',
      tags: ['constitutional-law', 'search-seizure', 'evidence'],
      category: 'constitutional',
      isFavorite: true,
      notes: 'Key precedent for evidence admissibility',
      savedAt: new Date('2024-01-15').toISOString(),
      contextData: { reportId: 'report-123', caseId: 'case-456' },
    },
  ];
}
