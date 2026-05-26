// @ts-expect-error TODO(TS-101): NATS package types are missing StringCodec export
import { connect, StringCodec } from 'nats';
import { runAgentDAG } from './langgraph-dag.js';
import { ENV } from '../env.server.js';
import { getRedis } from '../redis.js';
import { storeChatMemoryTurn, injectAcePacket } from './engram-registry.js';

const sc = StringCodec();

export async function startDistributedWorker() {
  try {
    const nc = await connect({ servers: ENV.NATS_URL || 'nats://127.0.0.1:4222' });
    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    console.log(`[Worker] Connected to NATS cluster at ${nc.getServer()}`);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const sub = nc.subscribe('agent.task.execute', { queue: 'agent.workers' });
    console.log(`[Worker] Listening for distributed tasks on 'agent.task.execute'`);


    (async () => {
      for await (const msg of sub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          const { taskId, query, ctx = {} } = payload;
          
          console.log(`[Worker] Processing Task ${taskId}: "${query}"`);
          
          const result = await runAgentDAG(query, ctx);
          
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify(result)));
          }
        } catch (err) {
          console.error(`[Worker] Error processing message:`, err);
          msg.nak();
        }
      }
    })().catch(console.error);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const engramSub = nc.subscribe('engram.feedback.async', { queue: 'engram.workers' });
    console.log(`[Worker] Listening for async engram feedback on 'engram.feedback.async'`);

    (async () => {
      for await (const msg of engramSub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          console.log(`[Engram Worker] Processing async feedback for runId=${payload.runId}`);
          const redis = getRedis();
          if (redis && payload.summary) {
             await injectAcePacket(redis, {
                run_id: payload.runId,
                context_blob: payload.summary,
                ttl_seconds: 3600
             }).catch(() => {});
          }
        } catch (err) {
          console.error(`[Engram Worker] Error processing feedback:`, err);
        }
      }
    })().catch(console.error);
  } catch (err) {
    console.error(`[Worker] Error connecting to NATS:`, err);
  }
}

// If invoked directly
import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startDistributedWorker().catch(console.error);
}
