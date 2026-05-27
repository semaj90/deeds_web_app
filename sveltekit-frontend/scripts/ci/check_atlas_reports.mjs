import fs from 'fs/promises';
import path from 'path';

const CWD = process.cwd();
const OVERRIDE_ROOT = process.env.ATLAS_ROOT;

// Candidate roots to search for `.tmp` and `reports` folders. This makes the checker
// tolerant to being invoked from different working directories (repo root, subfolders,
// inside container mounts, etc.). The operator can also set ATLAS_ROOT to force a path.
const candidates = [];
if (OVERRIDE_ROOT) candidates.push(path.resolve(OVERRIDE_ROOT));
candidates.push(path.resolve(CWD));
candidates.push(path.resolve(CWD, '..'));
candidates.push(path.resolve(CWD, 'sveltekit-frontend'));
candidates.push(path.resolve(CWD, '..', 'sveltekit-frontend'));

const CHECK_FILES = [
  ['phase17 jsonl', (root) => path.join(root, '.tmp', 'phase17-pytorch-features.jsonl')],
  ['phase18 jsonl', (root) => path.join(root, '.tmp', 'phase18-xgboost-rerank.jsonl')],
  ['phase17 report', (root) => path.join(root, 'reports', 'phase17-pytorch-feature-summary.md')],
  ['phase18 report', (root) => path.join(root, 'reports', 'phase18-xgboost-rerank-summary.md')],
];

async function countLines(filePath){
  try{
    const data = await fs.readFile(filePath, 'utf8');
    return data.split(/\r?\n/).filter(Boolean).length;
  }catch(e){
    return 0;
  }
}

async function main(){
  const debug = !!process.env.DEBUG;

  if(debug) console.log('Candidate roots:', candidates);

  // Try each candidate root; succeed if any root has all files non-empty.
  for(const root of candidates){
    if(debug) console.log('\nChecking candidate root:', root);
    let rootOk = true;
    for(const [name, pathFn] of CHECK_FILES){
      const p = pathFn(root);
      const n = await countLines(p);
      console.log(`${name}: ${p} -> ${n} non-empty lines`);
      if(n === 0){
        if(debug) console.error(`missing or empty: ${p}`);
        rootOk = false;
      }
    }
    if(rootOk){
      console.log('\nAtlas report check passed (root:', root, ')');
      process.exit(0);
    }
  }

  console.error('\nAtlas report check failed (no candidate root had all non-empty artifacts)');
  process.exit(1);
}

main().catch(err=>{ console.error(err); process.exit(2); });
