#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CARDS_DIR = path.resolve(process.cwd(), '.opencode', 'cards');
const OUT_DIR = path.resolve(process.cwd(), '.opencode', 'ingest');
const AGENTS_FILENAMES = ['AGENTS.md', 'AGENTS.md.bak', 'llms.md', 'LLMS.md', 'llms.MD'];

async function ensureDir(d){
  try{ await fs.mkdir(d, { recursive: true }); }catch(e){ /* ignore */ }
}

function now(){ return new Date().toISOString(); }

async function findJsonFiles(dir){
  const out = [];
  if(!existsSync(dir)) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for(const e of entries){
    const p = path.join(dir, e.name);
    if(e.isDirectory()){
      out.push(...await findJsonFiles(p));
    } else if(e.isFile() && e.name.endsWith('.json')){
      out.push(p);
    }
  }
  return out;
}

async function readJsonSafe(file){
  try{
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt);
  }catch(e){
    return null;
  }
}

function normalizeCard(obj, srcPath){
  const id = obj.id || obj.key || path.basename(srcPath).replace(/\.[^.]+$/, '');
  return {
    id: String(id),
    title: obj.title || obj.name || id,
    path: srcPath,
    tags: obj.tags || obj.labels || [],
    content: obj.body || obj.content || obj.text || JSON.stringify(obj),
    source: srcPath,
    timestamp: now(),
  };
}

async function gatherAgentsToAppend(rootDir){
  const list = [];
  async function walk(d){
    const ents = await fs.readdir(d, { withFileTypes: true });
    for(const e of ents){
      const p = path.join(d, e.name);
      if(e.isDirectory()) await walk(p);
      else if(e.isFile() && AGENTS_FILENAMES.includes(e.name)){
        list.push(p);
      }
    }
  }
  if(!existsSync(rootDir)) return list;
  await walk(rootDir);
  return list;
}

async function run(){
  const argv = process.argv.slice(2);
  const APPLY = argv.includes('--apply');

  const jsonFiles = await findJsonFiles(CARDS_DIR);
  if(jsonFiles.length===0){
    console.log('No card JSON files found in', CARDS_DIR);
  }

  await ensureDir(OUT_DIR);
  const nodesPath = path.join(OUT_DIR, 'nodes.ndjson');
  const edgesPath = path.join(OUT_DIR, 'edges.ndjson');

  const nodesHandle = await fs.open(nodesPath, 'a');
  const edgesHandle = await fs.open(edgesPath, 'a');

  let total=0;
  for(const f of jsonFiles){
    const parsed = await readJsonSafe(f);
    if(!parsed) continue;
    const arr = Array.isArray(parsed)?parsed:[parsed];
    for(const c of arr){
      const node = normalizeCard(c, path.relative(process.cwd(), f));
      await nodesHandle.write(`${JSON.stringify(node)}\n`);
      total++;
    }
  }

  await nodesHandle.close();
  await edgesHandle.close();

  console.log(`Wrote ${total} nodes to ${nodesPath}`);

  // Prepare append notes for AGENTS/LLMS files (dry-run unless --apply)
  const repoRoot = process.cwd();
  const agentsFiles = await gatherAgentsToAppend(repoRoot);
  const note = `\n\n<!-- ingest: ${now()} -->\n- ingested_nodes: ${total} from ${CARDS_DIR}\n`;

  if(agentsFiles.length===0){
    console.log('No AGENTS.md / LLMS.md files found to append.');
  } else {
    for(const af of agentsFiles){
      console.log(`[DRY RUN] Would append note to ${af}`);
      if(APPLY){
        try{
          await fs.appendFile(af, note, 'utf8');
          console.log(`Appended note to ${af}`);
        }catch(e){
          console.error('Failed to append to', af, e.message);
        }
      }
    }
    console.log(`Found ${agentsFiles.length} agents/llms files (use --apply to append).`);
  }

  console.log('Done. Use --apply to make append changes.');
}

run().catch(e=>{ console.error(e); process.exit(1); });
