#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dynamically resolve 'nats' from sveltekit-frontend's node_modules
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { connect, StringCodec } = require('../../sveltekit-frontend/node_modules/nats');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const NATS_URL = process.env.NATS_URL || 'nats://127.0.0.1:4222';
const sc = StringCodec();

async function main() {
  console.log(`=== NATS / LangGraph Worker Smoke Test ===`);
  console.log(`Connecting to NATS at ${NATS_URL}...`);
  
  let nc;
  try {
    nc = await connect({ servers: NATS_URL });
    console.log(`Connected to NATS!`);
  } catch (err) {
    console.error(`Failed to connect to NATS:`, err);
    process.exit(1);
  }

  const results = {
    timestamp: new Date().toISOString(),
    nats_url: NATS_URL,
    subjects: {}
  };

  // Helper to publish and request response
  async function testSubject(subject, payload, isAsync = false) {
    console.log(`Testing subject '${subject}'...`);
    const startTime = performance.now();
    try {
      const data = sc.encode(JSON.stringify(payload));
      if (isAsync) {
        await nc.publish(subject, data);
        const duration = performance.now() - startTime;
        console.log(`  Published successfully to '${subject}' in ${duration.toFixed(1)}ms`);
        return { ok: true, type: 'publish', duration_ms: duration };
      } else {
        const response = await nc.request(subject, data, { timeout: 4000 });
        const decoded = JSON.parse(sc.decode(response.data));
        const duration = performance.now() - startTime;
        console.log(`  Received response from '${subject}' in ${duration.toFixed(1)}ms:`, decoded);
        return { ok: true, type: 'request_reply', duration_ms: duration, response: decoded };
      }
    } catch (err) {
      const duration = performance.now() - startTime;
      console.warn(`  Failed testing '${subject}':`, err.message);
      return { ok: false, error: err.message, duration_ms: duration };
    }
  }

  // 1. agent.task.execute
  results.subjects['agent.task.execute'] = await testSubject('agent.task.execute', {
    taskId: 'nats-smoke-task-1',
    query: 'NATS LangGraph worker no-op query',
    ctx: { dryRun: true }
  });

  // 2. retrieval.turbovec.rerank
  results.subjects['retrieval.turbovec.rerank'] = await testSubject('retrieval.turbovec.rerank', {
    vector: new Array(768).fill(0).map(() => Math.random() - 0.5),
    topK: 5,
    timeoutMs: 500
  });

  // 3. gpu.cuvs.search
  results.subjects['gpu.cuvs.search'] = await testSubject('gpu.cuvs.search', {
    query: 'cuvs benchmark smoke test',
    topK: 5,
    timeoutMs: 500
  });

  // 4. gpu.cuda.rank
  results.subjects['gpu.cuda.rank'] = await testSubject('gpu.cuda.rank', {
    query: 'cuvs rank smoke test',
    topK: 5,
    timeoutMs: 500
  });

  // 5. engram.feedback.async
  results.subjects['engram.feedback.async'] = await testSubject('engram.feedback.async', {
    runId: 'nats-smoke-run-1',
    summary: 'NATS LangGraph worker engram feedback summary no-op'
  }, true);

  await nc.close();
  console.log(`NATS connection closed.`);

  // Write reports
  const reportsDir = path.join(REPO_ROOT, 'docs', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, 'nats-langgraph-worker-smoke.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Wrote JSON report to ${jsonPath}`);

  // MD report
  const allOk = Object.values(results.subjects).every(s => s.ok);
  const md = `
# Runtime Queue Layer — NATS / LangGraph Smoke Test Report

Generated: ${results.timestamp}
NATS URL: ${results.nats_url}
Consolidated Status: **${allOk ? 'PASS' : 'FAIL'}**

## Subject Mappings Verification

| Subject | Pattern | Status | Type | Duration | Details / Error |
|---|---|---|---|---|---|
| **agent.task.execute** | Agent execution queue | ${results.subjects['agent.task.execute'].ok ? '✅ PASS' : '❌ FAIL'} | request-reply | ${results.subjects['agent.task.execute'].duration_ms.toFixed(1)}ms | ${results.subjects['agent.task.execute'].ok ? 'Worker acknowledged task execution' : results.subjects['agent.task.execute'].error} |
| **retrieval.turbovec.rerank** | Rerank queue | ${results.subjects['retrieval.turbovec.rerank'].ok ? '✅ PASS' : '❌ FAIL'} | request-reply | ${results.subjects['retrieval.turbovec.rerank'].duration_ms.toFixed(1)}ms | ${results.subjects['retrieval.turbovec.rerank'].ok ? `Returned ok=${results.subjects['retrieval.turbovec.rerank'].response?.ok}` : results.subjects['retrieval.turbovec.rerank'].error} |
| **gpu.cuvs.search** | cuVS search queue | ${results.subjects['gpu.cuvs.search'].ok ? '✅ PASS' : '❌ FAIL'} | request-reply | ${results.subjects['gpu.cuvs.search'].duration_ms.toFixed(1)}ms | ${results.subjects['gpu.cuvs.search'].ok ? `Returned ok=${results.subjects['gpu.cuvs.search'].response?.ok}` : results.subjects['gpu.cuvs.search'].error} |
| **gpu.cuda.rank** | CUDA rank queue | ${results.subjects['gpu.cuda.rank'].ok ? '✅ PASS' : '❌ FAIL'} | request-reply | ${results.subjects['gpu.cuda.rank'].duration_ms.toFixed(1)}ms | ${results.subjects['gpu.cuda.rank'].ok ? `Returned ok=${results.subjects['gpu.cuda.rank'].response?.ok}` : results.subjects['gpu.cuda.rank'].error} |
| **engram.feedback.async** | Engram feedback queue | ${results.subjects['engram.feedback.async'].ok ? '✅ PASS' : '❌ FAIL'} | publish | ${results.subjects['engram.feedback.async'].duration_ms.toFixed(1)}ms | Published without error |

## OpenCode Skill Contract (Mandatory Addendum)
- **likely_cause**: Verification of NATS task queues and LangGraph worker message subjects.
- **evidence**: \`scripts/verify/nats-langgraph-worker-smoke.mjs\`, NATS server running at :4222
- **patch_targets**: [\`scripts/verify/nats-langgraph-worker-smoke.mjs\`]
- **safe_next_command**: "node scripts/verify/nats-langgraph-worker-smoke.mjs"
- **smoke_command**: "node scripts/verify/nats-langgraph-worker-smoke.mjs"
- **report_path**: "docs/reports/nats-langgraph-worker-smoke.json"
`;

  const mdPath = path.join(reportsDir, 'nats-langgraph-worker-smoke.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`Wrote Markdown report to ${mdPath}`);

  if (!allOk) {
    process.exitCode = 1;
  }
}

main().catch(console.error);
