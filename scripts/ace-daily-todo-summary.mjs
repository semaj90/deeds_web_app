#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = path.resolve(process.cwd());
const tmpDir = path.join(repoRoot, '.tmp');
const reportsDir = path.join(repoRoot, 'reports');

try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
try { fs.mkdirSync(reportsDir, { recursive: true }); } catch {}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  } catch { return ''; }
}

function readJson(filePath) {
  try { if (!fs.existsSync(filePath)) return null; return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function latestReportFile() {
  const candidateDirs = [path.join(repoRoot,'docs','reports'), path.join(repoRoot,'reports')];
  const cands = [];
  for (const d of candidateDirs) {
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const name = e.name.toLowerCase();
      if (!name.endsWith('.json') && !name.endsWith('.log') && !name.endsWith('.md')) continue;
      if (!(name.includes('report')||name.includes('summary')||name.includes('analyzer')||name.includes('health')||name.includes('diff'))) continue;
      const full = path.join(d, e.name);
      const st = fs.statSync(full);
      cands.push({ full, m: st.mtimeMs });
    }
  }
  cands.sort((a,b)=>b.m-a.m);
  return cands[0]?.full ?? null;
}

const gitLog = run('git log --since="24 hours ago" --oneline');
let diff = run('git diff --name-only HEAD~1..HEAD');
if (!diff) diff = run('git diff --name-only');
const worktree = run('git status --short');

const aceDiff = readJson(path.join(tmpDir,'ace-diff-sniffer.json'));
const startupTruth = readJson(path.join(tmpDir,'startup-truth.json'));
const latestReportPath = latestReportFile();
const latestReportText = latestReportPath && fs.existsSync(latestReportPath) ? fs.readFileSync(latestReportPath,'utf8') : '';

const changedFiles = diff ? diff.split(/\r?\n/).filter(Boolean) : [];
const worktreeFiles = worktree ? worktree.split(/\r?\n/).map(l=>l.replace(/^[ MADRCU?!]{0,2}\s*/,'')).filter(Boolean) : [];
const logLines = gitLog ? gitLog.split(/\r?\n/).filter(Boolean) : [];

const warnings = [];
if (Array.isArray(startupTruth?.blockers) && startupTruth.blockers.length) {
  warnings.push(...startupTruth.blockers.slice(0,10).map(b => typeof b === 'string' ? b : JSON.stringify(b)));
}
if (aceDiff?.summary?.dirty) warnings.push('working tree dirty');

const combined = Array.from(new Set([...changedFiles, ...worktreeFiles]));

const summary = {
  generatedAt: new Date().toISOString(),
  repoRoot,
  commits: logLines.length,
  changedFiles: combined,
  inputs: { aceDiff: !!aceDiff, startupTruth: !!startupTruth, latestReportPath },
  warnings,
  nextAction: warnings.length ? 'Resolve blockers; rerun health checks.' : (combined.length? 'Review changed files and run focused tests.' : 'No changes — run health checks for baseline.'),
};

const outJson = path.join(tmpDir,'ace-daily-todo-summary.json');
const outMd = path.join(reportsDir,'ace-daily-todo-summary.md');
fs.writeFileSync(outJson, JSON.stringify(summary,null,2));

const md = [];
md.push('# ACE Daily TODO Summary');
md.push(`Generated: ${summary.generatedAt}`);
md.push('');
md.push('## Commits (24h)');
if (logLines.length) md.push(...logLines.slice(0,50).map(l=>`- ${l}`)); else md.push('- No commits in last 24h.');
md.push('');
md.push('## Changed files');
if (combined.length) md.push(...combined.slice(0,200).map(f=>`- ${f}`)); else md.push('- No file changes detected.');
md.push('');
md.push('## Warnings/Blockers');
if (warnings.length) md.push(...warnings.map(w=>`- ${w}`)); else md.push('- No blockers.');
md.push('');
if (latestReportPath) {
  md.push('## Latest Analyzer');
  md.push(`- ${path.relative(repoRoot, latestReportPath)}`);
  if (latestReportText) {
    md.push('');
    md.push('```text');
    md.push(...latestReportText.split(/\r?\n/).slice(0,18));
    md.push('```');
  }
}

md.push('');
md.push('## Next Action');
md.push(`- ${summary.nextAction}`);

fs.writeFileSync(outMd, md.join('\n'));

console.log(JSON.stringify({ ok:true, outJson, outMd, warnings: warnings.length, changed: combined.length, commits: logLines.length }, null, 2));
