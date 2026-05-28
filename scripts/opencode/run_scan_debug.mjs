import fs from 'fs';
import path from 'path';
const repo = process.cwd();
const qPath = path.join(repo, '.opencode', 'quarantine', 'invalid-cards.ndjson');
const packetsDir = path.join(repo, '.opencode', 'ace-packets');
const outTmp = path.join(repo, '.tmp');
const reportPath = path.join(outTmp, 'ace-quarantine-scan-report.json');
try {
  fs.mkdirSync(outTmp, { recursive: true });
  const quarantine = fs.existsSync(qPath) ? fs.readFileSync(qPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)) : [];
  const qSet = new Set();
  for (const q of quarantine) {
    if (q.card_id) qSet.add(String(q.card_id));
    if (q.sourceRef) qSet.add(String(q.sourceRef));
    if (q.payload && q.payload.id) qSet.add(String(q.payload.id));
  }
  const files = fs.existsSync(packetsDir) ? fs.readdirSync(packetsDir) : [];
  const packetFiles = files.filter(f => f.startsWith('packet-') && f.endsWith('.json')).map(f => path.join(packetsDir, f));
  const overlapping = new Set();
  let packetsScanned = 0;
  for (const pf of packetFiles) {
    const txt = fs.readFileSync(pf, 'utf8');
    let obj;
    try { obj = JSON.parse(txt); } catch {
      if (qSet.size > 0) for (const key of qSet) if (txt.includes(key)) overlapping.add(key);
      continue;
    }
    packetsScanned++;
    const candidates = [];
    if (Array.isArray(obj.cards)) candidates.push(...obj.cards);
    if (Array.isArray(obj.entries)) candidates.push(...obj.entries);
    if (obj.card) candidates.push(obj.card);
    if (candidates.length === 0) {
      for (const key of qSet) if (txt.includes(key)) overlapping.add(key);
      continue;
    }
    for (const c of candidates) {
      const ids = new Set();
      if (c.card_id) ids.add(String(c.card_id));
      if (c.id) ids.add(String(c.id));
      if (c.sourceRef) ids.add(String(c.sourceRef));
      if (c.payload && c.payload.id) ids.add(String(c.payload.id));
      for (const id of ids) if (qSet.has(id)) overlapping.add(id);
    }
  }
  const report = {
    quarantine_count: quarantine.length,
    packets_scanned: packetsScanned,
    overlapping_ids_count: overlapping.size,
    overlapping_ids_sample: Array.from(overlapping).slice(0, 20)
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('report written', reportPath);
  console.log(report);
} catch (e) {
  console.error('err', e);
  process.exit(1);
}
