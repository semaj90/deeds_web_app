#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const okfRoot = path.resolve(root, process.argv[2] ?? '.okf');
const outputPath = path.resolve(root, process.argv[3] ?? 'docs/reports/okf-v02-bundle-audit-v1.json');
const requireFromFrontend = createRequire(path.resolve(root, 'sveltekit-frontend/package.json'));
const { parse: parseYaml } = requireFromFrontend('yaml');

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.tmp'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else files.push(absolute);
  }
  return files.sort();
}

function parseDocument(file, text) {
  if (path.extname(file).toLowerCase() === '.md') {
    if (!text.startsWith('---')) return { document: {}, parseReason: 'MARKDOWN_FRONTMATTER_MISSING' };
    const end = text.indexOf('\n---', 3);
    if (end <= 0) return { document: {}, parseReason: 'MARKDOWN_FRONTMATTER_UNTERMINATED' };
    try { return { document: parseYaml(text.slice(3, end)) ?? {}, parseReason: null }; }
    catch { return { document: {}, parseReason: 'MARKDOWN_FRONTMATTER_YAML_INVALID' }; }
  }
  if (!['.yaml', '.yml'].includes(path.extname(file).toLowerCase())) return { document: {}, parseReason: 'UNSUPPORTED_EXTENSION_FOR_V02_PROFILE' };
  try { return { document: parseYaml(text) ?? {}, parseReason: null }; }
  catch { return { document: {}, parseReason: 'YAML_DOCUMENT_INVALID' }; }
}

function validateFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const { document, parseReason } = parseDocument(file, text);
  const relativePath = path.relative(root, file).replaceAll('\\', '/');
  if (parseReason === 'UNSUPPORTED_EXTENSION_FOR_V02_PROFILE') {
    return { path: relativePath, status: 'EXCLUDED_FROM_V02_PROFILE', reasonCodes: [parseReason], missing: [], canonicalAuthority: false, writesPerformed: false };
  }
  const missing = [];
  for (const field of ['provenance', 'trust', 'lifecycle']) {
    if (document[field] === undefined || document[field] === null || document[field] === '') missing.push(field);
  }
  const reasonCodes = parseReason ? [parseReason] : missing.map((field) => `REQUIRED_FIELD_MISSING:${field}`);
  return {
    path: relativePath,
    type: document.type ?? null,
    schema: document.schema ?? null,
    version: document.version ?? null,
    id: document.id ?? document.gap_id ?? null,
    status: reasonCodes.length === 0 ? 'VALID_V02_PROFILE' : 'INVALID_V02_PROFILE',
    reasonCodes,
    missing,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

const files = walk(okfRoot);
const fileResults = files.map((file) => validateFile(file));
let manifest = null;
try { manifest = parseYaml(fs.readFileSync(path.join(okfRoot, 'manifest.yaml'), 'utf8')) ?? {}; } catch { manifest = {}; }
const declaredDomains = manifest?.registries?.domains?.schemas ?? [];
const domainDir = path.join(okfRoot, 'domains');
const actualDomains = fs.existsSync(domainDir)
  ? fs.readdirSync(domainDir).filter((name) => /\.ya?ml$/i.test(name)).sort()
  : [];
const declaredDomainNames = declaredDomains.map((entry) => typeof entry === 'string' ? path.basename(entry) : path.basename(entry?.path ?? entry?.file ?? '')).filter(Boolean).sort();
const missingDeclaredDomains = declaredDomainNames.filter((name) => !actualDomains.includes(name));
const undeclaredDomains = actualDomains.filter((name) => !declaredDomainNames.includes(name));

const valid = fileResults.filter((item) => item.status === 'VALID_V02_PROFILE').length;
const excluded = fileResults.filter((item) => item.status === 'EXCLUDED_FROM_V02_PROFILE').length;
const invalid = fileResults.filter((item) => item.status === 'INVALID_V02_PROFILE').length;
const reasonCounts = {};
for (const item of fileResults) for (const reason of item.reasonCodes ?? []) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
const report = {
  schema: 'atlas.okf-v02-bundle-audit.v1',
  status: valid === fileResults.length && missingDeclaredDomains.length === 0 && undeclaredDomains.length === 0 ? 'OKF_V02_PROFILE_PROVEN' : 'OKF_V02_REVIEW_REQUIRED',
  profile: {
    requiredFields: ['provenance', 'trust', 'lifecycle'],
    profileRevision: 'atlas-okf-v02-validation-profile-v1',
    autoRepair: false,
  },
  sourceRoot: path.relative(root, okfRoot).replaceAll('\\', '/'),
  filesConsidered: fileResults.length,
  filesScanned: fileResults.length - excluded,
  validFiles: valid,
  invalidFiles: invalid,
  excludedFiles: excluded,
  reasonCounts,
  files: fileResults,
  manifestDrift: { declaredDomains: declaredDomainNames, actualDomains, missingDeclaredDomains, undeclaredDomains },
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outputPath.replace(/\.json$/i, '.md'), [
  '# OKF v0.2 bundle audit', '',
  `Status: ${report.status}`,
  `Files scanned: ${report.filesScanned}`,
  `Valid profile files: ${report.validFiles}`,
  `Invalid profile files: ${report.invalidFiles}`,
  `Missing declared domain files: ${missingDeclaredDomains.length}`,
  `Undeclared domain files: ${undeclaredDomains.length}`,
  '', 'No metadata repair or canonical write was performed.', '',
].join('\n'));
console.log(JSON.stringify({ schema: report.schema, status: report.status, filesScanned: report.filesScanned, validFiles: report.validFiles, invalidFiles: report.invalidFiles, manifestDrift: report.manifestDrift, writesPerformed: false, output: path.relative(root, outputPath) }, null, 2));
