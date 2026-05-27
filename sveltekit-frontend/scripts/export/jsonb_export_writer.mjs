#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd());
const aceDir = path.join(root, '.tmp', 'ace');
const candidates = [
  path.join(root, '.cache', 'cards'),
  path.join(root, '..', '.cache', 'cards'),
  path.join(root, 'sveltekit-frontend', '.cache', 'cards')
];
const outDir = path.join(root, '.tmp');
await fs.mkdir(outDir, { recursive: true });

function exists(p) {
  return fs.stat(p).then(() => true).catch(() => false);
}

async function findMetaFiles() {
  for (const c of candidates) {
    if (await exists(c)) {
      const files = await fs.readdir(c);
      return files.filter(f => f.endsWith('.meta.json')).map(f => path.join(c, f));
    }
  }
  return [];
}

async function findAcePackets() {
  if (!(await exists(aceDir))) return [];
  const files = await fs.readdir(aceDir);
  return files.filter(f => f.endsWith('.json')).map(f => path.join(aceDir, f));
}

const metas = await findMetaFiles();
const packets = await findAcePackets();

const metaMap = new Map();
for (const m of metas) {
  try {
    const raw = await fs.readFile(m, 'utf8');
    const obj = JSON.parse(raw);
    metaMap.set(obj.path.replace(/\\/g,'/'), { meta: obj, file: m });
  } catch (err) {
    console.error('skip meta', m, err.message);
  }
}

const packetMap = new Map();
for (const p of packets) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    const obj = JSON.parse(raw);
    const id = path.basename(p);
    packetMap.set(id, { file: p, packet: obj });
  } catch (err) {
    console.error('skip packet', p, err.message);
  }
}

const outNdjson = path.join(outDir, 'jsonb_export.ndjson');
const reportPath = path.join(outDir, 'jsonb_export_report.json');

let written = 0;
const outHandle = await fs.open(outNdjson, 'w');

for (const [key, { meta }] of metaMap.entries()) {
  const record = {
    id: meta.id || null,
    path: meta.path,
    sourceRef: meta.sourceRef || meta.path,
    area: meta.area || null,
    mtime: meta.mtime || null,
    content_hash: meta.content_hash || null,
    schema_version: meta.schema_version || null,
    msgpack: meta.msgpack || null,
    packets: []
  };

  for (const [pid, { packet, file }] of packetMap.entries()) {
    if (Array.isArray(packet.rankedCards)) {
      const hit = packet.rankedCards.find(rc => (rc.path || '').replace(/\\/g,'/') === meta.path);
      if (hit) {
        record.packets.push({ packet: pid, packetFile: file, score: hit.score, why: hit.why });
      }
    }
  }

  await outHandle.appendFile(JSON.stringify(record) + '\n', 'utf8');
  written++;
}

await outHandle.close();
await fs.writeFile(reportPath, JSON.stringify({ exported: written, ndjson: path.relative(root, outNdjson) }, null, 2), 'utf8');
console.log(`Exported ${written} records → ${path.relative(root, outNdjson)}; report: ${path.relative(root, reportPath)}`);
