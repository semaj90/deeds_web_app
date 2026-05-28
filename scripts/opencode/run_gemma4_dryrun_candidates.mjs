import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import { join } from 'path';

const CANDIDATES = '.opencode/gemma4_candidates.ndjson';
const INDEX = '.opencode/cards/index.json';
const CARDS_DIR = '.opencode/cards';
const OUT = '.opencode/cards/summaries.jsonl';

function buildPrompt(card){
  return `Summarize the following document into a short JSON with keys: summary (one concise paragraph), tags (comma-separated keywords).\n\nDocument:\n${card.title}\n\n${card.text || card.excerpt || ''}`;
}

(async ()=>{
  try{
    const idxRaw = await fs.readFile(INDEX,'utf8');
    const index = JSON.parse(idxRaw);
    const idToFile = new Map(index.map(i=>[i.id, i.file]));

    const inStream = createReadStream(CANDIDATES, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });

    await fs.mkdir('.opencode/cards', { recursive: true });
    const outHandle = await fs.open(OUT, 'a');
    let written = 0;

    for await (const line of rl){
      if(!line.trim()) continue;
      let obj;
      try{ obj = JSON.parse(line); }catch(e){ continue; }
      const cardId = obj.card_id || obj.id;
      const fileName = idToFile.get(cardId);
      let card = { title: cardId, excerpt: '', text: '' };
      if(fileName){
        try{
          const raw = await fs.readFile(join(CARDS_DIR, fileName), 'utf8');
          card = JSON.parse(raw);
        }catch(e){ /* ignore */ }
      }
      const prompt = buildPrompt(card);
      // dry-run summary (no external call)
      const summary = `DRY_RUN summary for ${String(card.title).slice(0,120)}...`;
      const tags = obj.reasons || [];
      const out = { card_id: cardId, sourceRef: fileName || null, summary, keywords: tags, tags: ['source:dry-run','project:opencode'], file: fileName || null, mtime: 0 };
      await outHandle.write(JSON.stringify(out) + '\n');
      written++;
    }
    await outHandle.close();
    console.log('Wrote', written, 'dry-run summaries to', OUT);
  }catch(err){
    console.error('Error:', err.message);
    process.exitCode = 2;
  }
})();
