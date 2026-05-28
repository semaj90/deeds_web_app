#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const summariesPath = path.resolve(root, '.opencode/cards/summaries.merged.jsonl');
const qdrantPath = path.resolve(root, '.opencode/cards/qdrant-upload.ndjson');
const backupPath = summariesPath + '.bak';

if (!fs.existsSync(summariesPath)){
  console.error('summaries file not found:', summariesPath);
  process.exit(1);
}

const lines = fs.readFileSync(summariesPath,'utf8').split(/\r?\n/).filter(Boolean);
const objs = lines.map(l=>{ try{return JSON.parse(l)}catch(e){return null}}).filter(Boolean);

// load qdrant upload points keyed by id or sourceRef
let qdrantLines = [];
if (fs.existsSync(qdrantPath)){
  qdrantLines = fs.readFileSync(qdrantPath,'utf8').split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l)}catch(e){return null}}).filter(Boolean);
}

function findQdrantSummaryFor(card){
  // try match by id or sourceRef in payload
  for (const entry of qdrantLines){
    if (entry && entry.payload){
      const p = entry.payload;
      if ((card.id && p.id && String(p.id) === String(card.id)) || (card.sourceRef && p.sourceRef && String(p.sourceRef)===String(card.sourceRef))) return p.summary || null;
    }
    // also support point shape {id, payload}
    if (entry && entry.points && Array.isArray(entry.points)){
      for (const pt of entry.points){
        const p = pt.payload||pt;
        if ((card.id && pt.id && String(pt.id)===String(card.id)) || (card.sourceRef && p && p.sourceRef && String(p.sourceRef)===String(card.sourceRef))) return p.summary||null;
      }
    }
  }
  return null;
}

const emptyCards = objs.filter(o=> !(o.summary && String(o.summary).trim()));
console.log('Total summaries:', objs.length, 'Empty summaries:', emptyCards.length);

const sample = emptyCards.slice(0,20).map(c=>{
  const contentFields = ['content','text','body','html','extracted_text','snippet','raw','markdown'];
  let foundField = null;
  let content = null;
  for (const f of contentFields){ if (c[f] && String(c[f]).trim()){ foundField = f; content = String(c[f]).trim(); break } }
  const qSummary = findQdrantSummaryFor(c);
  return {
    id: c.id || null,
    sourceRef: c.sourceRef || null,
    hasContent: !!content,
    contentField: foundField,
    contentLength: content? content.length : 0,
    qdrant_summary_present: !!qSummary
  };
});

console.log('Sample empty-summary cards (up to 20):');
console.log(JSON.stringify(sample, null, 2));

// Backup and fill deterministically
fs.copyFileSync(summariesPath, backupPath);
let changed = 0;
const updated = objs.map(o=>{
  if (!(o.summary && String(o.summary).trim())){
    // attempt to find content
    const contentFields = ['content','text','body','html','extracted_text','snippet','raw','markdown'];
    let found = null;
    for (const f of contentFields){ if (o[f] && String(o[f]).trim()){ found = { field: f, text: String(o[f]).trim() }; break } }
    if (found){
      // deterministic summary: first 300 chars, cut at last full stop if possible
      let s = found.text.replace(/\s+/g,' ').trim();
      let snippet = s.slice(0,300);
      const lastDot = snippet.lastIndexOf('. ');
      if (lastDot>50) snippet = snippet.slice(0, lastDot+1);
      o.summary = snippet;
      o._summary_filled = { method: 'deterministic_truncate', from: found.field };
      changed++;
    } else {
      // mark invalid
      o._valid = false;
      o._invalid_reason = 'empty_summary_no_content';
    }
  }
  return o;
});

// Write back
fs.writeFileSync(summariesPath, updated.map(o=>JSON.stringify(o)).join('\n') + '\n','utf8');
console.log('Updated summaries written. Filled', changed, 'summaries. Backup at', backupPath);

// Also produce a reject list file for invalid cards
const invalid = updated.filter(o=> o._valid === false).map(o=> ({ id: o.id, sourceRef: o.sourceRef, reason: o._invalid_reason }));
if (invalid.length) fs.writeFileSync(path.resolve(root,'.opencode/cards/invalid-summaries.jsonl'), invalid.map(i=>JSON.stringify(i)).join('\n')+'\n','utf8');
console.log('Invalid cards:', invalid.length, invalid.slice(0,20));

process.exit(0);
