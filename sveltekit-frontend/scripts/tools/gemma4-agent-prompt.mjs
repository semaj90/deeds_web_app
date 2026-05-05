#!/usr/bin/env node
/**
 * gemma4-agent-prompt.mjs
 *
 * Stable VS-Code-callable runner for the agentic /api/ai/agent endpoint
 * (Gemma4 multi-step tool loop on the dev server :5173).
 *
 * Replaces the previous `node -e '...'` task body that broke under PowerShell
 * because pwsh treats `(text-only, :8090)` as a parameter list.
 *
 * Reads from env (set by the VS Code task `options.env`):
 *   GEMMA_PROMPT     required
 *   GEMMA_PIPELINE   optional (default: 'ace')
 */

const q = process.env.GEMMA_PROMPT;
if (!q) {
  console.error('No prompt set');
  process.exit(1);
}

const pipeline = process.env.GEMMA_PIPELINE ?? 'ace';
console.log(`\n🤖 Gemma4 Agentic Tool Loop (pipeline=${pipeline})\n   Query: ${q}\n`);

try {
  const res = await fetch('http://localhost:5173/api/ai/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-dev-bypass-auth': 'true',
    },
    body: JSON.stringify({
      query: q,
      pipeline,
      tools: ['rag_search', 'case_search', 'memory_recall', 'hyperedge_stats', 'agents_md'],
    }),
  });

  const d = await res.json();
  if (d.error) {
    console.error('Agent error:', d.error);
    process.exit(1);
  }

  console.log('\n=== Answer ===\n');
  console.log(d.answer ?? JSON.stringify(d, null, 2));
  console.log('\n--- Meta ---');
  console.log('Tools used:', d.toolsUsed?.join(', ') ?? 'none');
  console.log('Rounds:', d.rounds, '| Latency:', d.durationMs, 'ms');
} catch (e) {
  console.error('\n❌ Dev server not running on :5173');
  console.error("   Start it with: 'Dev: npm run dev (SvelteKit)'");
  console.error('   Error:', e?.message ?? e);
  process.exit(1);
}
