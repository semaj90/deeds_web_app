#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const cwd = process.cwd();
const cardsPath = path.join(cwd, 'memory','knowledge','document-knowledge-cards.langext.jsonl');
const edgesPath = path.join(cwd, 'memory','knowledge','document-knowledge-edges.jsonl');
const acePacksPath = path.join(cwd, 'memory','knowledge','document-knowledge-ace-packs.jsonl');
const outPrune = path.join(cwd, 'memory','knowledge','prune-candidates.jsonl');
const outArchive = path.join(cwd, 'memory','knowledge','archive-candidates.jsonl');
const outProd = path.join(cwd, 'memory','knowledge','production-ready.jsonl');
const templatesDir = path.join(cwd, 'memory','knowledge','sql-templates');
const manifestPath = path.join(cwd, 'memory','knowledge','document-knowledge-manifest.json');

function parseLines(text){ return text.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return null} }).filter(Boolean); }

async function ensureDir(d){ try{ await fs.mkdir(d, { recursive:true }); }catch(e){} }

function writeJsonl(items, p){ return fs.writeFile(p, items.map(i=>JSON.stringify(i)).join('\n') + '\n','utf8'); }

async function makeSqlTemplate(card){
  const name = `${card.cardId}.sql.template`;
  const p = path.join(templatesDir, name);
  const sourceList = (card.sourceRefs||[]).slice(0,5).map(s=>`-- ${s}`).join('\n');
  const tpl = `-- Operator SQL template for card ${card.cardId}\n-- Title: ${card.title}\n-- Generated: ${new Date().toISOString()}\n${sourceList}\n\n-- VALIDATION: run the validationCommand below before applying.\n-- validationCommand: psql -U legal_admin -d legal_ai_db -c "-- put validation SQL here"\n\n/* Example: If this card refers to a sidecar SQL file, apply it manually after review: */\n-- psql -U legal_admin -d legal_ai_db -f /path/to/sveltekit-frontend/drizzle/000X_sidecar.sql\n\n/* Example safe audit insert (JSONB metadata record) */\nINSERT INTO knowledge_cards_audit(card_id, decision, reason, metadata) VALUES ('${card.cardId}', '<DECISION>', '<REASON>', $$${JSON.stringify(card,null,2)}$$);\n`;
  await fs.writeFile(p, tpl, 'utf8');
  return p;
}

async function main(){
  console.log('Prune/Archive decision engine: dry-run (no DB writes)');
  let raw;
  try{ raw = await fs.readFile(cardsPath,'utf8'); }catch(e){ console.error('Cards missing:', cardsPath); process.exitCode=2; return }
  const cards = parseLines(raw);
  const byId = new Map(cards.map(c=>[c.cardId, c]));

  let edges = [];
  try{ edges = parseLines(await fs.readFile(edgesPath,'utf8')); }catch(e){}
  const edgeIndex = new Map();
  for (const e of edges){ if (!edgeIndex.has(e.sourceId)) edgeIndex.set(e.sourceId, []); edgeIndex.get(e.sourceId).push(e); }

  let acePacks = [];
  try{ acePacks = parseLines(await fs.readFile(acePacksPath,'utf8')); }catch(e){}
  const aceSet = new Set(acePacks.map(p=>p.cardId));

  const prune = [];
  const archive = [];
  const prod = [];

  await ensureDir(templatesDir);

  for (const c of cards){
    const reasons = [];
    const edgesFor = edgeIndex.get(c.cardId) || [];

    // Rule: duplicates -> prune
    if (edgesFor.some(e=>e.relation==='duplicates')) reasons.push('has_duplicates');

    // Rule: lifecycle explicit
    if (c.lifecycle && c.lifecycle.status === 'candidate_prune') reasons.push('lifecycle_candidate_prune');
    if (c.lifecycle && c.lifecycle.status === 'archive_to_deeds_lab') reasons.push('lifecycle_archive');
    if (c.lifecycle && c.lifecycle.status === 'production_ready') reasons.push('lifecycle_production_ready');

    // Rule: no sourceRefs -> prune
    if (!(c.sourceRefs && c.sourceRefs.length>0)) reasons.push('no_sourceRefs');

    // Rule: low confidence -> prune
    if (c.lifecycle && typeof c.lifecycle.confidence === 'number' && c.lifecycle.confidence < 0.35) reasons.push('low_confidence');

    // Rule: experimental labels -> archive
    const labels = (c.featureLabels||[]).map(x=>x.toString().toLowerCase());
    if (labels.includes('experimental') || labels.includes('research') || /experiment|prototype|deprecated/i.test(c.title||'')) reasons.push('experimental_or_deprecated');

    // Rule: production-ready signals
    const hasTests = labels.includes('tests') || (c.entities && (c.entities.commands||[]).some(cmd=>/test/i.test(cmd)));
    if (hasTests && (c.sourceRefs && c.sourceRefs.length>0) && aceSet.has(c.cardId)) reasons.push('passes_production_checks');

    // Decision assembly
    let decision = 'active';
    if (reasons.includes('lifecycle_archive') || reasons.includes('experimental_or_deprecated')){
      decision = 'archive_to_deeds_lab';
      archive.push({ cardId: c.cardId, title: c.title, reasons });
      await makeSqlTemplate(c);
    } else if (reasons.includes('has_duplicates') || reasons.includes('no_sourceRefs') || reasons.includes('low_confidence') || reasons.includes('lifecycle_candidate_prune')){
      decision = 'candidate_prune';
      prune.push({ cardId: c.cardId, title: c.title, reasons });
      await makeSqlTemplate(c);
    } else if (reasons.includes('passes_production_checks') || reasons.includes('lifecycle_production_ready')){
      decision = 'production_ready';
      prod.push({ cardId: c.cardId, title: c.title, reasons });
    }

    // attach decision to card lifecycle (dry-run only)
    c.lifecycle = c.lifecycle || {};
    c.lifecycle.decision = decision;
    c.lifecycle.decisionReasons = reasons;
  }

  await writeJsonl(prune, outPrune);
  await writeJsonl(archive, outArchive);
  await writeJsonl(prod, outProd);

  // update manifest
  try{ const man = JSON.parse(await fs.readFile(manifestPath,'utf8')); man.generatedAt = new Date().toISOString(); man.pruneCandidates = prune.length; man.archiveCandidates = archive.length; man.productionReady = prod.length; await fs.writeFile(manifestPath, JSON.stringify(man,null,2),'utf8'); }catch(e){}

  console.log(JSON.stringify({ prune: prune.length, archive: archive.length, production: prod.length, templatesDir }, null, 2));
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
