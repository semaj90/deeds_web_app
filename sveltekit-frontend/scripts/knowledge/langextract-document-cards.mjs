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
const inputs = path.join(cwd, 'memory','knowledge','document-knowledge-cards.jsonl');
const out = path.join(cwd, 'memory','knowledge','document-knowledge-cards.langext.jsonl');
const manifestPath = path.join(cwd, 'memory','knowledge','document-knowledge-manifest.json');

function parseLines(text){ return text.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return null} }).filter(Boolean); }

function uniq(a){ return Array.from(new Set(a)); }

function extractEntitiesFromText(t){
  const text = (t||'').toString();
  const files = [];
  const routes = [];
  const tables = [];
  const envVars = [];
  const services = [];
  const commands = [];
  const models = [];

  // file paths (.ts .js .svelte .py .md)
  const fileRe = /([\w\/.\\-]+\.(?:ts|js|svelte|py|md))/gi;
  let m; while((m=fileRe.exec(text))){ files.push(m[1]); }

  // routes like /api/..., GET /api/..., /cases/[id]
  const routeRe = /\/(?:api|routes|cases|evidence|documents|assets)[\w\/-\[\]]*/gi;
  while((m=routeRe.exec(text))){ routes.push(m[0]); }

  // env vars ALL_CAPS_WORDS
  const envRe = /\b([A-Z0-9_]{3,40})\b/g;
  while((m=envRe.exec(text))){ const s=m[1]; if(/[A-Z_]/.test(s) && /[A-Z]/.test(s)) envVars.push(s); }

  // services common names
  const svcNames = ['redis','qdrant','postgres','ollama','rabbitmq','seaweed','minio','llama-server','simdjson','libtorch','nginx'];
  for (const s of svcNames) if (new RegExp('\\b'+s+'\\b','i').test(text)) services.push(s);

  // commands: `npm run ...` or inline `node scripts/...` or backticks
  const cmdRe = /(?:npm run [\w:-]+|node [\w\/.\\-]+|`[^`]{2,200}`)/gi;
  while((m=cmdRe.exec(text))){ commands.push(m[0].replace(/`/g,'')); }

  // models
  const modelRe = /embeddinggemma:latest|gemma4[-_:\w]*|qwen[0-9\.]*|nomic-embed-text/gi;
  while((m=modelRe.exec(text))){ models.push(m[0]); }

  // tables heuristic: words like users, cases, evidence, documents
  const tblCandidates = ['users','cases','evidence','documents','citations','glyph_records','agent_context_files'];
  for (const tkn of tblCandidates) if (new RegExp('\b'+tkn+'\b','i').test(text)) tables.push(tkn);

  return {
    files: uniq(files).slice(0,20),
    routes: uniq(routes).slice(0,20),
    tables: uniq(tables),
    envVars: uniq(envVars).slice(0,40),
    services: uniq(services),
    commands: uniq(commands).slice(0,20),
    models: uniq(models)
  };
}

async function main(){
  console.log('LangExtract: enriching document knowledge cards (dry-run)');
  let raw;
  try{ raw = await fs.readFile(inputs,'utf8'); }catch(e){ console.error('Input cards missing:', inputs); process.exitCode=2; return }
  const cards = parseLines(raw);
  const enriched = [];
  for (const c of cards){
    const text = (c.summary || '') + '\n' + (Array.isArray(c.featureLabels)?c.featureLabels.join(' '):'') + '\n' + (c.title||'') + '\n' + (c.sourceRefs||[]).join(' ');
    const ents = extractEntitiesFromText(text);
    const out = { ...c, entities: { ...(c.entities||{}), ...ents } };
    enriched.push(out);
  }

  await fs.mkdir(path.dirname(out), { recursive: true });
  const lines = enriched.map(e=>JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(out, lines, 'utf8');

  // update manifest
  try{
    const man = JSON.parse(await fs.readFile(manifestPath,'utf8'));
    man.generatedAt = new Date().toISOString();
    man.counts = { cards: enriched.length, edges: man.counts?.edges || 0 };
    man.langExtract = { enriched: true, file: out };
    await fs.writeFile(manifestPath, JSON.stringify(man,null,2),'utf8');
  }catch(e){ /* ignore */ }

  console.log(JSON.stringify({ enriched: enriched.length, out }, null, 2));
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
