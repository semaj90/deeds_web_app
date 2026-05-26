#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'node:fs';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

const cwd = findRepoRoot(process.cwd());
const outputsDir = path.join(cwd, 'memory','knowledge');

async function exist(p){ try{ await fs.access(p); return true;}catch(e){return false} }

async function readLines(p){ try{ const t = await fs.readFile(p,'utf8'); return t.split(/\r?\n/).filter(Boolean); }catch(e){ return [] } }

async function main(){
  const cardsPath = path.join(outputsDir,'document-knowledge-cards.jsonl');
  const edgesPath = path.join(outputsDir,'document-knowledge-edges.jsonl');
  const manifestPath = path.join(outputsDir,'document-knowledge-manifest.json');

  const cardsExist = await exist(cardsPath);
  const edgesExist = await exist(edgesPath);
  const manifestExist = await exist(manifestPath);

  const cards = cardsExist ? await readLines(cardsPath) : [];
  const edges = edgesExist ? await readLines(edgesPath) : [];
  const manifest = manifestExist ? JSON.parse(await fs.readFile(manifestPath,'utf8')) : null;

  const out = {
    cards_count: cards.length,
    edges_count: edges.length,
    manifest: manifest || null,
    ready_for_embed: cards.length > 0
  };

  console.log(JSON.stringify(out, null, 2));
  if (cards.length === 0) process.exitCode = 1;
}

main().catch(e=>{ console.error(e); process.exitCode = 2 });
