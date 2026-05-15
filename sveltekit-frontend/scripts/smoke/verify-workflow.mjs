import { registerPdfOcrWorkflowRun, listPdfOcrWorkflowRuns } from '../../src/lib/server/workflows/pdf-ocr-workflow.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

async function verifyWorkflow() {
  console.log("🔍 Verifying PDF OCR Workflow Registration...");

  const testId = `test-run-${Date.now()}`;
  
  // 1. Register a run with a mock publisher that simulates RabbitMQ being up
  console.log("   - Registering mock RabbitMQ run...");
  const run = await registerPdfOcrWorkflowRun({
    workflowRunId: testId,
    evidenceId: 'smoke-evidence-id',
    fileName: 'smoke-test.pdf',
    mimeType: 'application/pdf'
  }, async () => ({ enqueued: true, transport: 'rabbitmq' }));

  if (run.status === 'running' && run.transport === 'rabbitmq') {
    console.log("✅ W-REG1: Workflow registered and enqueued via RabbitMQ mock");
  } else {
    console.error("❌ W-REG1: Workflow registration failed or returned wrong status", run);
    process.exit(1);
  }

  // 2. Check the list
  const runs = listPdfOcrWorkflowRuns();
  if (runs.some(r => r.workflowRunId === testId)) {
    console.log(`✅ W-REG2: Workflow found in session list (${runs.length} total)`);
  } else {
    console.error("❌ W-REG2: Workflow missing from session list");
    process.exit(1);
  }

  console.log("\n✨ Workflow Registration Logic: Verified.");
  process.exit(0);
}

verifyWorkflow().catch(err => {
  console.error("💥 Verification crashed:", err);
  process.exit(1);
});
