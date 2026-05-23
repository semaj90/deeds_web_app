import { rabbitmq } from '../../src/lib/server/queue/rabbitmq-manager-fixed.js';
import { getRedis } from '../../src/lib/server/redis.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSmokeTest() {
  console.log("🚀 Starting RabbitMQ Background Workers Integration Smoke Test...");

  // 1. Initialize RabbitMQ Manager
  console.log("⚡ Initializing RabbitMQ Manager...");
  const initSuccess = await rabbitmq.initialize();
  if (!initSuccess) {
    console.error("❌ Failed to initialize RabbitMQ Manager");
    process.exit(1);
  }
  console.log("✅ RabbitMQ Manager initialized successfully!");

  const redis = getRedis();

  // 2. Publish cards.refresh job
  console.log("\n📦 Publishing cards.refresh job...");
  const cardsJobId = `smoke-cards-${Date.now()}`;
  await rabbitmq.publishCardsRefresh(cardsJobId, true);
  console.log(`✅ cards.refresh job enqueued with ID: ${cardsJobId}`);

  // 3. Publish repair.workflow.run job
  console.log("\n📦 Publishing repair.workflow.run job...");
  const repairJobId = `smoke-repair-${Date.now()}`;
  await rabbitmq.publishRepairWorkflowRun(repairJobId, 'scripts/ai-os', true, true, 'scan');
  console.log(`✅ repair.workflow.run job enqueued with ID: ${repairJobId}`);

  // 4. Publish inference.log.flush job
  console.log("\n📦 Publishing inference.log.flush job...");
  const flushJobId = `smoke-flush-${Date.now()}`;
  await rabbitmq.publishInferenceLogFlush(flushJobId);
  console.log(`✅ inference.log.flush job enqueued with ID: ${flushJobId}`);

  // 5. Wait for consumer loops to process jobs
  console.log("\n⏳ Waiting 5 seconds for background worker processing...");
  await sleep(5000);

  // 6. Verify Redis hermes job statuses
  console.log("\n🔍 Retrieving Job Traces from Redis...");
  
  const cardsState = await redis.get(`hermes:job:${cardsJobId}`);
  console.log(`  - hermes:job:${cardsJobId} -> ${cardsState}`);
  
  const repairState = await redis.get(`hermes:job:${repairJobId}`);
  console.log(`  - hermes:job:${repairJobId} -> ${repairState}`);
  
  const flushState = await redis.get(`hermes:job:${flushJobId}`);
  console.log(`  - hermes:job:${flushJobId} -> ${flushState}`);

  let failed = false;
  if (!cardsState || !JSON.parse(cardsState).status) {
    console.error("❌ cards.refresh state not found or invalid in Redis");
    failed = true;
  } else {
    console.log(`✅ cards.refresh job status: ${JSON.parse(cardsState).status}`);
  }

  if (!repairState || !JSON.parse(repairState).status) {
    console.error("❌ repair.workflow.run state not found or invalid in Redis");
    failed = true;
  } else {
    console.log(`✅ repair.workflow.run job status: ${JSON.parse(repairState).status}`);
  }

  if (!flushState || !JSON.parse(flushState).status) {
    console.error("❌ inference.log.flush state not found or invalid in Redis");
    failed = true;
  } else {
    console.log(`✅ inference.log.flush job status: ${JSON.parse(flushState).status}`);
  }

  // 7. Cleanup & Exit
  console.log("\n🛑 Exiting smoke test...");
  
  if (failed) {
    console.error("\n❌ Smoke test failed!");
    process.exit(1);
  } else {
    console.log("\n✨ RabbitMQ Background Workers Integration: ALL VERIFICATIONS PASSED.");
    process.exit(0);
  }
}

runSmokeTest().catch((err) => {
  console.error("💥 Smoke test crashed:", err);
  process.exit(1);
});
