#!/usr/bin/env tsx
import { runWorkflowLoopLangGraph } from '../../src/lib/server/ai/error-agent/workflow-loop-langgraph.js';
import { pool } from '../../src/lib/server/db/client.js';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  try {
    console.log('[smoke:error-agent] starting workflow loop via LangGraph...');

    const result = await runWorkflowLoopLangGraph({
      query: 'drizzle index desc constraint schema mismatch',
      hmmErrorClass: 'schema_mismatch',
      targetPath: 'sveltekit-frontend/src/lib/server/db/schema/retrieval-telemetry.ts',
      userId: '1',
      metadata: {
        selectedCards: ['nes:ai:06141086'],
        toonHash: 'smoke-toon-hash-12345',
        mcpCalls: [],
        cacheHits: 0
      }
    });

    console.log('[smoke:error-agent] workflow loop returned status:', result.status);

    assert(result.runId && typeof result.runId === 'string', 'runId is missing');
    assert(result.status === 'repaired' || result.status === 'needs_review', 'status mismatch');
    assert(result.classification && result.classification.lane === 'schema', 'classification lane must be schema');
    assert(result.repair && typeof result.repair.ok === 'boolean', 'repair.ok missing');
    assert(result.smoke && typeof result.smoke.passed === 'boolean', 'smoke.passed missing');
    assert(result.logged === true, 'logged must be true');

    console.log(JSON.stringify({
      ok: true,
      runId: result.runId,
      status: result.status,
      classification: result.classification,
      repair: {
        ok: result.repair.ok,
        summary: result.repair.summary,
        suggestedFixes: result.repair.suggestedFixes,
        touchedFiles: result.repair.touchedFiles
      },
      smoke: result.smoke
    }, null, 2));

  } finally {
    console.log('[smoke:error-agent] closing pool');
    await pool.end().catch(() => {});
    console.log('[smoke:error-agent] done');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
