import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSveltekitDocsTermsV1 } from './lib/sveltekit-docs-terms-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, '.tmp/atlas/sveltekit2-docs-corpus-analysis/manifest.json');
const hierarchyPath = path.join(root, '.tmp/atlas/sveltekit2-docs-corpus-analysis/hierarchy.json');
const outputPath = path.join(root, '.tmp/atlas/sveltekit2-docs-corpus-analysis/terms.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hierarchy = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
if (manifest.status !== 'MANIFEST_VALID') throw new Error('SVELTEKIT_DOCS_MANIFEST_NOT_VALID');
const rawFiles = manifest.files.map(file => ({ path: file.path, text: fs.readFileSync(path.join(root, file.path), 'utf8') }));
const report = buildSveltekitDocsTermsV1({ rawFiles, hierarchy });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, counts: report.counts, formula: report.formula, reportPath: path.relative(root, outputPath), datastoreWritesCommitted: report.datastoreWritesCommitted }, null, 2)}\n`);
