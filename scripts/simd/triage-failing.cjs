const fs = require('fs');
const path = require('path');
const VALIDATION = path.resolve(__dirname, '../../.tmp/simd-native-bridge-validation.json');
const repairs = path.resolve(__dirname, '../../.tmp/repairs');
function safeWriteBackup(src, bak) {
  try { fs.mkdirSync(path.dirname(bak), { recursive: true }); fs.copyFileSync(src, bak); return true; } catch(e){ return false; }
}
function tryCompactFile(p) {
  const out = { path: p, action: null, ok: false, notes: null };
  if (!fs.existsSync(p)) { out.notes = 'missing'; return out; }
  const bak = path.join(repairs, path.basename(p) + '.bak');
  safeWriteBackup(p, bak);
  const s = fs.readFileSync(p, 'utf8');
  try {
    const o = JSON.parse(s);
    fs.writeFileSync(p, JSON.stringify(o) + '\n');
    out.ok = true; out.action = 'compacted_whole_json'; return out;
  } catch (e) {
    // Try per-line scan to find invalid lines
    const lines = s.split(/\r?\n/);
    const bad = [];
    for (let i=0;i<lines.length;i++){
      const ln = lines[i].trim();
      if (!ln) continue;
      try { JSON.parse(ln); } catch(err) { bad.push({line: i+1, msg: err.message, sample: ln.slice(0,200)}); }
    }
    const report = path.join(repairs, path.basename(p)+'.report.json');
    fs.writeFileSync(report, JSON.stringify({ path: p, checkedLines: lines.length, badCount: bad.length, bad }, null, 2));
    out.notes = 'line_report'; out.action = bad.length? 'report_bad_lines' : 'no_nonempty_lines'; out.ok = bad.length===0; return out;
  }
}
function main(){
  if (!fs.existsSync(VALIDATION)){ console.error('Validation report missing:', VALIDATION); process.exit(1); }
  const val = JSON.parse(fs.readFileSync(VALIDATION,'utf8'));
  const errors = val.errors || [];
  const paths = Array.from(new Set(errors.map(e=>e.path))).slice(0,200);
  console.log('Triage targets:', paths.length);
  const results = [];
  for (const p of paths){
    try {
      const res = tryCompactFile(p);
      console.log(res.path, res.action || res.notes, 'ok=',res.ok);
      results.push(res);
    } catch(e){ console.error('ERR',p,e.message); results.push({path:p, action:'error', notes:e.message}); }
  }
  const out = path.resolve(__dirname,'../../.tmp/repairs/triage-results.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: (new Date()).toISOString(), results }, null, 2));
  console.log('Wrote:', out);
}
main();
