#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isoNow() { return new Date().toISOString().replace(/[:.]/g,'-'); }

function backupPath(orig) {
  const base = path.basename(orig);
  const ts = isoNow();
  const repairsDir = path.join(process.cwd(), '.tmp', 'repairs');
  if (!fs.existsSync(repairsDir)) fs.mkdirSync(repairsDir, { recursive: true });
  return path.join(repairsDir, `${base}.wrap-backup.${ts}`);
}

function wrapFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('MISSING', filePath);
    return { path: filePath, ok: false, reason: 'missing' };
  }
  const abs = path.resolve(filePath);
  const data = fs.readFileSync(abs);
  const stat = fs.statSync(abs);
  const digest = sha256(data);
  const backup = backupPath(abs);
  fs.copyFileSync(abs, backup);

  const meta = {
    meta_version: 'toon-1',
    encoding: 'toon-v1',
    source: path.relative(process.cwd(), abs),
    convertedAt: new Date().toISOString(),
    original: {
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256: digest
    },
    converter: { tool: 'wrap-as-single-json.cjs', backup }
  };

  const obj = { _meta: meta, content: data.toString('utf8') };
  const out = JSON.stringify(obj) + '\n';

  fs.writeFileSync(abs, out, { encoding: 'utf8' });
  console.log('WRAPPED', abs);
  return { path: abs, ok: true, backup };
}

function readTriageList() {
  const triage = path.join(process.cwd(), '.tmp', 'repairs', 'triage-results.json');
  if (!fs.existsSync(triage)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(triage, 'utf8'));
    return (j.results || []).filter(r => r.action === 'report_bad_lines' && r.ok === false).map(r => r.path);
  } catch (e) {
    console.error('Failed reading triage file', e.message);
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let targets = argv.filter(a => !a.startsWith('--'));
  const useTriage = argv.includes('--from-triage');
  if (useTriage) {
    const list = readTriageList();
    if (!list) {
      console.error('No triage list found at .tmp/repairs/triage-results.json');
      process.exitCode = 2; return;
    }
    targets = targets.concat(list);
  }
  if (targets.length === 0) {
    console.error('Usage: node wrap-as-single-json.cjs <file>... | --from-triage');
    process.exitCode = 2; return;
  }

  const results = [];
  for (const t of targets) {
    try { results.push(wrapFile(t)); }
    catch (e) { console.error('ERR', t, e.message); results.push({ path: t, ok: false, reason: e.message }); }
  }

  const reportPath = path.join(process.cwd(), '.tmp', 'repairs', `wrap-report.${isoNow()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log('Wrote report', reportPath);
}

if (require.main === module) main();
