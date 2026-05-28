import fs from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const SCAN_PATHS = ['src', 'scripts', 'services', 'simd-bridge', 'go-microservice'];
const OUT_JSONL = path.join(ROOT, '.tmp', 'atlas-component-profiles.jsonl');
const OUT_MD = path.join(ROOT, 'reports', 'atlas-component-profiles.md');

const DID_YOU_MEAN = {
  hmm: ['Hidden Markov Model', 'sequence model', 'state transition model'],
  rnn: ['Recurrent Neural Network', 'sequence neural model'],
  cuda: ['NVIDIA GPU compute', 'kernel acceleration'],
  rtx: ['NVIDIA GPU hardware lane'],
  tensor: ['multidimensional numeric array'],
  pytorch: ['Python tensor/ML framework'],
  libtorch: ['C++ PyTorch runtime'],
  clustering: ['k-means', 'centroids', 'nearest cluster']
};

async function exists(p){
  try{ await fs.access(p); return true }catch(e){return false}
}

function getKind(filePath){
  if (/src\\\\routes\\\\api|src\/routes\/api/.test(filePath)) return 'api_route';
  if (/src\\\\mcp|src\/mcp/.test(filePath)) return 'mcp_tool';
  if (/simd-bridge|simd_bridge/.test(filePath)) {
    if (/\\.node$/.test(filePath) || /tensorrt|libtorch|torch/i.test(filePath)) return 'libtorch_addon';
    return 'cuda_bridge';
  }
  if (/\\.svelte$/.test(filePath)) return 'svelte_component';
  if (/\\.(ts|js|mjs|tsx|jsx)$/.test(filePath)) return 'typescript_module';
  if (/drizzle|schema|migrations/.test(filePath)) return 'db_table';
  if (/redis|cache|redis-key/.test(filePath)) return 'redis_key';
  if (/qdrant|vector|pgvector/.test(filePath)) return 'qdrant_collection';
  return 'file';
}

async function* walk(dir){
  for (const name of await fs.readdir(dir, { withFileTypes: true })){
    const res = path.join(dir, name.name);
    if (name.isDirectory()){
      if (name.name === 'node_modules' || name.name === '.git' || name.name === '.tmp') continue;
      yield* walk(res);
    } else {
      yield res;
    }
  }
}

function extractImportsExports(text){
  const imports = [];
  const exports = [];
  const importRe = /import\s+(?:[^'";]+)\s+from\s+['\"]([^'\"]+)['\"]/g;
  const requireRe = /require\(['\"]([^'\"]+)['\"]\)/g;
  const exportRe = /export\s+(?:default\s+)?(function|class|const|let|var)\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = importRe.exec(text))){ imports.push(m[1]); }
  while ((m = requireRe.exec(text))){ imports.push(m[1]); }
  while ((m = exportRe.exec(text))){ exports.push(m[2]); }
  return { imports: Array.from(new Set(imports)), exports: Array.from(new Set(exports)) };
}

function shortSummary(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  if (lines[0].startsWith('//') || lines[0].startsWith('/*') || lines[0].startsWith('#')){
    // take first 3 comment lines
    return lines.slice(0,3).map(l=>l.replace(/^\/\*+|\*+\/$|^\/\//,'').trim()).join(' ');
  }
  // fallback: first non-empty line up to 120 chars
  return lines[0].slice(0,240);
}

function semanticLabelsFor(text){
  const labels = new Set();
  const lc = text.toLowerCase();
  if (lc.includes('json')) labels.add('json_fast_path');
  if (lc.includes('qdrant')||lc.includes('vector')) labels.add('qdrant_hot_path');
  if (lc.includes('.node')||lc.includes('libtorch')||lc.includes('tensorrt')) labels.add('native_bridge');
  if (lc.includes('embed')) labels.add('embeddings');
  if (lc.includes('cache')) labels.add('cache');
  return Array.from(labels);
}

function detectHardwareLane(text){
  const lc = text.toLowerCase();
  if (lc.includes('cuda')||lc.includes('cublas')||lc.includes('tensorrt')) return 'gpu/cuda';
  if (lc.includes('wasm')||lc.includes('webgpu')) return 'webgpu/wasm';
  if (lc.includes('.node')||lc.includes('libtorch')) return 'cpu/native';
  return 'cpu';
}

async function main(){
  const results = [];
  for (const p0 of SCAN_PATHS){
    const abs = path.join(ROOT, p0);
    if (!await exists(abs)) continue;
    for await (const f of walk(abs)){
      // limit to code files
      if (!/\.(ts|js|mjs|tsx|jsx|svelte|sql|json|py|cpp|cc|h|hpp)$/.test(f)) continue;
      try{
        const content = await fs.readFile(f, 'utf8');
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        const kind = getKind(rel);
        const name = path.basename(f).replace(/\.(ts|js|mjs|tsx|jsx|svelte)$/,'');
        const { imports, exports } = extractImportsExports(content);
        const what = shortSummary(content) || `File ${rel}`;
        const dependencies = [];
        for (const im of imports){
          if (im.endsWith('.node') || im.includes('libtorch') || im.includes('tensorrt')) dependencies.push(im);
        }
        const profile = {
          sourceRef: rel,
          kind,
          name,
          what_is_it: what,
          canonical_library: null,
          imports,
          exports,
          dependencies: dependencies.length?dependencies:[],
          hardware_lane: detectHardwareLane(content),
          related_terms: [],
          did_you_mean: [],
          semantic_labels: semanticLabelsFor(content),
          status: 'implemented',
          risk_notes: ''
        };
        // add DID YOU MEAN fuzzy suggestions from tokens in path
        Object.keys(DID_YOU_MEAN).forEach(k=>{ if (rel.toLowerCase().includes(k)) profile.did_you_mean.push(...DID_YOU_MEAN[k]); });
        results.push(profile);
      }catch(e){ /* skip unreadable */ }
    }
  }

  // ensure output dirs
  await fs.mkdir(path.dirname(OUT_JSONL), { recursive: true });
  await fs.mkdir(path.dirname(OUT_MD), { recursive: true });

  // write JSONL
  const outStream = (await fs.open(OUT_JSONL, 'w'));
  for (const r of results){
    await outStream.appendFile(JSON.stringify(r) + '\n');
  }
  await outStream.close();

  // write simple markdown report
  const byKind = results.reduce((acc, r)=>{ acc[r.kind]=(acc[r.kind]||0)+1; return acc }, {});
  const md = [
    '# Atlas Component Profiles',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `Total profiles: ${results.length}`,
    '',
    '### Counts by kind',
    ...Object.entries(byKind).map(([k,c])=>`- **${k}**: ${c}`),
    '',
    '## Sample entries',
    ...results.slice(0,20).map(r=>`- **${r.name}** (${r.kind}) — ${r.what_is_it} — imports: ${r.imports.length}`),
    '',
    '## Next steps',
    '- Review `.tmp/atlas-component-profiles.jsonl` for completeness',
    '- Load into Postgres table `atlas_component_profiles` (schema: sourceRef TEXT PRIMARY KEY, payload JSONB)',
    '- Index into Qdrant collection `atlas_component_profiles_768` with `embeddinggemma:latest`',
    '- Cache hot items in Redis key `atlas:profiles:hot`',
    '',
    '## Notes',
    '- This scan uses heuristics. Manually review high-risk/native files for correctness.'
  ].join('\n');

  await fs.writeFile(OUT_MD, md, 'utf8');

  console.log('Wrote:', OUT_JSONL, OUT_MD);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('build-component-profiles.mjs')){
  main().catch(err=>{ console.error(err); process.exit(2); });
}
