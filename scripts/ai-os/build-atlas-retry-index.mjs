import fs from 'node:fs/promises';

const logPath = 'docs/ai-os/agentic-progress-log.ndjson';
const outPath = 'docs/ai-os/atlas-retry-index.json';

const raw = await fs.readFile(logPath, 'utf8').catch(() => '');
const entries = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));

const retry = entries
  .filter((e) => ['failed', 'partial', 'blocked', 'retry_needed'].includes(e.status))
  .map((e) => ({
    featureKey: e.featureKey,
    date: e.date,
    errorSignature: e.errorSignature,
    failedQuery: e.attemptedQueries,
    tryAgainWith: e.nextAttempt?.query,
    filesTouched: e.filesTouched,
    sourceRefs: e.sourceRefs
  }));

await fs.writeFile(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: retry.length,
  retry
}, null, 2));

console.log(JSON.stringify({ ok: true, outPath, count: retry.length }, null, 2));
