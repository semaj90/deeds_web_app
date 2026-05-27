#!/usr/bin/env node
// publish-cards-pointer.mjs
// Safe publisher: creates a registry-consumable pointer file that points to
// the latest index-gap memory cards and manifest without mutating the live registry.

import fs from 'fs/promises';
import path from 'path';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend' ? path.dirname(current) : current;
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(){
  const cwd = findRepoRoot(process.cwd());
  const manifestPath = arg('manifest', path.join(cwd, 'memory', 'knowledge', 'index-gap-memory-manifest.json'));
  const cardsPath = arg('cards', path.join(cwd, 'memory', 'knowledge', 'index-gap-memory-cards.jsonl'));
  const out = arg('out', path.join(cwd, 'sveltekit-frontend', 'docs', 'reports', 'index-gap-memory-cards-pointer.json'));

  try{
    const manifest = JSON.parse(await fs.readFile(manifestPath,'utf8'));
    const stat = await fs.stat(cardsPath);
    const pointer = {
      generatedAt: new Date().toISOString(),
      manifest: manifestPath,
      cards: cardsPath,
      cardsSizeBytes: stat.size,
      manifestSummary: manifest.counts ?? {},
    };
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify(pointer, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: true, out }, null, 2));
  }catch(e){
    console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
    process.exitCode = 2;
  }
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
