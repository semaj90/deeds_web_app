import { getChannel, QUEUES } from '../connect.js';
import { publishJob } from '../producer.js';
import { db } from '../../db/drizzle.js';
import { evidences, embeddings } from '../../db/schema.js';
import { generateEmbedding } from '../../services/embedding.js';
import { upsertVectors } from '../../rag/qdrant.js';
import { logger } from '../../utils/logger.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function processEmbedJob(message: any): Promise<void> {
  const { evidenceId, text } = message;

  logger.info('Processing embedding job', { evidenceId, textLength: text?.length });

  try {
    if (!text || text.trim().length === 0) {
      logger.warn('No text to embed', { evidenceId });
      return;
    }

    // Generate embedding
    const vector = await generateEmbedding(text.substring(0, 8000)); // Limit text size

    // Get evidence record
    const [evidence] = await db.select().from(evidences).where(eq(evidences.id, evidenceId));

    if (!evidence) {
      throw new Error(`Evidence not found: ${evidenceId}`);
    }

    // Store embedding in database
    const embeddingId = uuidv4();
    await db.insert(embeddings).values({
      id: embeddingId,
      evidenceId,
      vector: vector as any, // pgvector type
      model: 'nomic-embed-text',
      textSnippet: text.substring(0, 500),
    });

    // Store in Qdrant for fast search
    await upsertVectors([
      {
        id: embeddingId,
        vector,
        payload: {
          evidenceId,
          caseId: evidence.caseId,
          fileName: evidence.fileName,
          textSnippet: text.substring(0, 500),
        },
      },
    ]);

    // Update evidence status
    await db.update(evidences)
      .set({
        status: 'embedded',
        updatedAt: new Date(),
      })
      .where(eq(evidences.id, evidenceId));

    // Publish to entity extraction queue
    await publishJob(QUEUES.ENTITY, { evidenceId, text });

    // Publish to summarization queue
    await publishJob(QUEUES.SUMMARIZE, { evidenceId, text });

    logger.info('Embedding job completed', { evidenceId });
  } catch (error) {
    logger.error('Embedding job failed', { evidenceId, error });
    throw error;
  }
}

export async function startEmbedWorker(): Promise<void> {
  logger.info('Starting Embed worker');

  const channel = await getChannel();
  await channel.prefetch(1);

  channel.consume(QUEUES.EMBED, async (msg: any) => {
    if (!msg) return;

    try {
      const message = JSON.parse(msg.content.toString());
      await processEmbedJob(message);
      channel.ack(msg);
    } catch (error) {
      logger.error('Failed to process embed message', { error });
      channel.nack(msg, false, false);
    }
  });

  logger.info('Embed worker started');
}

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startEmbedWorker().catch((error) => {
    logger.error('Embed worker crashed', { error });
    process.exit(1);
  });
}
