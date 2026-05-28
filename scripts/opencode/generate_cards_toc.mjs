#!/usr/bin/env node
import fs from 'fs/promises';
import { join } from 'path';

const CARDS_DIR = '.opencode/cards';
const OUT_MD = join(CARDS_DIR, 'TOC.md');
const OUT_JSON = join(CARDS_DIR, 'index.json');

function short(s, n = 160) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n).replace(/\s+$/,'') + '…' : s;
}

async function main(){
  try{
    const files = await fs.readdir(CARDS_DIR);
    const jsonFiles = files.filter(f=>f.endsWith('.json') && f !== 'index.json');
    const entries = [];
    for(const name of jsonFiles){
      const path = join(CARDS_DIR, name);
      try{
        const raw = await fs.readFile(path, 'utf8');
        const obj = JSON.parse(raw);
        const id = obj.id ?? name.replace(/\.json$/,'');
        const title = obj.title ?? obj.name ?? id;
        const excerpt = obj.excerpt ?? obj.summary ?? obj.content?.slice?.(0,320) ?? '';
        entries.push({ id, file: name, title, excerpt: short(String(excerpt), 240) });
      }catch(e){
        // skip malformed
        entries.push({ id: name.replace(/\.json$/,''), file: name, title: name, excerpt: '<<malformed JSON or unreadable>>' });
      }
    }

    // sort by title
    entries.sort((a,b)=> a.title.localeCompare(b.title));

    // write JSON index
    await fs.writeFile(OUT_JSON, JSON.stringify(entries, null, 2), 'utf8');

    // write markdown TOC
    const lines = [];
    lines.push('# OpenCode Cards — Table of Contents');
    lines.push('');
    lines.push('| ID | Title | Excerpt | File |');
    lines.push('|---|---|---|---|');
    for(const e of entries){
      // escape pipes in text
      const title = String(e.title).replace(/\|/g,'\\|');
      const excerpt = String(e.excerpt).replace(/\|/g,'\\|').replace(/\n/g,' ');
      lines.push(`| ${e.id} | ${title} | ${excerpt} | [${e.file}](${e.file}) |`);
    }
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);

    await fs.writeFile(OUT_MD, lines.join('\n'), 'utf8');
    console.log('TOC written to', OUT_MD, 'and', OUT_JSON);
  }catch(err){
    console.error('Failed to generate TOC:', err);
    process.exitCode = 2;
  }
}

main();
