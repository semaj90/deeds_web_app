import { getChannel, EXCHANGES } from './connect.js';
import { logger } from '../utils/logger.js';

export interface JobMessage {
  evidenceId: string;
  caseId?: string;
  [key: string]: unknown;
}

export async function publishJob(routingKey: string, message: JobMessage): Promise<void> {
  try {
    const channel = await getChannel();
    const msgBuffer = Buffer.from(JSON.stringify(message));

    channel.publish(EXCHANGES.EVIDENCE, routingKey, msgBuffer, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });

    logger.info('Published job', { routingKey, evidenceId: message.evidenceId });
  } catch (error) {
    logger.error('Failed to publish job', { routingKey, error });
    throw error;
  }
}
