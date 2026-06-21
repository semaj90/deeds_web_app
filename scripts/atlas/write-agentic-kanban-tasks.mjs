#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');
const kanbanJsonlPath = path.join(ROOT, '.tmp', 'kanban_tasks.jsonl');
const taskStateMdPath = path.join(ROOT, 'sveltekit-frontend', '.opencode', 'tasks', 'task-state.md');

if (!existsSync(workflowPath)) {
  console.error(`❌ Recommendation workflow index not found at ${workflowPath}`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(workflowPath, 'utf8'));

// 1. Write `.tmp/kanban_tasks.jsonl`
mkdirSync(path.dirname(kanbanJsonlPath), { recursive: true });
const jsonlContent = cards.map(c => JSON.stringify(c)).join('\n') + '\n';
writeFileSync(kanbanJsonlPath, jsonlContent, 'utf8');
console.log(`✓ Wrote .tmp/kanban_tasks.jsonl`);

// 2. Generate `sveltekit-frontend/.opencode/tasks/task-state.md`
mkdirSync(path.dirname(taskStateMdPath), { recursive: true });

const readyCards = cards.filter(c => c.status === 'ready');
const blockedCards = cards.filter(c => c.status === 'blocked');
const verifiedCards = cards.filter(c => c.status === 'verified');

const md = `# Temporal Kanban Task State

> **Spine Join**: Parent Atlas remains the canonical join and index spine.
> **Generated**: ${new Date().toISOString()}

---

## ⚡ READY FOR VERIFICATION

${readyCards.length === 0 ? '*No active ready tasks.*' : readyCards.map(c => `
### [${c.task_id}] ${c.query}
- **Symptom**: \`${c.symptom}\`
- **Root Cause**: ${c.root_cause}
- **Recommended Command**: \`${c.recommended_commands?.join('; ') ?? 'N/A'}\`
- **Confidence**: \`${c.confidence}\` | **Score**: \`${c.recommendation_score}\`
- **Top Files**: ${c.top_files?.map(f => `\`${f}\``).join(', ') ?? 'None'}
- **Graph Neighbors**: ${c.graph_neighbors?.map(n => `\`${n}\``).join(', ') ?? 'None'}
`).join('\n')}

---

## 🛑 BLOCKED

${blockedCards.length === 0 ? '*No blocked tasks.*' : blockedCards.map(c => `
### [${c.task_id}] ${c.query}
- **Symptom**: \`${c.symptom}\`
- **Root Cause**: ${c.root_cause}
- **Reason**: Blocked pending dependent fixes.
- **Top Files**: ${c.top_files?.map(f => `\`${f}\``).join(', ') ?? 'None'}
`).join('\n')}

---

## ✅ COMPLETED / VERIFIED

${verifiedCards.length === 0 ? '*No completed tasks.*' : verifiedCards.map(c => `
### [${c.task_id}] ${c.query}
- **Symptom**: \`${c.symptom}\`
- **Verification Command**: \`${c.verification_commands?.join('; ') ?? 'N/A'}\`
- **Status**: **VERIFIED**
`).join('\n')}
`;

writeFileSync(taskStateMdPath, md, 'utf8');
console.log(`✓ Wrote sveltekit-frontend/.opencode/tasks/task-state.md`);
