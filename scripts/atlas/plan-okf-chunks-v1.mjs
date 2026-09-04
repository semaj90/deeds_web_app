#!/usr/bin/env node
/** Deterministic UTF-8 chunk plan; read-only with respect to all stores. */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=') || true]; }));
const scanRoot = path.resolve(ROOT, String(args.get('root') || 'docs/.okf/dev/raw'));
const maxBytes = Math.max(256, Number(args.get('max-bytes') || 4096));
const limit = Math.max(1, Number(args.get('limit') || 512));
const output = path.resolve(ROOT, String(args.get('output') || 'docs/reports/okf-chunk-plan-v1.json'));
const excluded = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build']);
const supported = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.py', '.go', '.rs', '.json', '.yaml', '.yml', '.sql']);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const norm = (p) => p.replaceAll('\\', '/');

async function walk(dir, relative = '') {
  const rows = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (excluded.has(entry.name) || rows.length >= limit) continue;
    const absolute = path.join(dir, entry.name);
    const rel = norm(path.join(relative, entry.name));
    if (entry.isDirectory()) rows.push(...await walk(absolute, rel));
    else if (entry.isFile() && supported.has(path.extname(entry.name).toLowerCase())) rows.push({ absolute, relative: rel });
  }
  return rows.slice(0, limit);
}

function boundaries(bytes) {
  const chunks = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + maxBytes);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end <= start) end = Math.min(bytes.length, start + maxBytes);
    const newline = bytes.lastIndexOf(0x0a, end - 1);
    if (newline > start + Math.floor(maxBytes / 2)) end = newline + 1;
    chunks.push([start, end]);
    start = end;
  }
  return chunks;
}

async function main() {
  const files = await walk(scanRoot);
  const sources = [];
  const chunks = [];
  for (const file of files) {
    const bytes = await fs.readFile(file.absolute);
    const sourceRevision = hash(bytes);
    const sourceRef = `workspace:${file.relative}`;
    sources.push({ sourceRef, relativePath: file.relative, sourceRevision, byteLength: bytes.length });
    for (const [startByte, endByte] of boundaries(bytes)) {
      const chunkBytes = bytes.subarray(startByte, endByte);
      const chunkChecksum = hash(chunkBytes);
      chunks.push({
        schema: 'atlas.okf-chunk-plan-row.v1',
        chunkId: hash(`${sourceRef}\0${sourceRevision}\0${startByte}\0${endByte}`),
        sourceRef, sourceRevision, startByte, endByte,
        byteLength: endByte - startByte, chunkChecksum,
        canonicalAuthority: false,
        downstream: ['ast_grep', 'langextract', 'postgres_fts', 'semantic_768', 'ace_reference'],
      });
    }
  }
  const manifestMaterial = sources.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)).map((x) => `${x.sourceRef}\0${x.sourceRevision}\0${x.byteLength}`).join('\n');
  const report = {
    schema: 'atlas.okf-chunk-plan.v1', generatedAt: new Date().toISOString(),
    scanRoot: path.relative(ROOT, scanRoot).replaceAll('\\', '/'), limit, maxBytes,
    workspaceRevision: hash(manifestMaterial), sourceCount: sources.length, chunkCount: chunks.length,
    sourceOwner: 'scripts/atlas/plan-okf-chunks-v1.mjs', canonicalAuthority: false,
    writesPerformed: false, datastoreWritesPerformed: false, externalNetworkCallsPerformed: false,
    coordinateContract: 'startByte/endByte index exact UTF-8 source bytes; no character or timestamp identity',
    admissionNote: 'This is a pre-admission plan. Existing CanonicalChunkSchema requires an admitted UUID chunkId and workspaceId; no plan row is canonical until that adapter proves the mapping.',
    sources, chunks,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ report: path.relative(ROOT, output).replaceAll('\\', '/'), sourceCount: report.sourceCount, chunkCount: report.chunkCount, workspaceRevision: report.workspaceRevision, writesPerformed: false }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
