import { getChannel, QUEUES } from '../connect.js';
import { db } from '../../db/drizzle.js';
import { evidences } from '../../db/schema.js';
import { summarizeText } from '../../services/summarizer.js';
import { logger } from '../../utils/logger.js';
import { eq } from 'drizzle-orm';

async function processSummarizeJob(message: any): Promise<void> {
  const { evidenceId, text } = message;

  logger.info('Processing summarization job', { evidenceId });

  try {
    if (!text || text.trim().length === 0) {
      logger.warn('No text to summarize', { evidenceId });
      return;
    }

    // Generate summary
    const summary = await summarizeText(text);

    // Update evidence with summary
    await db.update(evidences)
      .set({
        summary,
        updatedAt: new Date(),
      })
      .where(eq(evidences.id, evidenceId));

    logger.info('Summarization job completed', { evidenceId, summaryLength: summary.length });
  } catch (error) {
    logger.error('Summarization job failed', { evidenceId, error });
    throw error;
  }
}

export async function startSummarizeWorker(): Promise<void> {
  logger.info('Starting Summarize worker');

  const channel = await getChannel();
  await channel.prefetch(1);

  channel.consume(QUEUES.SUMMARIZE, async (msg: any) => {
    if (!msg) return;

    try {
      const message = JSON.parse(msg.content.toString());
      await processSummarizeJob(message);
      channel.ack(msg);
    } catch (error) {
      logger.error('Failed to process summarize message', { error });
      channel.nack(msg, false, false);
    }
  });

  logger.info('Summarize worker started');
}

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startSummarizeWorker().catch((error) => {
    logger.error('Summarize worker crashed', { error });
    process.exit(1);
  });
}
