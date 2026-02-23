import { getChannel, QUEUES } from '../connect.js';
import { db } from '../../db/drizzle.js';
import { evidences } from '../../db/schema.js';
import { extractEntities } from '../../services/entity-extraction.js';
import { detectSuspiciousPatterns } from '../../services/forensics.js';
import { logger } from '../../utils/logger.js';
import { eq } from 'drizzle-orm';

async function processEntityJob(message: any): Promise<void> {
  const { evidenceId, text } = message;

  logger.info('Processing entity extraction job', { evidenceId });

  try {
    if (!text || text.trim().length === 0) {
      logger.warn('No text for entity extraction', { evidenceId });
      return;
    }

    // Extract entities
    const entities = await extractEntities(text);

    // Detect suspicious patterns
    const forensicFlags = detectSuspiciousPatterns(text);

    // Update evidence with entities and forensic flags
    await db.update(evidences)
      .set({
        entities: entities as any,
        forensicFlags: forensicFlags as any,
        status: 'analyzed',
        updatedAt: new Date(),
      })
      .where(eq(evidences.id, evidenceId));

    logger.info('Entity extraction job completed', {
      evidenceId,
      entityCount: entities.length,
      flagCount: forensicFlags.length
    });
  } catch (error) {
    logger.error('Entity extraction job failed', { evidenceId, error });
    throw error;
  }
}

export async function startEntityWorker(): Promise<void> {
  logger.info('Starting Entity worker');

  const channel = await getChannel();
  await channel.prefetch(1);

  channel.consume(QUEUES.ENTITY, async (msg: any) => {
    if (!msg) return;

    try {
      const message = JSON.parse(msg.content.toString());
      await processEntityJob(message);
      channel.ack(msg);
    } catch (error) {
      logger.error('Failed to process entity message', { error });
      channel.nack(msg, false, false);
    }
  });

  logger.info('Entity worker started');
}

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startEntityWorker().catch((error) => {
    logger.error('Entity worker crashed', { error });
    process.exit(1);
  });
}
