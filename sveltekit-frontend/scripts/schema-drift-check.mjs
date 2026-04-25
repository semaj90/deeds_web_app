#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(HERE, '..');
const WORKSPACE_ROOT = resolve(FRONTEND_ROOT, '..');
const DEFAULT_MANIFEST_PATH = resolve(WORKSPACE_ROOT, 'next_steps/active/SCHEMA_MANIFEST.json');
const DEFAULT_DOC_PATH = resolve(FRONTEND_ROOT, 'data/knowledge/drizzle-schema-reference.md');

function parseArgs(argv) {
  const args = { positional: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--warn-only') {
      args.warnOnly = true;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--manifest') {
      args.manifest = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--doc') {
      args.doc = argv[index + 1];
      index += 1;
      continue;
    }
    args.positional.push(token);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCount(docText, label) {
  const matcher = new RegExp(`\\|\\s*${escapeRegex(label)}\\s*\\|\\s*(\\d+)\\s*\\|`, 'i');
  const match = docText.match(matcher);
  return match ? Number(match[1]) : null;
}

function hasMarkdownCell(docText, value) {
  return new RegExp(`\\|\\s*${escapeRegex(value)}\\s*\\|`).test(docText);
}

function summarizeList(values, max = 10) {
  if (values.length <= max) {
    return values;
  }
  return [...values.slice(0, max), `... (${values.length - max} more)`];
}

function buildReport(manifest, docText, ownershipText, paths) {
  const countExpectations = [
    ['table declarations', manifest.summary.tableCount],
    ['enum declarations', manifest.summary.enumCount],
    ['unique table names', manifest.summary.uniqueTableCount],
    ['unique enum names', manifest.summary.uniqueEnumCount],
    ['active unique table names', manifest.summary.activeUniqueTableCount],
    ['active unique enum names', manifest.summary.activeUniqueEnumCount],
    ['root schema files', manifest.summary.rootSchemaFileCount],
  ];

  const countMismatches = countExpectations
    .map(([label, expected]) => ({ label, expected, actual: extractCount(docText, label) }))
    .filter((check) => check.actual === null || check.actual !== check.expected);

  const undocumentedTables = manifest.definitions.tables
    .filter((definition) => !hasMarkdownCell(docText, definition.name))
    .map((definition) => definition.name);
  const undocumentedEnums = manifest.definitions.enums
    .filter((definition) => !hasMarkdownCell(docText, definition.name))
    .map((definition) => definition.name);

  const missingRootFileEntries = manifest.rootSchemaFiles
    .filter((fileInfo) => !ownershipText || !ownershipText.includes(fileInfo.file))
    .map((fileInfo) => fileInfo.file);

  const duplicateFilesWithoutClassification = manifest.rootSchemaFiles
    .filter((fileInfo) => fileInfo.status === 'legacy duplicate')
    .filter((fileInfo) => !fileInfo.owner || fileInfo.owner === 'unknown owner' || !fileInfo.status)
    .map((fileInfo) => fileInfo.file);

  const staleStatusBanners = [];
  if (!/Generated from .*SCHEMA_MANIFEST\.json/i.test(docText)) {
    staleStatusBanners.push('missing generated-from-manifest banner');
  }
  if (/no doc edits applied yet|remediation plan|audit complete \+ remediation|manual remediation/i.test(docText)) {
    staleStatusBanners.push('doc still contains pre-generation remediation language');
  }

  const findings = {
    countMismatches,
    undocumentedTables,
    undocumentedEnums,
    missingRootFileEntries,
    duplicateFilesWithoutClassification,
    staleStatusBanners,
    missingOwnershipDoc: !ownershipText,
  };

  const hasFindings =
    findings.countMismatches.length > 0 ||
    findings.undocumentedTables.length > 0 ||
    findings.undocumentedEnums.length > 0 ||
    findings.missingRootFileEntries.length > 0 ||
    findings.duplicateFilesWithoutClassification.length > 0 ||
    findings.staleStatusBanners.length > 0 ||
    findings.missingOwnershipDoc;

  return {
    ok: !hasFindings,
    manifestPath: paths.manifestPath,
    docPath: paths.docPath,
    ownershipPath: paths.ownershipPath,
    summary: manifest.summary,
    findings,
  };
}

function printTextReport(report, warnOnly) {
  console.log(`Schema drift check`);
  console.log(`  Manifest:  ${report.manifestPath}`);
  console.log(`  Doc:       ${report.docPath}`);
  console.log(`  Ownership: ${report.ownershipPath}`);
  console.log('');

  if (report.ok) {
    console.log('OK: manifest, summary doc, and ownership rows are aligned.');
    return;
  }

  const emit = warnOnly ? (line) => console.log(`::warning ::${line}`) : (line) => console.log(line);

  if (report.findings.countMismatches.length > 0) {
    emit(`Count mismatches: ${report.findings.countMismatches.map((item) => `${item.label} expected ${item.expected}, got ${item.actual ?? 'missing'}`).join('; ')}`);
  }
  if (report.findings.undocumentedTables.length > 0) {
    emit(`Undocumented tables: ${summarizeList(report.findings.undocumentedTables).join(', ')}`);
  }
  if (report.findings.undocumentedEnums.length > 0) {
    emit(`Undocumented enums: ${summarizeList(report.findings.undocumentedEnums).join(', ')}`);
  }
  if (report.findings.missingRootFileEntries.length > 0) {
    emit(`Missing root ownership rows: ${summarizeList(report.findings.missingRootFileEntries).join(', ')}`);
  }
  if (report.findings.duplicateFilesWithoutClassification.length > 0) {
    emit(`Duplicate files without owner/classification: ${summarizeList(report.findings.duplicateFilesWithoutClassification).join(', ')}`);
  }
  if (report.findings.staleStatusBanners.length > 0) {
    emit(`Stale banner issues: ${report.findings.staleStatusBanners.join(', ')}`);
  }
  if (report.findings.missingOwnershipDoc) {
    emit('Ownership doc is missing.');
  }
}

const args = parseArgs(process.argv.slice(2));
const manifestPath = resolve(args.manifest ?? args.positional[0] ?? DEFAULT_MANIFEST_PATH);
const docPath = resolve(args.doc ?? args.positional[1] ?? DEFAULT_DOC_PATH);
const ownershipPath = resolve(dirname(manifestPath), 'SCHEMA_FILE_OWNERSHIP.md');

if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(2);
}

if (!existsSync(docPath)) {
  console.error(`Reference doc not found: ${docPath}`);
  process.exit(2);
}

const manifest = readJson(manifestPath);
const docText = readText(docPath);
const ownershipText = existsSync(ownershipPath) ? readText(ownershipPath) : '';
const report = buildReport(manifest, docText, ownershipText, { manifestPath, docPath, ownershipPath });

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report, Boolean(args.warnOnly));
}

if (!report.ok && !args.warnOnly) {
  process.exit(1);
}