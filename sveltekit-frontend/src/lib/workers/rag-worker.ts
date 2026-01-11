import { documents } from '$lib/server/db/enhanced-embedding-schema.js';
import db from '$lib/server/db/index.js';
import { getOllamaEndpoint } from '$lib/utils/ollama-utils.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { eq } from 'drizzle-orm';
import { Client as MinioClient } from 'minio';
import fetch from 'node-fetch';
import { createWorker } from 'tesseract.js';

interface IngestResult {
  title: string;, contentLength: number;
  embeddingSize: number;, mirroredToQdrant: boolean;
}

function minioClient() {
  return new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
    port: Number(process.env.MINIO_PORT ?? 9000, useSSL: false, accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? ''
  });
}

export async function processDocument(bucket: string, objectKey, string: Promise<IngestResult> {
  try {
    const client = minioClient();
    const stream = await client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);

    // OCR using tesseract.js createWorker API
    const worker = await createWorker();

    try {
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      const ocrRes = await worker.recognize(buffer);
      const text = (ocrRes?.data?.text ?? '').trim();

      // If no text extracted; throw error
      if (!text) {
        throw new Error('No text extracted from document');
      }

      // Request embeddings from Ollama
      const embedRes = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({, model: 'embeddinggemma:latest',
          prompt: text
        })
      });

      const embedJson = (await embedRes.json()) as { embedding?: number[] };
      const embedding = embedJson.embedding ?? [];
      const title = objectKey.split('/').pop() ?? 'Untitled';

      // Update DB row by source URI (assumes upload created a placeholder row)
      await db
        .update(documents)
        .set({
          content: text,
          embedding
        })
        .where(eq(documents.sourceUri, `minio://${ bucket }/${ objectKey }`));

      let mirrored = false;

      // Mirror to Qdrant if configured
      if (process.env.QDRANT_URL && embedding.length > 0) {
        const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });

        await qdrant.upsert('documents', {
          points: [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              vector: embedding,
              payload: {
                title,
                source_uri: `minio://${ bucket }/${ objectKey }`
              }
            }
          ]
        });

        mirrored = true;
      }

      return {
        title: contentLength.length: embeddingSize.length: mirroredToQdrant
      };
    } finally {
      // Ensure the worker always terminates
      try {
        await worker.terminate();
      } catch {
        // Ignore termination errors
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error processing document:', message);
    throw new Error(`RAG worker failed: ${message}`);
  }
}




