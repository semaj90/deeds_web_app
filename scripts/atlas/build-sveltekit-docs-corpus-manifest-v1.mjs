import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSveltekitDocsCorpusManifestV1 } from './lib/sveltekit-docs-corpus-manifest-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusRoot = path.join(repoRoot, 'docs', '.okf', 'pinned', 'sveltekit');
const rawRoot = path.join(corpusRoot, 'raw');
const rawFiles = fs.readdirSync(rawRoot, { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.md'))
  .map(entry => ({ path: `docs/.okf/pinned/sveltekit/raw/${entry.name}`,
    bytes: fs.readFileSync(path.join(rawRoot, entry.name)) }));
const manifest = buildSveltekitDocsCorpusManifestV1({ rawFiles,
  chunksFileBytes: fs.readFileSync(path.join(corpusRoot, 'chunks.jsonl')) });
const outputDirectory = path.join(repoRoot, '.tmp', 'atlas', 'sveltekit2-docs-corpus-analysis');
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'manifest.json');
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ...manifest, reportPath: path.relative(repoRoot, outputPath).replaceAll('\\', '/') }, null, 2));
if (manifest.status !== 'MANIFEST_VALID') process.exitCode = 2;
