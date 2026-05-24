import { connect, StringCodec } from 'nats';
import fs from 'fs';

const sc = StringCodec();

async function runTraining() {
  console.log("🚀 Starting Phase 11 Legal Contract Training Loop...");
  
  const contractText = fs.readFileSync('../memory/datasets/complex-legal-contract.md', 'utf8');
  
  const nc = await connect({ servers: 'nats://127.0.0.1:4222' });
  console.log("📡 Connected to NATS broker. Dispatching extraction intent to graph...");
  
  const query = "Extract all vector retention and processing limitations from the provided legal contract text. Identify specific numerical limits, TTLs, and prohibited actions.";
  
  const payload = {
    taskId: 'legal-extract-001',
    query: query,
    ctx: {
      intent: 'legal-extraction',
      strategy: 'hyper-rag-dense',
      atlas: [
        {
          id: 'complex-contract',
          path: 'memory/datasets/complex-legal-contract.md',
          searchGroups: ['legal-contracts', 'compliance'],
          summary: 'Mutual Non-Disclosure and Data Processing Agreement',
          content: contractText
        }
      ]
    }
  };
  
  try {
    const resp = await nc.request('agent.task.execute', sc.encode(JSON.stringify(payload)), { timeout: 10000 });
    const result = JSON.parse(sc.decode(resp.data));
    
    console.log(`\n✅ Graph Execution Complete.`);
    console.log(`Success: ${result.success}`);
    if (result.suggestedFix) {
      console.log(`\n⚠️ Graph mutated execution strategy due to ambiguity. Suggested Fix applied:\n${result.suggestedFix}`);
    } else {
      console.log(`\n🎯 Extraction Strategy Score Improved in Redis RL Loop.`);
    }
    
  } catch (err) {
    console.error("❌ Training failure:", err.message);
  }
  
  await nc.close();
}

runTraining().catch(console.error);
