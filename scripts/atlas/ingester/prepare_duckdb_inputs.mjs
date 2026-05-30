#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IN = path.join(ROOT, '.tmp', 'ingest');
const OUT = path.join(IN, 'csv');

function ensure() { fs.mkdirSync(OUT, { recursive: true }); }

function readNDJSON(file){
  if(!fs.existsSync(file)) return [];
  let s = fs.readFileSync(file,'utf8');
  // if file contains many null chars, try utf16le
  const nulls = (s.match(/\u0000/g)||[]).length;
  if(nulls>100){
    try{ s = fs.readFileSync(file,'utf16le'); } catch (e){}
  }
  // final cleanup: remove unexpected nulls
  if(s.indexOf('\u0000')!==-1) s = s.replace(/\u0000/g,'');
  return s.split('\n').filter(Boolean).map(l=>{ try { return JSON.parse(l); } catch (e) { return null } }).filter(Boolean);
}

function toCsvRow(cols){ return cols.map(c=>{
  if (c===null||c===undefined) return '';
  const s = typeof c === 'string' ? c : JSON.stringify(c);
  // escape double quotes
  return '"'+s.replace(/"/g,'""')+'"';
}).join(',') }

function writeCsv(pathF, rows, header){
  const out = [header.join(','), ...rows.map(r=>toCsvRow(r))].join('\n')+'\n';
  fs.writeFileSync(pathF, out, 'utf8');
}

async function main(){
  ensure();
  const nodesFile = path.join(IN,'nodes.ndjson');
  const edgesFile = path.join(IN,'edges.ndjson');
  const nodes = readNDJSON(nodesFile);
  const edges = readNDJSON(edgesFile);
  const nodesCsv = path.join(OUT,'nodes.csv');
  const edgesCsv = path.join(OUT,'edges.csv');

  const nodeRows = nodes.map(n=>{
    const payload = n.payload || n;
    let payloadStr = '';
    try { payloadStr = JSON.stringify(payload); } catch(e){ payloadStr = String(payload); }
    const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64');
    return [ n.id || '', n.type || '', n.title || '', n.sourceRef || '', payloadB64 ];
  });
  writeCsv(nodesCsv, nodeRows, ['id','type','title','sourceRef','payload_b64']);
  // also write a minimal nodes CSV without payload to keep lines small for DuckDB
  const nodesMinimalCsv = path.join(OUT,'nodes_minimal.csv');
  const minimalRows = nodes.map(n=>[ n.id || '', n.type || '', n.title || '', n.sourceRef || '' ]);
  writeCsv(nodesMinimalCsv, minimalRows, ['id','type','title','sourceRef']);

  const edgeRows = edges.map(e=>[ e.from||'', e.to||'', e.kind||'' ]);
  writeCsv(edgesCsv, edgeRows, ['from','to','kind']);

  console.log('wrote CSVs:', nodesCsv, edgesCsv);
}

main().catch(e=>{ console.error(e); process.exit(1); });
