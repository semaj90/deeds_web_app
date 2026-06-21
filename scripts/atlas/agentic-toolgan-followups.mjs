#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readNdjson, appendNdjson } from './lib/agentic-toolgan-core.mjs';

const planPath = path.join(ROOT, '.tmp', 'toolgan-current-plan.json');
const timelinePath = path.join(ROOT, 'memory', 'agentic', 'timeline.ndjson');
const followupsPath = path.join(ROOT, 'memory', 'agentic', 'followups.ndjson');

const reportMdPath   = path.join(ROOT, 'docs', 'reports', 'agentic-toolgan-summary.md');
const reportJsonPath = path.join(ROOT, 'docs', 'reports', 'agentic-toolgan-summary.json');

// Ensure output dirs
mkdirSync(path.dirname(reportMdPath), { recursive: true });

let currentPlan = null;
if (existsSync(planPath)) {
  currentPlan = JSON.parse(readFileSync(planPath, 'utf8'));
}

// 1. Create a follow-up recommendation if needed
if (currentPlan && currentPlan.result === 'failure') {
  const followup = {
    followup_id: `fu-${Date.now()}`,
    ts: new Date().toISOString(),
    linked_trace_id: currentPlan.trace_id,
    recommendation: `Investigate and retry task: intent=${currentPlan.intent} query="${currentPlan.query}". Failure signature: ${currentPlan.failure_signature}`,
    status: 'open'
  };
  appendNdjson(followupsPath, followup);
  console.log(`✓ Logged follow-up recommendation to memory/agentic/followups.ndjson`);
}

// 2. Read timeline to compile summary
const events = readNdjson(timelinePath);
let totalRuns = events.length;
let successCount = events.filter(e => e.result === 'success').length;
let failureCount = events.filter(e => e.result === 'failure').length;

const summary = {
  compiled_at: new Date().toISOString(),
  total_runs: totalRuns,
  success_count: successCount,
  failure_count: failureCount,
  recent_events: events.slice(-5).map(e => ({
    trace_id: e.trace_id,
    intent: e.intent,
    query: e.query,
    result: e.result,
    ts: e.ts
  }))
};

writeFileSync(reportJsonPath, JSON.stringify(summary, null, 2));
console.log(`✓ Wrote docs/reports/agentic-toolgan-summary.json`);

// Generate Markdown summary
const md = `# Tool-GAN Traversal Loop Summary

**Compiled At**: ${summary.compiled_at}
**Total Runs**: ${summary.total_runs}
- **Successes**: ${summary.success_count}
- **Failures**: ${summary.failure_count}

## Recent Timeline Events

${events.length === 0 ? '*No events logged in the timeline yet.*' : ''}
${events.slice(-10).map((e, idx) => `
### ${idx + 1}. Event trace_id=\`${e.trace_id}\`
- **Timestamp**: ${e.ts}
- **Agent**: \`${e.agent}\`
- **Intent**: \`${e.intent}\`
- **Query**: "${e.query}"
- **Tool Path**: ${e.tool_path.join(' ➔ ')}
- **Result**: **${e.result.toUpperCase()}**
- **Smoke/Replay Proof**: Smoke: \`${e.proof?.smoke ?? 'N/A'}\` | Replay: \`${e.proof?.replay ?? 'N/A'}\`
`).join('\n')}
`;

writeFileSync(reportMdPath, md);
console.log(`✓ Wrote docs/reports/agentic-toolgan-summary.md`);
