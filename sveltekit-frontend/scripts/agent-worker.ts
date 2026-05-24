import { startDistributedWorker } from '../src/lib/server/ai/agent-worker.js';

console.log("Starting LangGraph NATS Worker...");
startDistributedWorker().catch(err => {
    console.error("Worker failed to start:", err);
    process.exit(1);
});
