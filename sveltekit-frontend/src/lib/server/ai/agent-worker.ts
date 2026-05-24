import { connect, StringCodec } from 'nats';
import { runAgentDAG } from './langgraph-dag.js';
import { recordExecutionOutcome } from './learning-loop.js';
import { ENV } from '../env.server.js';

const sc = StringCodec();

export async function startDistributedWorker() {
  try {
    const nc = await connect({ servers: ENV.NATS_URL || 'nats://127.0.0.1:4222' });
    console.log(`[Worker] Connected to NATS cluster at ${nc.getServer()}`);

    const sub = nc.subscribe('agent.task.execute', { queue: 'agent.workers' });
    console.log(`[Worker] Listening for distributed tasks on 'agent.task.execute'`);

    for await (const msg of sub) {
      const payload = JSON.parse(sc.decode(msg.data));
      const { taskId, query, ctx = {} } = payload;
      
      console.log(`[Worker] Processing Task ${taskId}: "${query}"`);
      
      const result = await runAgentDAG(query, ctx);
      
      // Phase 10: Record execution outcome for reinforcement loop
      await recordExecutionOutcome(query, result.success, ctx);

      if (msg.reply) {
        msg.respond(sc.encode(JSON.stringify(result)));
      }
    }
  } catch (err) {
    console.error(`[Worker] Error connecting to NATS:`, err);
  }
}

// If invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDistributedWorker().catch(console.error);
}
