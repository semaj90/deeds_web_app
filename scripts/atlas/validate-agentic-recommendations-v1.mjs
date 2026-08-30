import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const INPUT = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');
const OUTPUT = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-readiness-v1.json');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const issues = [];
const add = (taskId, code, message) => issues.push({ taskId, code, message });

if (!fs.existsSync(INPUT)) {
  const report = {
    schema: 'atlas.agentic-recommendation-readiness.v1',
    generatedAt: new Date().toISOString(),
    input: path.relative(ROOT, INPUT),
    cardCount: 0,
    issueCount: 1,
    issues: [{ taskId: null, code: 'INPUT_MISSING', message: 'Recommendation workflow report is missing.' }],
    executionAllowed: false,
    canonicalWrites: 0,
    productionActivation: false,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'BLOCKED', ...report }));
  process.exitCode = 1;
}

if (fs.existsSync(INPUT)) {
  const inputText = fs.readFileSync(INPUT, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(inputText);
  } catch (error) {
    add(null, 'INPUT_INVALID_JSON', error instanceof Error ? error.message : String(error));
    parsed = [];
  }

  const cards = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.cards) ? parsed.cards : []);
  if (!Array.isArray(parsed) && !Array.isArray(parsed?.cards)) {
    add(null, 'CARDS_MISSING', 'Report must be an array or contain a cards array.');
  }

  const seen = new Set();
  for (const card of cards) {
    const taskId = card?.task_id ?? null;
    if (!taskId) add(null, 'TASK_ID_MISSING', 'Recommendation card has no task_id.');
    if (taskId && seen.has(taskId)) add(taskId, 'TASK_ID_DUPLICATE', 'task_id is not unique.');
    if (taskId) seen.add(taskId);
    if (!card?.query || typeof card.query !== 'string') add(taskId, 'QUERY_MISSING', 'Recommendation card has no query.');

    const status = String(card?.status ?? '').toLowerCase();
    const commands = Array.isArray(card?.recommended_commands) ? card.recommended_commands : [];
    if (status === 'ready' && commands.length === 0) {
      add(taskId, 'REMEDIATION_MISSING', 'READY card has no recommended command.');
    }
    for (const command of commands) {
      if (typeof command !== 'string' || command.trim() === '') {
        add(taskId, 'COMMAND_EMPTY', 'Recommended command is empty or not a string.');
        continue;
      }
      if (/node\s+-e\s+["']?console\.log/i.test(command)) {
        add(taskId, 'PLACEHOLDER_COMMAND', 'Placeholder console.log command cannot be executed.');
      }
      if (/validate-agentic-recommendations-v1\.mjs|replay-agentic-recommendations\.mjs/i.test(command)) {
        add(taskId, 'SELF_REFERENTIAL_COMMAND', 'Validator/replay command cannot be remediation work.');
      }
    }
  }

  const report = {
    schema: 'atlas.agentic-recommendation-readiness.v1',
    generatedAt: new Date().toISOString(),
    input: path.relative(ROOT, INPUT),
    inputChecksum: `sha256:${sha256(inputText)}`,
    cardCount: cards.length,
    issueCount: issues.length,
    issues,
    executionAllowed: issues.length === 0,
    canonicalWrites: 0,
    productionActivation: false,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: issues.length === 0 ? 'READY' : 'BLOCKED', ...report }));
  process.exitCode = issues.length === 0 ? 0 : 1;
}
