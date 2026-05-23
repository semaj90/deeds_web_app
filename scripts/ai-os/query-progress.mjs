import fs from 'node:fs/promises';

const file = 'docs/ai-os/agentic-progress-log.ndjson';
const q = process.argv.slice(2).join(' ').toLowerCase();

let text = '';
try {
  text = await fs.readFile(file, 'utf8');
} catch {
  console.log(JSON.stringify({ ok: false, error: 'progress log missing' }, null, 2));
  process.exit(0);
}

const entries = text
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const hits = entries.filter((e) =>
  JSON.stringify(e).toLowerCase().includes(q)
);

console.log(JSON.stringify({
  ok: true,
  query: q,
  count: hits.length,
  hits: hits.slice(-20)
}, null, 2));
