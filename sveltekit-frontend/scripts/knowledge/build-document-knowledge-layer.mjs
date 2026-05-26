#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'crypto';
import path from 'path';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

function fsSyncExists(p) {
  return existsSync(p);
}

function sha1(s){ return createHash('sha1').update(s).digest('hex'); }

async function safeReadJSON(p){ try { const t = await fs.readFile(p, 'utf8'); return JSON.parse(t); } catch(e){ return null; } }

function normalizeCard(raw){
  const title = raw.title || raw.name || raw.cardId || raw.filename || 'untitled';
  const summary = raw.summary || raw.description || '';
  const cardId = raw.cardId || raw.id || sha1(title + (raw.sourceRefs || []).join(','));
  return {
    cardId,
    kind: raw.kind || 'json-card',
    title,
    summary,
    sourceRefs: raw.sourceRefs || raw.sources || [],
    chunkIds: raw.chunkIds || [],
    summaryIds: raw.summaryIds || [],
    featureLabels: raw.featureLabels || [],
    clusterTags: raw.clusterTags || [],
    topoClass: raw.topoClass,
    entities: raw.entities || { files: [], routes: [], tables: [], envVars: [], services: [], commands: [], models: [] },
    graphLinks: raw.graphLinks || [],
    retrieval: raw.retrieval || { embeddingModel: 'embeddinggemma:latest', embeddingDim: 768 },
    lifecycle: raw.lifecycle || { status: 'active', confidence: 0.5, reason: '' }
  };
}

async function writeJsonl(items, outPath){
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const s = items.map(i => JSON.stringify(i)).join('\n') + '\n';
  await fs.writeFile(outPath, s, 'utf8');
}

async function main(){
  console.log('Document Knowledge builder: dry-run safe mode (no embeddings / external calls)');

  const cwd = findRepoRoot(process.cwd());
  const outputsDir = path.join(cwd, 'memory','knowledge');
  await fs.mkdir(outputsDir, { recursive: true });

  const candidates = [];

  // 1) sidecar-audit-validated.json
  const sidecarPath = path.join(cwd, 'sveltekit-frontend','drizzle','sidecar-audit-validated.json');
  const sidecars = await safeReadJSON(sidecarPath);
  if (sidecars && Array.isArray(sidecars.entries)){
    for (const s of sidecars.entries){
      candidates.push(normalizeCard({ kind: 'sidecar', title: s.file || s.name || s.filename, summary: s.reason || s.summary || '', sourceRefs: [sidecarPath], featureLabels: s.tags || [] }));
    }
  }

  // 2) parent atlas (if exists)
  const parentAtlasPath = path.join(cwd, 'docs','atlas','parent-atlas.json');
  const parent = await safeReadJSON(parentAtlasPath);
  if (parent && Array.isArray(parent.items)){
    for (const it of parent.items){
      candidates.push(normalizeCard({ kind: 'parent-atlas', title: it.title || it.name, summary: it.excerpt || it.summary || '', sourceRefs: [parentAtlasPath], featureLabels: it.tags || [] }));
    }
  } else if (parent && typeof parent === 'object'){
    // single object
    candidates.push(normalizeCard({ kind: 'parent-atlas', title: parent.title || 'parent-atlas', summary: parent.summary || '', sourceRefs: [parentAtlasPath] }));
  }

  // 3) .opencode/knowledge-notecards.jsonl (if produced earlier)
  const opencodeCards = path.join(cwd, 'sveltekit-frontend','.opencode','knowledge-notecards.jsonl');
  try {
    const stat = await fs.stat(opencodeCards);
    if (stat && stat.size > 0){
      const raw = (await fs.readFile(opencodeCards,'utf8')).split(/\r?\n/).filter(Boolean).map(l=>{try{return JSON.parse(l);}catch(e){return null}}).filter(Boolean);
      for (const r of raw) candidates.push(normalizeCard(r));
    }
  } catch(e){ /* ignore */ }

  // 4) shallow scan of memory/exports cluster-cards/pathway-cards
  const clusterPath = path.join(cwd, 'sveltekit-frontend','memory','exports','cluster-cards.jsonl');
  try { const t = await fs.readFile(clusterPath,'utf8'); t.split(/\r?\n/).filter(Boolean).forEach(l=>{ try{ candidates.push(normalizeCard(JSON.parse(l))) }catch(e){} }); } catch(e){}
  const pathwayPath = path.join(cwd, 'sveltekit-frontend','memory','exports','pathway-cards.jsonl');
  try { const t = await fs.readFile(pathwayPath,'utf8'); t.split(/\r?\n/).filter(Boolean).forEach(l=>{ try{ candidates.push(normalizeCard(JSON.parse(l))) }catch(e){} }); } catch(e){}

  // Deduplicate by cardId
  const byId = new Map();
  for (const c of candidates){ if (!byId.has(c.cardId)) byId.set(c.cardId, c); }
  const cards = Array.from(byId.values());

  // Minimal edge generation: if two cards share a featureLabel, link them as 'uses'
  const edges = [];
  const labelMap = new Map();
  for (const c of cards){ for (const lbl of c.featureLabels || []){ if (!labelMap.has(lbl)) labelMap.set(lbl, []); labelMap.get(lbl).push(c.cardId); } }
  for (const [lbl, ids] of labelMap.entries()){
    if (ids.length < 2) continue;
    for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) edges.push({ relation: 'uses', sourceId: ids[i], targetId: ids[j], reason: `shared_feature:${lbl}` });
  }

  // Write outputs
  const outCards = path.join(outputsDir, 'document-knowledge-cards.jsonl');
  const outEdges = path.join(outputsDir, 'document-knowledge-edges.jsonl');
  const manifest = path.join(outputsDir, 'document-knowledge-manifest.json');

  await writeJsonl(cards, outCards);
  await writeJsonl(edges, outEdges);
  const manifestObj = { generatedAt: new Date().toISOString(), counts: { cards: cards.length, edges: edges.length }, sources: { sidecar: sidecars?true:false, parentAtlas: parent?true:false, opencodeCards: false } };
  await fs.writeFile(manifest, JSON.stringify(manifestObj,null,2),'utf8');

  console.log(JSON.stringify({ cards_built: cards.length, graph_edges: edges.length, outputs: { outCards, outEdges, manifest } }, null, 2));
}

main().catch(err=>{ console.error('Error:', err); process.exitCode = 2; });
