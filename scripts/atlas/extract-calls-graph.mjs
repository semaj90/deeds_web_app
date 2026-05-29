#!/usr/bin/env node
// scripts/atlas/extract-calls-graph.mjs
// Lightweight CALLS extractor (dry-run). Produces .tmp/calls-edges.jsonl
// and .tmp/calls-neo4j-dryrun.json (nodes+relationships). Does NOT write to DB.

import fs from 'fs';
import path from 'path';

const ROOTS = ['src', 'sveltekit-frontend/src'];
const OUT_DIR = '.tmp';
const OUT_JSONL = path.join(OUT_DIR, 'calls-edges.jsonl');
const OUT_NEO = path.join(OUT_DIR, 'calls-neo4j-dryrun.json');

function mkdirpSync(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function walkFiles(dir, exts = ['.ts', '.js', '.tsx', '.jsx']) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      // skip node_modules and build
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build') continue;
      out.push(...walkFiles(full, exts));
    } else if (st.isFile()) {
      if (exts.includes(path.extname(name))) out.push(full);
    }
  }
  return out;
}

// Minimal regex-based call extractor as fallback
function extractCallsRegex(source) {
  const calls = [];
  // match simple function calls: fooBar(...), obj.method(...)
  const callRe = /([\w$\.]+)\s*\(/g;
  let m;
  while ((m = callRe.exec(source)) !== null) {
    const name = m[1];
    // ignore `if(` `while(` etc — crude filter
    if (/^(if|for|while|switch|catch|function|return|console|import|export)$/.test(name)) continue;
    const idx = m.index;
    const prefix = source.slice(0, idx);
    const line = prefix.split(/\r?\n/).length;
    calls.push({ callee: name, line });
  }
  return calls;
}

function canonicalizeNodeId(kind, name) {
  return `${kind}::${name}`;
}

function writeJsonl(filepath, records) {
  const s = records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(filepath, s, 'utf8');
}

function buildNeoDryrun(edges) {
  const nodes = new Map();
  const rels = [];
  for (const e of edges) {
    const callerId = canonicalizeNodeId('function', `${e.from}::${e.caller || '<top>'}`);
    const calleeId = canonicalizeNodeId('function', e.callee);
    if (!nodes.has(callerId)) nodes.set(callerId, { id: callerId, label: 'Function', props: { file: e.from, name: e.caller || '<top>' } });
    if (!nodes.has(calleeId)) nodes.set(calleeId, { id: calleeId, label: 'Function', props: { name: e.callee } });
    rels.push({ from: callerId, to: calleeId, type: 'CALLS', props: { loc: e.loc } });
  }
  return { nodes: Array.from(nodes.values()), relationships: rels };
}

async function main() {
  mkdirpSync(OUT_DIR);
  const files = [];
  for (const root of ROOTS) files.push(...walkFiles(root));

  console.log('Files to scan:', files.length);

  const edges = [];
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    // try TS parse if available
    let parsedWithTS = false;
    try {
      const ts = await import('typescript');
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true);
      const visit = (node) => {
        // CallExpression
        if (ts.isCallExpression(node)) {
          let callee = 'unknown';
          const expr = node.expression;
          if (ts.isIdentifier(expr)) callee = expr.text;
          else if (ts.isPropertyAccessExpression(expr)) callee = `${expr.expression.getText(sf)}.${expr.name.getText(sf)}`;
          const { line } = ts.getLineAndCharacterOfPosition(sf, node.pos);
          edges.push({ from: path.relative('.', f).replace(/\\/g, '/'), caller: null, callee, loc: { line: line + 1 } });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      parsedWithTS = true;
    } catch (e) {
      // fallback
      parsedWithTS = false;
    }

    if (!parsedWithTS) {
      const calls = extractCallsRegex(src);
      for (const c of calls) edges.push({ from: path.relative('.', f).replace(/\\/g, '/'), caller: null, callee: c.callee, loc: { line: c.line } });
    }
  }

  writeJsonl(OUT_JSONL, edges);
  const neo = buildNeoDryrun(edges);
  fs.writeFileSync(OUT_NEO, JSON.stringify(neo, null, 2), 'utf8');

  console.log('Wrote', OUT_JSONL, 'records=', edges.length);
  console.log('Wrote', OUT_NEO, 'nodes=', neo.nodes.length, 'rels=', neo.relationships.length);
}

main().catch(e => { console.error(e); process.exit(1); });
