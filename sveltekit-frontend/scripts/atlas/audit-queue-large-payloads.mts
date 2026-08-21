#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');

const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  'vendor',
  'vendors',
  'backups',
  'backup',
  'routes_parked',
  'reports',
  'snapshots',
  'snapshot',
  'temp_upload',
  'tmp',
]);

const patterns = [
  { id: 'RAW_VECTOR_INDEX_ROUTING_KEY', re: /vector\.index(?:\.document)?/g },
  { id: 'RAW_EMBEDDING_FIELD', re: /\bembedding\s*[,}:]/g },
  { id: 'RAW_VECTOR_FIELD', re: /\bvector\s*[,}:]/g },
  { id: 'RAW_TENSOR_FIELD', re: /\btensor\s*[,}:]/g },
  { id: 'ARTIFACT_ADDRESS', re: /ArtifactAddressV1|artifactAddressSchema|embeddingArtifact/g },
] as const;

type Hit = {
  file: string;
  line: number;
  pattern: (typeof patterns)[number]['id'];
  text: string;
};

async function walk(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_SEGMENTS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (/\.(?:ts|mts|js|mjs)$/.test(entry.name) && !/\.(?:spec|test)\./.test(entry.name)) {
      out.push(full);
    }
  }
}

const files: string[] = [];
await walk(SOURCE_ROOT, files);
files.sort();

const hits: Hit[] = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      if (!pattern.re.test(line)) continue;
      hits.push({
        file: path.relative(ROOT, file).replaceAll('\\', '/'),
        line: i + 1,
        pattern: pattern.id,
        text: line.trim().slice(0, 240),
      });
    }
  }
}

const rawRouting = hits.filter((hit) => hit.pattern === 'RAW_VECTOR_INDEX_ROUTING_KEY');
const artifactRefs = hits.filter((hit) => hit.pattern === 'ARTIFACT_ADDRESS');
const report = {
  schema: 'atlas.queue-large-payload-census.v1',
  scannedFiles: files.length,
  rawVectorRoutingHits: rawRouting.length,
  artifactReferenceHits: artifactRefs.length,
  rawVectorRoutingFiles: [...new Set(rawRouting.map((hit) => hit.file))],
  hits,
};

console.log(JSON.stringify(report, null, 2));

// This is an audit, not a destructive gate. QUEUE-05 remains open until the
// raw routing hits are either migrated or explicitly classified as bounded.
