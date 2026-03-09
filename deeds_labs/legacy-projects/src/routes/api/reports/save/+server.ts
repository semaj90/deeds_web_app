import { json } from '@sveltejs/kit';
import { db, eq } from '$lib/server/db/utils';
import { reports } from '$lib/server/db/schema';
import { CONFIG } from '$lib/config/env.server';
import { embeddingFunction } from '$lib/server/ai/embedder';
import { broadcastUpdate } from '$lib/server/reports/stream';
import { QdrantClient } from '@qdrant/js-client-rest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { RequestHandler } from './$types'; // Changed: Import RequestHandler from ./$types

// --- Types ---------------------------------------------------

/**
 * Handles POST requests to save or update a report.
 *
 * @param {Object} param0 - The request event object.
 * @param {Request} param0.request - The incoming HTTP request.
 * @param {any} param0.locals - The local context, including user info.
 * @returns {Promise<Response>} A JSON response containing the saved report or an error.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, title, content } = (body ?? {}) as {
      id?: string;
      title?: string;
      content?: string;
    };

    if (!title || !content)
      return json({ error: 'Missing required fields: title or content' }, { status: 400 });

    // 🧠 Step 1: Generate embeddings + keywords
    const { embedding, keywords } = await embeddingFunction(content);

    // 🧱 Step 2: Upsert into PostgreSQL
    let record;
    if (id) {
      const existing = await db.select().from(reports).where(eq(reports.id, id)).execute();
      if (existing.length > 0) {
        const [updated] = await db // Changed: Use array destructuring
          .update(reports)
          .set({
            title,
            content,
            updatedAt: new Date(),
            embedding,
            autoKeywords: keywords,
          })
          .where(eq(reports.id, id))
          .returning();
        record = updated; // Changed: Assign directly
      }
    }
    if (!record) {
      const [inserted] = await db // Changed: Use array destructuring
        .insert(reports)
        .values({
          userId: user.id,
          title,
          content,
          embedding,
          autoKeywords: keywords,
        })
        .returning();
      record = inserted; // Changed: Assign directly
    }

    // 🪣 Step 3: Backup JSON in MinIO
    try {
      // Removed: Dynamic import for @aws-sdk/client-s3
      const s3 = new S3Client({
        endpoint: CONFIG.MINIO_URL,
        region: CONFIG.MINIO_REGION,
        credentials: {
          accessKeyId: CONFIG.MINIO_ACCESS_KEY,
          secretAccessKey: CONFIG.MINIO_SECRET_KEY,
        },
        forcePathStyle: true,
      });

      if (record?.id) {
        await s3.send(
          new PutObjectCommand({
            Bucket: CONFIG.MINIO_BUCKET,
            Key: `reports/${user.id}/${record.id}.json`,
            Body: JSON.stringify(record, null, 2), // Changed: Added null, 2 for pretty printing
            ContentType: 'application/json',
          })
        );
      }
    } catch (s3Err) {
      console.warn('⚠️ MinIO backup skipped:', (s3Err as Error).message); // Changed: Simplified error message
    }

    // ⚡ Step 4: Qdrant vector upsert
    if (Array.isArray(embedding) && embedding.length && record?.id) {
      try {
        // Removed: Dynamic import for @qdrant/js-client-rest
        const qdrant = new QdrantClient({ url: CONFIG.QDRANT_URL });
        const collectionName = 'reports';

        // Create collection if it doesn’t exist
        const collections = await qdrant.getCollections();
        // Avoid using CollectionInfo type from the package (it's a namespace in some builds).
        const exists = (collections.collections as Array<Record<string, any>>).some(
          (c) => c.name === collectionName
        );
        if (!exists) {
          console.log(`📦 Creating Qdrant collection '${collectionName}'...`); // Changed: Log message
          await qdrant.createCollection(collectionName, {
            vectors: {
              size: embedding.length, // Changed: Use embedding.length for dynamic size
              distance: 'Cosine',
            },
          });
        }

        await qdrant.upsert(collectionName, {
          points: [
            {
              id: record.id,
              vector: embedding,
              payload: {
                userId: user.id,
                title,
                keywords,
              },
            },
          ],
        });
      } catch (qErr) {
        console.warn('⚠️ Qdrant update skipped:', (qErr as Error).message); // Changed: Simplified error message
      }
    }

    // ✅ Success
    // Publish live-update event for subscribers (SSE / Redis)
    try {
      if (record?.id) {
        broadcastUpdate({
          type: 'report-updated',
          reportId: record.id!,
          userId: user.id,
          title,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Failed to broadcast report update', e);
    }

    return json(record, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Report save error:', err);
    return json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
