#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function mkdirp(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function nowTs(){ return new Date().toISOString().replace(/[:.]/g,'-'); }

const WORK_DIR = process.cwd();
const TRIAGE_PATH = path.join(WORK_DIR, '.tmp', 'repairs', 'triage-results.json');
const OUT_DIR = path.join(WORK_DIR, '.tmp', 'repairs', 'unwrapped');
mkdirp(OUT_DIR);

function safeParseJson(s){ try{ return JSON.parse(s); }catch(e){ return null } }

function sanitizeControlChars(s){ // remove control chars except \n\r\t
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
}

function writeItems(outPath, items){
  const tmp = outPath + '.tmp';
  const payload = items.map(it => JSON.stringify(it)).join('\n') + '\n';
  fs.writeFileSync(tmp, payload, { encoding: 'utf8' });
  fs.renameSync(tmp, outPath);
}

function processWrappedFile(abs){
  const basename = path.basename(abs);
  const outPath = path.join(OUT_DIR, basename + '.items.jsonl');
  const report = { file: abs, out: outPath, status: 'unknown', details: [] };
  const raw = fs.readFileSync(abs, 'utf8');
  const firstLine = raw.split('\n',1)[0];
  let wrapper = safeParseJson(firstLine);
  if(!wrapper || typeof wrapper !== 'object' || (!wrapper._meta && !('content' in wrapper))){
    // fallback: try parse as NDJSON file (maybe already unwrapped items)
    const lines = raw.split('\n').filter(l=>l.trim());
    const parsed = [];
    for(const l of lines){ const p = safeParseJson(l); if(p) parsed.push(p); }
    if(parsed.length >= 2){ writeItems(outPath, parsed); report.status='extracted_ndjson'; report.details.push('Parsed as NDJSON with >=2 items'); return report; }
    // else treat whole file as content
    wrapper = { _meta: { source: 'unknown-auto' }, content: raw };
  }
  const content = String(wrapper.content || '');

  // 1) Try split by newline and parse lines
  const lines = content.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
  const parsedLines = [];
  for(const l of lines){ const p = safeParseJson(l); if(p) parsedLines.push(p); }
  if(parsedLines.length >= 2){ writeItems(outPath, parsedLines); report.status='extracted_lines'; report.details.push(`parsed_lines:${parsedLines.length}`); return report; }

  // 2) Try whole content JSON
  const whole = safeParseJson(content);
  if(whole){ if(Array.isArray(whole)){
    writeItems(outPath, whole);
    report.status='extracted_array'; report.details.push(`array_len:${whole.length}`);
    return report;
  } else if(typeof whole === 'object'){
    writeItems(outPath, [whole]); report.status='extracted_object'; report.details.push('single_object'); return report; }
  }

  // 3) Try sanitized per-line parse
  const san = sanitizeControlChars(content);
  const sanLines = san.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
  const parsedSan = [];
  for(const l of sanLines){ const p = safeParseJson(l); if(p) parsedSan.push(p); }
  if(parsedSan.length >= 2){ writeItems(outPath, parsedSan); report.status='extracted_sanitized_lines'; report.details.push(`san_parsed:${parsedSan.length}`); return report; }

  // 4) Fallback: chunk into pieces
  const max = 4000;
  const chunks = [];
  for(let i=0;i<content.length;i+=max){ const chunk = content.slice(i, i+max); chunks.push({ _meta: wrapper._meta || {}, chunk_index: Math.floor(i/max), content: chunk }); }
  writeItems(outPath, chunks);
  report.status='chunked_fallback'; report.details.push(`chunks:${chunks.length}`);
  return report;
}

function main(){
  const args = process.argv.slice(2);
  let fromTriage = false;
  if(args.includes('--from-triage')) fromTriage = true;

  // positional args are file paths to process directly
  const positional = args.filter(a => !a.startsWith('--'));

  let targets = [];
  if(positional.length > 0){ targets = positional; }
  else if(fromTriage && fs.existsSync(TRIAGE_PATH)){
    try{ const tri = JSON.parse(fs.readFileSync(TRIAGE_PATH,'utf8')); if(Array.isArray(tri.targets)) targets = tri.targets.map(t=>t.path).filter(Boolean); }
    catch(e){ console.error('Failed reading triage:', e.message); }
  }
  if(targets.length===0){ console.error('No triage targets found — falling back to scanning .tmp/repairs for .jsonl files');
    const dir = path.join(WORK_DIR, '.tmp', 'repairs');
    const all = [];
    function walk(d){ for(const f of fs.readdirSync(d)){ const fp = path.join(d,f); if(fs.statSync(fp).isDirectory()) walk(fp); else all.push(fp);} }
    try{ walk(dir); }catch(e){}
    targets = all.filter(p=>p.endsWith('.jsonl')||p.endsWith('.wrapped')||p.endsWith('.json')).slice(0,200);
  }

  const reports = [];
  for(const t of targets){ const abs = path.isAbsolute(t)? t : path.join(WORK_DIR, t); if(!fs.existsSync(abs)) { reports.push({file:abs, status:'missing'}); continue; }
    try{ const r = processWrappedFile(abs); reports.push(r); console.log('PROCESSED', abs, r.status, r.details.join('; ')); }
    catch(e){ reports.push({file:abs, status:'error', error: String(e)}); console.error('ERROR processing', abs, e.message); }
  }
  const reportPath = path.join(OUT_DIR, 'unwrap-report.'+nowTs()+'.json');
  fs.writeFileSync(reportPath, JSON.stringify({ created: new Date().toISOString(), reports }, null, 2));
  console.log('Wrote report', reportPath);
}

if(require.main === module) main();
