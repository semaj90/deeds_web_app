import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const LOG = path.join(ROOT, 'docs/ai-os/agentic-progress-log.ndjson');
const MD = path.join(ROOT, 'docs/ai-os/progress-log.md');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const entry = {
  id: `log_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`,
  date: new Date().toISOString(),
  featureKey: arg('feature', 'unknown'),
  status: arg('status', 'partial'),
  summary: arg('summary', ''),
  problem: arg('problem', ''),
  errorSignature: arg('error', ''),
  filesTouched: arg('files', '').split(',').filter(Boolean),
  commandsRun: arg('commands', '').split(';;').filter(Boolean),
  sourceRefs: arg('sourceRefs', '').split(',').filter(Boolean),
  attemptedQueries: arg('queries', '').split(';;').filter(Boolean),
  rootCause: arg('rootCause', ''),
  fixApplied: arg('fix', ''),
  verification: {
    passed: arg('passed', 'false') === 'true',
    commands: arg('verify', '').split(';;').filter(Boolean)
  },
  nextAttempt: {
    tryDifferentQuery: arg('tryDifferentQuery', 'true') === 'true',
    query: arg('nextQuery', ''),
    notes: arg('nextNotes', '')
  },
  trustTier: arg('trustTier', 'synthetic')
};

await fs.mkdir(path.dirname(LOG), { recursive: true });
await fs.appendFile(LOG, JSON.stringify(entry) + '\n');

const mdBlock = `\n## ${entry.date} — ${entry.featureKey} — ${entry.status}\n\n${entry.summary}\n\n- Error: ${entry.errorSignature || 'n/a'}\n- Files: ${entry.filesTouched.join(', ') || 'n/a'}\n- Verification: ${entry.verification.passed ? 'passed' : 'not passed'}\n`;
await fs.appendFile(MD, mdBlock);

console.log(JSON.stringify({ ok: true, id: entry.id, log: LOG }, null, 2));
