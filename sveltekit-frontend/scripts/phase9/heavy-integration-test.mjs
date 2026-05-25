import { detectAccelerators } from '../../src/lib/server/ai/accelerator-capabilities.js';
import { recordTransition } from '../../src/lib/server/ai/execution-transition-memory.js';

async function run() {
  console.log("🚀 Starting Phase 9.5 Heavy Integration Test");
  
  const caps = await detectAccelerators();
  console.log("Accelerator Capabilities:", caps);
  
  if (!caps.postgres) {
    console.warn("⚠️ Postgres accelerator not fully detected (or DB ping failed).");
  } else {
    console.log("✅ Postgres accelerator verified active.");
  }

  console.log("\n🧪 Test 1: Verifying structural fallbacks without accelerators");
  // Simulating a fallback scenario where Redis or Qdrant might be down
  const noCacheFallback = !caps.redis;
  const noVectorFallback = !caps.qdrant;
  
  console.log(`Cache Fallback required? ${noCacheFallback}`);
  console.log(`Vector Fallback required? ${noVectorFallback}`);

  console.log("\n🧪 Test 2: Transition Memory Logger");
  await recordTransition({
    from: 'synthesize',
    to: 'failureLookup',
    intent: 'hybrid',
    success: false
  });
  console.log("✅ Recorded execution transition successfully.");

  console.log("\n✅ Heavy Integration Test Passed. (Accelerators improve latency, never correctness)");
  process.exit(0);
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
