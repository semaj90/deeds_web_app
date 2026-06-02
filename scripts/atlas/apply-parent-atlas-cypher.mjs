#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import neo4j from 'neo4j-driver';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GRAPH_DIR = path.join(ROOT, 'docs', 'graph');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'parent-atlas-cypher-apply-report.json');
const REPORT_MD_PATH = path.join(ROOT, 'docs', 'reports', 'parent-atlas-cypher-apply-report.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const filesArg = argv.find((arg) => arg.startsWith('--files='));
const fileList = filesArg
  ? filesArg.split('=')[1].split(',').map((item) => item.trim()).filter(Boolean)
  : [
      path.join(GRAPH_DIR, 'parent-atlas-feature-command-atlas.cypher'),
      path.join(GRAPH_DIR, 'parent-atlas-rg-dump-packets.cypher'),
    ];

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';

function readStatements(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const body = raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  return body
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter(Boolean);
}

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    neo4jUri: NEO4J_URI,
    files: [],
    statements: 0,
    applied: 0,
    errors: 0,
  };

  try {
    for (const filePath of fileList) {
      if (!fs.existsSync(filePath)) {
        report.files.push({ filePath, statements: 0, applied: 0, skipped: true, missing: true });
        continue;
      }

      const statements = readStatements(filePath);
      let applied = 0;
      if (!DRY_RUN) {
        for (const statement of statements) {
          await session.executeWrite((tx) => tx.run(statement));
          applied += 1;
        }
      }

      report.files.push({
        filePath,
        statements: statements.length,
        applied,
        skipped: DRY_RUN,
        missing: false,
      });
      report.statements += statements.length;
      report.applied += applied;
    }
  } catch (error) {
    report.errors += 1;
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD_PATH,
    [
      '# Parent Atlas Cypher Apply Report',
      '',
      `Generated: ${report.generatedAt}`,
      `Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`,
      `Statements: ${report.statements}`,
      `Applied: ${report.applied}`,
      '',
      '## Files',
      ...report.files.map((file) => `- ${path.relative(ROOT, file.filePath)} :: statements=${file.statements} :: applied=${file.applied} :: ${file.missing ? 'missing' : 'present'}`),
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[parent-atlas-cypher-apply] failed:', error?.message ?? error);
  process.exit(1);
});
