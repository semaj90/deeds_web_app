/**
 * Audio Queue Consumer
 * RabbitMQ consumer for audio.process queue
 * Spawns AudioProcessor for each job
 */
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed';
import { AudioProcessor, type AudioJob } from './audio-processor';

let isConsuming = false;

/**
 * Start consuming audio.process queue
 */
export async function startAudioQueueConsumer() {
  if (isConsuming) {
    console.log('Audio queue consumer already running');
    return;
  }

  try {
    await rabbitmq.consume('audio.process', async (message) => {
      let job: AudioJob;
      try {
        job = JSON.parse(message.content.toString()) as AudioJob;
      } catch {
        console.error('[Audio Queue] Failed to parse message');
        return;
      }
      console.log(`[Audio Queue] Processing job for evidence ${job.evidenceId}`);

      try {
        const processor = new AudioProcessor();
        await processor.processAudio(job);
        console.log(`[Audio Queue] Successfully processed ${job.evidenceId}`);      } catch (error) {
        console.error(`[Audio Queue] Failed to process ${job.evidenceId}:`, error);
        // Error already logged to Redis status by AudioProcessor
      }
    });

    isConsuming = true;
    console.log('[Audio Queue] Consumer started successfully');
  } catch (error) {
    console.error('[Audio Queue] Failed to start consumer:', error);
    throw error;
  }
}

/**
 * Stop consuming (cleanup on shutdown)
 */
export async function stopAudioQueueConsumer() {
  if (!isConsuming) return;
  isConsuming = false;
  console.log('[Audio Queue] Consumer stopped');
}