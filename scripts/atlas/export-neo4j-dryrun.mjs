#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, '.tmp');

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
}

function ensureOut(){ try{ fs.mkdirSync(OUT_DIR,{recursive:true}) }catch(e){} }

function main(){
  ensureOut();
  const fileNodes = readJsonl(path.join(OUT_DIR,'ast-file-nodes.jsonl'));
  const resolved = readJsonl(path.join(OUT_DIR,'ast-import-edges-resolved.jsonl'));

  // pick resolved local edges — accept several resolved-field variants
  const edges = resolved.filter(r => {
    const isLocal = r.classification === 'local_resolved' || r.classification === 'local_resolved_by_alias';
    const hasResolvedField = !!(r.resolvedPath || r.resolvedTo || r.targetSourceRef || (r.resolved === true && r.to));
    return isLocal && hasResolvedField;
  }).map(r => {
    // determine canonical target path (strip any #L... sourceRef suffix)
    const pick = r.targetSourceRef || r.resolvedPath || r.resolvedTo || r.to || null;
    let target = null;
    if (pick) {
      target = String(pick).replace(/#L\d+$/,'');
    }
    return { ...r, _neo4jTarget: target };
  });

  const nodeMap = new Map();
  for (const f of fileNodes) nodeMap.set(f.path, { id: f.path, size: f.size, ext: f.ext });

  // ensure target nodes exist in nodeMap
  for (const e of edges) {
    if (!nodeMap.has(e.from)) nodeMap.set(e.from, { id: e.from });
    const tgt = e._neo4jTarget || e.resolvedPath || e.resolvedTo || e.targetSourceRef || e.to;
    if (tgt && !nodeMap.has(tgt)) nodeMap.set(tgt, { id: tgt });
  }

  const nodes = Array.from(nodeMap.values()).map(n=>({ id: n.id, labels: ['File'], props: { size: n.size||null, ext: n.ext||null } }));
  const relationships = edges.map((e, i) => ({ id: `r${i}`, type: 'IMPORTS', from: e.from, to: (e._neo4jTarget || e.resolvedPath || e.resolvedTo || e.to), props: { spec: e.spec, classification: e.classification } }));

  const out = { generatedAt: new Date().toISOString(), nodeCount: nodes.length, edgeCount: relationships.length, nodes, relationships };
  const outPath = path.join(OUT_DIR, 'ast-neo4j-dryrun.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote', outPath, 'nodes=', nodes.length, 'edges=', relationships.length);
}

main();
