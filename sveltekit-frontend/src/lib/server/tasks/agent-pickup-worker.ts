/**
 * Agent Pickup Worker Stub
 * - BLPOP from Redis 'agent:pickup:queue'
 * - Mark agent_pickup_queue row as processing
 * - Attempt to run a worker handler (stubbed)
 * - On success mark completed; on failure increment attempts and set error
 *
 * This is a lightweight worker intended as an example. In production run
 * a supervised process (PM2/systemd/container) and ensure the DB + Redis
 * connection configs are available via ENV.
 */

import { getRedis } from '$lib/server/redis';
import { db } from '$lib/server/db/client';
import { agentPickupQueue } from '../db/schema/tasks';
import { eq, sql } from 'drizzle-orm';

async function processPayload(payloadStr: string) {
  let payload: any;
  try {
    payload = JSON.parse(payloadStr);
  } catch (err) {
    console.error('Invalid payload on agent pickup queue:', payloadStr);
    return;
  }

  const { queue_id, task_id, packet_id } = payload;
  if (!queue_id) return;

  // mark processing
  await db
    .update(agentPickupQueue)
    .set({ status: 'processing', picked_up_at: new Date(), updated_at: new Date() })
    .where(eq(agentPickupQueue.id, queue_id))
    .execute();

  try {
    // TODO: call the real agent runner (OpenCode/Gemma worker). For now simulate work.
    console.log(`Processing pickup queue ${queue_id} for task ${task_id} packet ${packet_id}`);
    // Simulate remote work — replace with real call
    await new Promise((r) => setTimeout(r, 500));

    // Mark completed
    await db
      .update(agentPickupQueue)
      .set({ status: 'completed', completed_at: new Date(), updated_at: new Date() })
      .where(eq(agentPickupQueue.id, queue_id))
      .execute();
  } catch (err: any) {
    console.error('Worker failed for', queue_id, err?.message || err);
    // increment attempts and conditionally set status
    await db
      .update(agentPickupQueue)
      .set({
        attempts: sql`${agentPickupQueue.attempts} + 1`,
        error: String(err?.message || err),
        status: sql`CASE WHEN ${agentPickupQueue.attempts} + 1 >= ${agentPickupQueue.max_attempts} THEN 'failed' ELSE 'queued' END`,
        available_at: sql`now() + interval '30 seconds'`,
        updated_at: new Date(),
      })
      .where(eq(agentPickupQueue.id, queue_id))
      .execute();
  }
}

export async function runAgentPickupWorkerLoop() {
  const redis = getRedis();
  console.log('Agent pickup worker starting — listening on agent:pickup:queue');
  while (true) {
    try {
      // BLPOP with 5s timeout
      const res = await redis.blpop('agent:pickup:queue', 5);
      if (!res) continue; // timeout — loop
      const [, payload] = res; // [key, value]
      await processPayload(payload);
    } catch (err: any) {
      console.error('Agent pickup worker loop error:', err?.message || err);
      // sleep 2s before retrying
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
