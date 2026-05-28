#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.opencode', 'cards');

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function splitIntoCards(content) {
  // Split by H1/H2 headings, keep heading as title
  const parts = content.split(/(^#{1,2}\s.+$)/m).map(s => s.trim()).filter(Boolean);
  const cards = [];
  for (let i = 0; i < parts.length; i += 2) {
    const title = parts[i].replace(/^#{1,2}\s+/, '').trim();
    const body = parts[i+1] ?? '';
    cards.push({ title, text: body });
  }
  if (cards.length === 0) cards.push({ title: 'doc', text: content });
  return cards;
}

async function processFile(filePath) {
  const st = await fs.stat(filePath).catch(() => null);
  if (st && st.size > 5 * 1024 * 1024) {
    // skip very large files (logs) to avoid OOM; callers can preprocess large logs separately
    console.warn('Skipping large file:', filePath, 'size=', st.size);
    return [];
  }
  const content = await fs.readFile(filePath, 'utf8');
  const cards = splitIntoCards(content);
  const meta = [];
  for (const c of cards) {
    const text = `${c.title}\n\n${c.text}`.trim();
    const id = hashText(text).slice(0, 16);
    const out = { id, title: c.title, text, source: path.relative(ROOT, filePath) };
    const dest = path.join(OUT_DIR, `${id}.json`);
    await fs.writeFile(dest, JSON.stringify(out, null, 2), 'utf8');
    meta.push(out);
  }
  return meta;
}

async function globDocs() {
  const walk = async (dir) => {
    let results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.venv') continue;
        results = results.concat(await walk(p));
      } else {
        if (/\.md$|\.txt$|\.log$/.test(e.name)) results.push(p);
      }
    }
    return results;
  };
  const candidates = [];
  // common locations
  const docsDirs = ['docs', 'docs/reports', 'logs', 'notes', '.'];
  for (const d of docsDirs) {
    try {
      const full = path.join(ROOT, d);
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.isDirectory()) {
        candidates.push(...await walk(full));
      }
    } catch (e) {}
  }
  return candidates;
}

async function main() {
  await ensureDir(OUT_DIR);
  console.log('Globbing docs/logs...');
  const files = await globDocs();
  console.log('Found', files.length, 'text files; splitting...');
  let total = 0;
  for (const f of files) {
    const meta = await processFile(f);
    total += meta.length;
  }
  console.log('Wrote', total, 'cards to', OUT_DIR);
}

main().catch(err => { console.error(err); process.exit(1); });
