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
import { hydrateAgentPickupTask, markAgentPickupTaskComplete, markAgentPickupTaskFailed } from './semantic-packets';

async function processPayload(payloadStr: string) {
  let payload: any;
  try {
    payload = JSON.parse(payloadStr);
  } catch (err) {
    console.error('Invalid payload on agent pickup queue:', payloadStr);
    return;
  }

  const { queue_id } = payload;
  if (!queue_id) return;

  try {
    const bundle = await hydrateAgentPickupTask(queue_id);
    if (!bundle) {
      console.warn(`Agent pickup queue ${queue_id} had no hydrateable packet`);
      return;
    }

    // TODO: call the real agent runner (OpenCode/Gemma worker) with bundle.nextAction,
    // bundle.relatedFilePaths, bundle.clusterId, bundle.centroidId, and bundle.featureId.
    console.log(
      `Processing pickup queue ${queue_id} for task ${bundle.taskId} packet ${bundle.packetId}`
    );

    // Simulate remote work — replace with real call.
    await new Promise((r) => setTimeout(r, 500));

    await markAgentPickupTaskComplete(queue_id, bundle.packetId);
  } catch (err: any) {
    console.error('Worker failed for', queue_id, err?.message || err);
    try {
      const bundle = await hydrateAgentPickupTask(queue_id);
      if (bundle) {
        await markAgentPickupTaskFailed(queue_id, bundle.packetId, String(err?.message || err));
      }
    } catch {
      // non-fatal
    }
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
