#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const triage = path.join(process.cwd(), '.tmp', 'repairs', 'triage-results.json');
if(!fs.existsSync(triage)){
  console.error('No triage results at', triage);
  process.exit(2);
}
const j = JSON.parse(fs.readFileSync(triage, 'utf8'));
const targets = (j.results||[]).filter(r=>r.action==='report_bad_lines'&&r.ok===false).map(r=>r.path);
if(targets.length===0){ console.log('No targets'); process.exit(0); }

let failures = 0;
for(const t of targets){
  console.log('\n---- CHECK', t);
  const res = spawnSync('node', ['scripts/simd/check-jsonl-lines.cjs', t], { stdio: 'inherit' });
  if(res.status !== 0) failures++;
}
console.log('\nDone. Failures:', failures);
process.exit(failures>0?1:0);
