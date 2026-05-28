import fs from 'fs/promises';
import path from 'path';

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  try {
    const cardsDir = path.join(process.cwd(), '.opencode', 'cards');
    const prefer = path.join(cardsDir, 'invalid-summaries.jsonl');
    const fallback = path.join(cardsDir, 'summaries.merged.jsonl');
    const inFile = (await fileExists(prefer)) ? prefer : fallback;

    const outDir = path.join(process.cwd(), '.opencode', 'quarantine');
    const outFile = path.join(outDir, 'invalid-cards.ndjson');
    await fs.mkdir(outDir, { recursive: true });

    if (!(await fileExists(inFile))) {
      console.log('No input summaries file found at', prefer, 'or', fallback);
      // create empty quarantine file to satisfy caveman rule
      await fs.writeFile(outFile, '', 'utf8');
      console.log('Wrote empty quarantine file to', outFile);
      return;
    }

    const raw = await fs.readFile(inFile, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const l of lines) {
      try {
        const obj = JSON.parse(l);
        const summary = String(obj.summary ?? obj.summary_text ?? '').trim();
        const hasContent = (obj.file || obj.content || obj.body || '') ? true : false;
        if (!summary) {
          out.push({
            card_id: obj.card_id ?? obj.cardId ?? null,
            sourceRef: obj.sourceRef ?? obj.source_ref ?? null,
            reason: 'empty_summary_no_content',
            status: 'quarantined',
            payload: obj
          });
        }
      } catch (e) {
        // ignore parse errors
      }
    }

    await fs.writeFile(outFile, out.map(JSON.stringify).join('\n') + (out.length ? '\n' : ''), 'utf8');
    console.log('Wrote quarantine file with', out.length, 'entries to', outFile);
  } catch (err) {
    console.error('Failed to write quarantine file:', err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
