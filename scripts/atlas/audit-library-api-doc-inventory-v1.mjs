#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inventoryNpm, inventoryNonNpmManifests } from './lib/library-doc-inventory-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i < 0 ? fallback : path.resolve(args[i + 1] ?? '');
};
const repoDir = valueAfter('--repo-dir', ROOT);
const catalogPath = valueAfter('--catalog', path.join(ROOT, 'docs/.okf/dev/library-api-doc-catalog-v1.json'));
const writeReport = args.includes('--write-report');
const unknown = args.filter((arg, i) => !['--repo-dir', '--catalog'].includes(arg) && args[i - 1] !== '--repo-dir' && args[i - 1] !== '--catalog' && arg !== '--write-report');
if (unknown.length) throw new Error(`UNKNOWN_ARGUMENTS:${unknown.join(',')}`);
if (!fs.existsSync(repoDir)) throw new Error(`REPOSITORY_NOT_FOUND:${repoDir}`);
const catalogBytes = fs.readFileSync(catalogPath);
const catalog = JSON.parse(catalogBytes.toString('utf8'));
if (catalog.schema !== 'atlas.library-api-doc-catalog.v1' || !Array.isArray(catalog.sources)) throw new Error('INVALID_LIBRARY_API_DOC_CATALOG');
const asOfUTC = new Date().toISOString();
const result = {
  schema: 'atlas.library-api-doc-inventory.v1',
  canonicalAuthority: false,
  asOfUTC,
  repository: { root: path.relative(ROOT, repoDir).replaceAll('\\', '/') || '.', catalogPath: path.relative(ROOT, catalogPath).replaceAll('\\', '/'), catalogSha256: crypto.createHash('sha256').update(catalogBytes).digest('hex') },
  sourceCount: catalog.sources.length,
  officialUrlCount: catalog.sources.reduce((sum, source) => sum + (source.urls?.length ?? 0), 0),
  npm: inventoryNpm(repoDir, catalog),
  otherManifests: inventoryNonNpmManifests(repoDir),
  qualification: {
    lockResolution: 'package-lock.json parsed; pnpm/yarn lockfiles detected but not resolved by this version',
    installedState: 'physical package.json presence checked under each manifest root node_modules only',
    runtimeLoaded: 'NOT_PROBED',
    productionCallers: 'NOT_PROBED',
    licenseEolSecurity: 'NOT_PROBED',
    documentationFetch: 'NOT_PERFORMED',
    datastoreWrites: 0,
  },
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (writeReport) {
  const stamp = asOfUTC.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const reportDir = path.join(ROOT, 'docs/reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const stem = `library-api-doc-inventory-v1-${stamp}`;
  fs.writeFileSync(path.join(reportDir, `${stem}.json`), json, { flag: 'wx' });
  const missing = result.npm.packages.filter((pkg) => pkg.catalogSources.length === 0);
  const md = [
    '# Library API documentation inventory', '',
    `- Captured: ${asOfUTC}`, `- Repository scope: \`${result.repository.root}\``,
    `- Catalog sources / official URL candidates: ${result.sourceCount} / ${result.officialUrlCount}`,
    `- Package manifests: ${result.npm.manifestCount}`, `- Unique declared npm packages: ${result.npm.uniqueNpmPackages}`,
    `- Other-language manifests: ${result.otherManifests.length}`, '- Runtime-loaded / production-called status: not probed',
    '- This report is inventory evidence only; it does not establish install, use, support, or canonical identity.', '',
    '## Documentation mapping gaps', '',
    ...(missing.length ? missing.map((pkg) => `- \`${pkg.name}\` — no catalog source mapped`) : ['- None among declared npm packages.']), '',
    '## Additional language manifests', '',
    ...(result.otherManifests.length ? result.otherManifests.map((item) => `- \`${item.path}\` (${item.ecosystem}) — explicit environment/version probe required`) : ['- None found.']), '',
    `Full structured inventory: \`${stem}.json\``, '',
  ].join('\n');
  fs.writeFileSync(path.join(reportDir, `${stem}.md`), md, { flag: 'wx' });
  process.stdout.write(`${path.join(reportDir, `${stem}.json`)}\n${path.join(reportDir, `${stem}.md`)}\n`);
} else {
  process.stdout.write(json);
}
