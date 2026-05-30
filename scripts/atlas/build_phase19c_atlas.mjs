#!/usr/bin/env node
// Phase19C: Build GPU-ready analytics dataset (local, no external writes)
// Inputs: outcome-ledger.ndjson, calls-edges.jsonl, uses-db.jsonl, uses-tool.jsonl, glyph_records.jsonl
// Outputs: atlas-training-dataset.jsonl, atlas-vector64-dataset.jsonl, atlas-reward-attribution.json

import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i=0;i<args.length;i++){
    const a = args[i];
    if (a.startsWith('--')){
      const k=a.replace(/^--/,'');
      const v = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true;
      opts[k]=v;
    }
  }
  return opts;
}

const opts = parseArgs();
const outDir = opts['out-dir'] || '.tmp';
const schemaMask = opts['schema-mask'] || 'phase19c.v1';
const graphVersion = opts['graph-version'] || '1';

const inputs = {
  ledger: opts['input-ledger'] || 'memory/exports/outcome-ledger.ndjson',
  calls: opts['input-calls'] || 'memory/exports/calls-edges.jsonl',
  usesDb: opts['input-uses-db'] || 'memory/exports/uses-db.jsonl',
  usesTool: opts['input-uses-tool'] || 'memory/exports/uses-tool.jsonl',
  glyphs: opts['input-glyphs'] || 'memory/exports/glyph_records.jsonl'
};

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function streamJsonLines(filePath, onLine){
  if (!fs.existsSync(filePath)) return 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl){
    if (!line.trim()) continue;
    try{
      const obj = JSON.parse(line);
      await onLine(obj);
      count++;
    }catch(e){ console.error('skipping bad json line', e.message); }
  }
  return count;
}

function hashToVector64(src){
  // Deterministic 64-dim float vector from sha256
  const h = crypto.createHash('sha256').update(String(src||'')).digest();
  const vec = new Array(64);
  // Use repeated hashing if needed
  let buf = Buffer.from(h);
  let idx = 0;
  while(idx < 64){
    for (let i=0;i+3<buf.length && idx<64;i+=4){
      const v = buf.readUInt32BE(i);
      // map 0..2^32-1 -> -1..1
      vec[idx++] = (v / 0xFFFFFFFF) * 2 - 1;
    }
    if (idx<64) buf = crypto.createHash('sha256').update(buf).digest();
  }
  return vec;
}

async function build(){
  const glyphMap = new Map(); // sourceRef -> glyph
  const ledgerRows = [];
  const calls = [];
  const usesDb = [];
  const usesTool = [];

  console.log('Phase19C: reading inputs (best-effort)...');

  await streamJsonLines(inputs.glyphs, (obj)=>{ if (obj.sourceRef) glyphMap.set(obj.sourceRef, obj); else if (obj.id) glyphMap.set(obj.id, obj); });
  const ledgerCount = await streamJsonLines(inputs.ledger, (obj)=>{ ledgerRows.push(obj); });
  const callsCount = await streamJsonLines(inputs.calls, (obj)=>{ calls.push(obj); });
  const usesDbCount = await streamJsonLines(inputs.usesDb, (obj)=>{ usesDb.push(obj); });
  const usesToolCount = await streamJsonLines(inputs.usesTool, (obj)=>{ usesTool.push(obj); });

  console.log(`read: glyphs=${glyphMap.size}, ledger=${ledgerCount}, calls=${callsCount}, usesDb=${usesDbCount}, usesTool=${usesToolCount}`);

  const trainingOut = fs.createWriteStream(path.join(outDir,'atlas-training-dataset.jsonl'));
  const vectorOut = fs.createWriteStream(path.join(outDir,'atlas-vector64-dataset.jsonl'));

  let matches = 0;
  const missingJoins = [];

  // Emit glyph records as primary training rows
  for (const [srcRef, glyph] of glyphMap.entries()){
    const id = glyph.id || srcRef || crypto.createHash('sha1').update(srcRef).digest('hex');
    const row = {
      id,
      sourceRef: srcRef,
      graphVersion: String(graphVersion),
      schemaMask,
      kind: 'glyph_record',
      payload: glyph
    };
    trainingOut.write(JSON.stringify(row)+"\n");
    // vector64
    const vec = hashToVector64(srcRef);
    vectorOut.write(JSON.stringify({ id, vector64: vec })+"\n");
  }

  // Attach ledger rows: try to match by sourceRef
  for (const l of ledgerRows){
    const src = l.sourceRef || l.source || l.card_source_ref;
    const id = l.id || (src ? `ledger:${src}` : `ledger:${crypto.randomUUID()}`);
    const matched = src && glyphMap.has(src);
    const row = { id, sourceRef: src || null, graphVersion: String(graphVersion), schemaMask, kind:'ledger_row', payload: l, matched };
    trainingOut.write(JSON.stringify(row)+"\n");
    if (matched) matches++; else missingJoins.push({ id, reason:'no glyph match', sample: l });
    vectorOut.write(JSON.stringify({ id, vector64: hashToVector64(src || id) })+"\n");
  }

  // Emit calls / edges as meta records
  for (const c of calls){
    const id = c.id || `call:${crypto.createHash('sha1').update(JSON.stringify(c)).digest('hex')}`;
    trainingOut.write(JSON.stringify({ id, sourceRef: c.sourceRef||null, graphVersion:String(graphVersion), schemaMask, kind:'call_edge', payload:c })+"\n");
  }

  for (const u of usesDb){ trainingOut.write(JSON.stringify({ id: u.id||`usedb:${crypto.createHash('sha1').update(JSON.stringify(u)).digest('hex')}`, sourceRef: u.sourceRef||null, graphVersion:String(graphVersion), schemaMask, kind:'uses_db', payload:u })+"\n"); }
  for (const u of usesTool){ trainingOut.write(JSON.stringify({ id: u.id||`usetool:${crypto.createHash('sha1').update(JSON.stringify(u)).digest('hex')}`, sourceRef: u.sourceRef||null, graphVersion:String(graphVersion), schemaMask, kind:'uses_tool', payload:u })+"\n"); }

  trainingOut.end(); vectorOut.end();

  const report = {
    timestamp: new Date().toISOString(),
    graphVersion: String(graphVersion),
    schemaMask,
    counts: { glyphs: glyphMap.size, ledgerRows: ledgerRows.length, calls: calls.length, usesDb: usesDb.length, usesTool: usesTool.length },
    matches,
    missingJoins: missingJoins.slice(0,100)
  };
  fs.writeFileSync(path.join(outDir,'atlas-reward-attribution.json'), JSON.stringify(report,null,2));

  console.log('wrote outputs to', outDir);
}

build().catch(err=>{ console.error(err); process.exit(1); });
