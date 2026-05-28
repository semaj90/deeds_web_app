import fs from 'fs/promises';
import path from 'path';

function compactCounts(report) {
  return {
    quarantine_count: report.quarantine_count || 0,
    packets_scanned: report.packets_scanned || 0,
    overlapping_ids: report.overlapping_ids_count || 0
  };
}

async function readNDJSON(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

async function main() {
  try {
    const repo = process.cwd();
    const qPath = path.join(repo, '.opencode', 'quarantine', 'invalid-cards.ndjson');
    const packetsDir = path.join(repo, '.opencode', 'ace-packets');
    const outTmp = path.join(repo, '.tmp');
    await fs.mkdir(outTmp, { recursive: true });
    const reportPath = path.join(outTmp, 'ace-quarantine-scan-report.json');

    let quarantine = [];
    try {
      quarantine = await readNDJSON(qPath);
    } catch (e) {
      console.log('no-quarantine-file');
      await fs.writeFile(reportPath, JSON.stringify(compactCounts({})), 'utf8');
      console.log(JSON.stringify(compactCounts({})));
      return;
    }

    const qSet = new Set();
    for (const q of quarantine) {
      if (q.card_id) qSet.add(String(q.card_id));
      if (q.sourceRef) qSet.add(String(q.sourceRef));
      if (q.payload && q.payload.id) qSet.add(String(q.payload.id));
    }

    const files = await fs.readdir(packetsDir).catch(() => []);
    const packetFiles = files.filter(f => f.startsWith('packet-') && f.endsWith('.json')).map(f => path.join(packetsDir, f));

    let overlapping = new Set();
    let packetsScanned = 0;

    for (const pf of packetFiles) {
      const txt = await fs.readFile(pf, 'utf8');
      let obj;
      try { obj = JSON.parse(txt); } catch { continue; }
      packetsScanned++;
      // assume packet contains `cards` array or `entries`
      const candidates = [];
      if (Array.isArray(obj.cards)) candidates.push(...obj.cards);
      if (Array.isArray(obj.entries)) candidates.push(...obj.entries);
      if (obj.card) candidates.push(obj.card);
      if (candidates.length === 0) {
        // try shallow scan for id/sourceRef strings anywhere
        const s = txt;
        for (const key of qSet) if (s.includes(key)) overlapping.add(key);
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

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(compactCounts(report)));
  } catch (err) {
    console.error('scan-failed', err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
