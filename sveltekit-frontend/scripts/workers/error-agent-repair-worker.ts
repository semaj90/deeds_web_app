import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';

loadRuntimeEnv({ cwd: process.cwd(), mode: 'development', override: true });

const {
  executeErrorAgentRepairRequestV1,
  startErrorAgentRepairWorker,
} = await import('../../src/lib/server/ai/error-agent/repair-worker.js');
const { closeRabbitMQ } = await import('../../src/lib/server/rabbitmq.js');

const enabled = process.env.ERROR_AGENT_WORKER_ENABLED === 'true';

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await closeRabbitMQ();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

const result = await startErrorAgentRepairWorker({
  enabled,
  execute: executeErrorAgentRepairRequestV1,
});

console.log(JSON.stringify({
  ...result,
  enabled,
  writesPerformed: false,
}, null, 2));

if (result.status === 'REJECTED') process.exitCode = 1;
