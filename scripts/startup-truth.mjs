#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const outDir = path.resolve('.tmp');
try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}
const outPath = path.join(outDir, 'startup-truth.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function runCmd(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch (e) { return null; }
}

// Ensure the sub-checks have run (best-effort, non-failing)
try { runCmd('node scripts/ace-startup-health.mjs'); } catch(e) {}
try { runCmd('node scripts/mcp-health-check.mjs'); } catch(e) {}
try { runCmd('node scripts/vscode-workspace-health.mjs'); } catch(e) {}
try { runCmd('node scripts/ace-diff-sniffer.mjs --json'); } catch(e) {}

const reports = {
  ace: readJson(path.join(outDir, 'ace-startup-status.json')),
  mcp: readJson(path.join(outDir, 'mcp-health-status.json')),
  vscode: readJson(path.join(outDir, 'vscode-workspace-health.json')),
  diff: readJson(path.join(outDir, 'ace-diff-sniffer.json')),
  ts: new Date().toISOString(),
};

// derive blockers: ace not ok OR vscode missing critical files
const blockers = [];
const warnings = [];
if (!reports.ace || reports.ace.status !== 'ok') blockers.push({ source: 'ace', detail: reports.ace || 'missing' });
if (reports.vscode && !reports.vscode.node) blockers.push({ source: 'vscode', detail: 'node missing' });
if (reports.vscode && reports.vscode.duplicateScripts && reports.vscode.duplicateScripts.length) warnings.push({ source: 'vscode', detail: 'duplicate package scripts' });

const out = { reports, blockers, warnings };
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.error('Wrote', outPath);
if (blockers.length) {
  console.error('Startup-truth found blockers:', JSON.stringify(blockers, null, 2));
  process.exit(1);
} else {
  process.exit(0);
}
