import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSveltekitDocsHierarchyV1 } from './lib/sveltekit-docs-hierarchy-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawDir = path.join(root, 'docs/.okf/pinned/sveltekit/raw');
const manifestPath = path.join(root, '.tmp/atlas/sveltekit2-docs-corpus-analysis/manifest.json');
const chunksPath = path.join(root, 'docs/.okf/pinned/sveltekit/chunks.jsonl');
const outputPath = path.join(root, '.tmp/atlas/sveltekit2-docs-corpus-analysis/hierarchy.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.status !== 'MANIFEST_VALID') throw new Error('SVELTEKIT_DOCS_MANIFEST_NOT_VALID');
const rawFiles = manifest.files.map(file => ({ path: file.path, text: fs.readFileSync(path.join(root, file.path), 'utf8') }));
const metadataFiles = rawFiles.map(file => JSON.parse(fs.readFileSync(path.join(root, file.path.replace(/\.md$/, '.json')), 'utf8')));
const chunkRows = fs.readFileSync(chunksPath, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
const report = buildSveltekitDocsHierarchyV1({ rawFiles, metadataFiles, chunkRows });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, counts: report.counts, groups: report.navGroups.map(group => ({ name: group.name, pages: group.pages.length, status: group.status })), unmatched: report.unmatched, reportPath: path.relative(root, outputPath), datastoreWritesCommitted: report.datastoreWritesCommitted }, null, 2)}\n`);
