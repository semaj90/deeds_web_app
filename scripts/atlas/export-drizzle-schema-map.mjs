#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, collectFiles, writeJson, writeMarkdown, toPosixPath } from './_atlas-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(REPO_ROOT, 'sveltekit-frontend');
const SCHEMA_DIR = path.join(FRONTEND, 'src', 'lib', 'server', 'db', 'schema');
const OUT_DIR = path.join(REPO_ROOT, 'memory', 'exports', 'atlas');
const OUT_JSONL = path.join(OUT_DIR, 'drizzle-schema-map.jsonl');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'atlas-drizzle-schema-map-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'atlas-drizzle-schema-map-report.md');

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseSchemaFile(filePath) {
  const text = readText(filePath);
  const tableMatch = text.match(/pgTable\(\s*['"]([^'"]+)['"]/);
  if (!tableMatch) return null;

  const table = tableMatch[1];
  const columns = [];
  const columnRe = /^\s*([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_]+)\(\s*['"]([^'"]+)['"]/gm;
  for (const match of text.matchAll(columnRe)) {
    const property = match[1];
    const constructor = match[2];
    const dbName = match[3];
    columns.push({
      property,
      dbName,
      type: constructor,
    });
  }

  const indexNames = [...text.matchAll(/index\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const tableLine = text.slice(0, tableMatch.index ?? 0).split(/\r?\n/).length;
  return {
    table,
    file: toPosixPath(path.relative(REPO_ROOT, filePath)),
    tableLine,
    columnCount: columns.length,
    columns,
    indexes: indexNames.map((name) => ({ name })),
  };
}

function main() {
  const schemaFiles = collectFiles(SCHEMA_DIR, new Set(['node_modules', '.git', '.svelte-kit', '.vite', 'dist', 'build']), (filePath) => filePath.endsWith('.ts') && !filePath.endsWith('.d.ts'));
  const rows = [];
  for (const filePath of schemaFiles) {
    const row = parseSchemaFile(filePath);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => a.table.localeCompare(b.table));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSONL, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    schemaDir: toPosixPath(path.relative(REPO_ROOT, SCHEMA_DIR)),
    tableCount: rows.length,
    columnCount: rows.reduce((sum, row) => sum + row.columnCount, 0),
    indexCount: rows.reduce((sum, row) => sum + row.indexes.length, 0),
    tables: rows.slice(0, 20).map((row) => ({
      table: row.table,
      file: row.file,
      columns: row.columnCount,
      indexes: row.indexes.length,
    })),
  };

  writeJson(REPORT_JSON, report);
  const md = [
    '# Atlas Drizzle Schema Map Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Tables: ${report.tableCount}`,
    `- Columns: ${report.columnCount}`,
    `- Indexes: ${report.indexCount}`,
    '',
    '## Top Tables',
    '',
    ...report.tables.map((row) => `- ${row.table} (${row.columns} columns, ${row.indexes} indexes) -> ${row.file}`),
  ].join('\n');
  writeMarkdown(REPORT_MD, md);

  console.log(`Wrote ${OUT_JSONL}`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main();
