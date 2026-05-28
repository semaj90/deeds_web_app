import fs from 'fs/promises';
import path from 'path';

async function main() {
  const repo = process.cwd();
  const inFile = path.join(repo, '.opencode', 'cards', 'summaries.merged.jsonl');
  const outDir = path.join(repo, '.opencode', 'quarantine');
  const outFile = path.join(outDir, 'invalid-cards.ndjson');
  await fs.mkdir(outDir, { recursive: true });
  try {
    const raw = await fs.readFile(inFile, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const l of lines) {
      try {
        const obj = JSON.parse(l);
        const summary = String(obj.summary ?? obj.summary_text ?? '').trim();
        if (!summary) {
          out.push({
            card_id: obj.card_id ?? obj.cardId ?? null,
            sourceRef: obj.sourceRef ?? obj.source_ref ?? null,
            reason: 'empty_summary_no_content',
            status: 'quarantined',
            payload: obj
          });
        }
      } catch (e) {}
    }
    await fs.writeFile(outFile, out.map(JSON.stringify).join('\n') + (out.length ? '\n' : ''), 'utf8');
    console.log('Wrote quarantine file with', out.length, 'entries to', outFile);
  } catch (e) {
    console.error('failed', e.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
