import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function sha256(file: string): Promise<string> {
  const h = createHash('sha256');
  h.update(await fs.readFile(file));
  return h.digest('hex');
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (entry.isFile() && entry.name.endsWith('.arrow')) out.push(p);
  }
  return out;
}

const root = process.argv[2] ?? 'atlas-cache';
const files = await walk(root).catch(() => []);
const index = [] as Array<{ path: string; byteLength: number; sha256: string }>;
for (const file of files.sort()) {
  const stat = await fs.stat(file);
  index.push({ path: file, byteLength: stat.size, sha256: await sha256(file) });
}
await fs.mkdir(root, { recursive: true });
await fs.writeFile(path.join(root, 'artifact-index.json'), JSON.stringify({ schemaVersion: 'atlas.arrow-index.v1', files: index }, null, 2));
console.log(JSON.stringify({ indexed: index.length, root }));
