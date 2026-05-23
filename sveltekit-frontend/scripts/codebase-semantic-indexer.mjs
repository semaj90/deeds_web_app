#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const npmSmoke = process.env.npm_config_smoke === 'true' || process.env.npm_config_smoke === '';
const npmReport = process.env.npm_config_report === 'true' || process.env.npm_config_report === '';
const npmWrite = process.env.npm_config_write === 'true' || process.env.npm_config_write === '';
const smoke = args.includes('--smoke') || npmSmoke;
const report = args.includes('--report') || npmReport;
const write = args.includes('--write') || npmWrite;
const workspace = args.includes('--workspace');
const reportPathFlag = args.indexOf('--report-path');
const reportPath = reportPathFlag >= 0 ? args[reportPathFlag + 1] : 'docs/reports/codebase-semantic-index-latest.md';

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (rel === reportPath) continue;
    if (rel.startsWith('node_modules/') || rel.startsWith('.git/') || rel.startsWith('build/') || rel.startsWith('dist/') || rel.startsWith('.svelte-kit/')) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /(?:\.md|\.txt)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function collectChecklistFindings(files) {
  const findings = [];
  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!text.includes('[ ]')) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\s*[-*+]\s+\[ \]\s+(.*)$/);
      if (match) {
        findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), line: i + 1, text: match[1].trim() });
      }
    }
  }
  return findings;
}

function buildReport(files, findings) {
  const now = new Date().toISOString();
  return [
    '# Codebase Semantic Index Report',
    '',
    `- Generated: ${now}`,
    `- Workspace: ${root}`,
    `- Mode: ${smoke ? 'smoke' : 'report'}`,
    `- Checklist files scanned: ${files.length}`,
    `- Open checklist items: ${findings.length}`,
    '',
    '## Open Checklist Items',
    '',
    ...findings.slice(0, 200).map((item) => `- ${item.file}:${item.line} - ${item.text}`),
    '',
    '## Suggested Next Tasks',
    '',
    '- Regenerate the active daily TODO from the open checklist items.',
    '- Keep semantic indexing observation-first until the smoke/report lane is stable.',
    '- Preserve the OpenCode JSON packet contract: goal, context, files, constraints, mcp, plan.',
  ].join('\n');
}
function buildTaskList(findings) {
  const now = new Date().toISOString();
  return [
    '# Codebase Semantic Index Tasks',
    '',
    `- Generated: ${now}`,
    `- Open items: ${findings.length}`,
    '',
    '## Priority Tasks',
    '',
    ...findings.slice(0, 100).map((item) => `- [ ] ${item.file}:${item.line} - ${item.text}`),
  ].join('\n');
}

function main() {
  const files = walk(root);
  const findings = collectChecklistFindings(files);
  const reportText = buildReport(files, findings);
  const taskText = buildTaskList(findings);
  const reportFile = path.join(root, reportPath);
  const taskFile = path.join(root, 'next_steps/active/codebase-semantic-index-tasks.md');

  if (report || smoke) {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, reportText, 'utf8');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, taskText, 'utf8');
  }

  console.log(`Codebase semantic index ${smoke ? 'smoke' : 'report'}: ${files.length} checklist files, ${findings.length} open items.`);
  if (report || smoke) console.log(`Report written: ${reportFile}`);
  if (smoke || report) return;

  const passthrough = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace') continue;
    if (args[i] === '--report' || args[i] === '--smoke' || args[i] === '--write' || args[i] === '--report-path') {
      if (args[i] === '--report-path') i++;
      continue;
    }
    passthrough.push(args[i]);
  }
  if (workspace && !passthrough.includes('--dir')) passthrough.push('--dir', '.');
  const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(runner, ['tsx', 'scripts/codebase-semantic-indexer.ts', ...passthrough], { cwd: root, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

main();





