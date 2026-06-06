#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const OUT_JSON = path.resolve(REPO_ROOT, 'docs', 'reports', 'engram-adapter-decision-report.json');
const OUT_MD = path.resolve(REPO_ROOT, 'docs', 'reports', 'engram-adapter-decision-report.md');

const TARGETS = [
  path.resolve(REPO_ROOT, 'src', 'lib', 'server', 'memory', 'local-engram-memory-adapter.ts'),
  path.resolve(REPO_ROOT, 'src', 'lib', 'server', 'ai', 'engram-memory.ts'),
  path.resolve(REPO_ROOT, 'scripts', 'mcp', 'engram-embed-mcp.mjs'),
  path.resolve(REPO_ROOT, 'scripts', 'mcp', 'gemma4-offload-mcp.mjs'),
  path.resolve(REPO_ROOT, 'opencode.json'),
  path.resolve(REPO_ROOT, 'docs', 'architecture', 'claude-code-agent-os.md'),
  path.resolve(REPO_ROOT, 'docs', 'architecture', 'gemma4-to-claude-code-handoff.md'),
];

function findFirst(haystack, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(haystack)) return true;
  }
  return false;
}

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function analyze() {
  const rows = [];
  const evidence = [];

  const localEngram = await readText(TARGETS[0]);
  const engramMemory = await readText(TARGETS[1]);
  const gemmaMcp = await readText(TARGETS[3]);
  const openCode = await readText(TARGETS[4]);
  const claudeDoc = await readText(TARGETS[5]);
  const gemmaHandoff = await readText(TARGETS[6]);

  const hintOnlySignals = [
    /getRoutingHints\s*\(/,
    /recordTransition\s*\(/,
    /recordWorkflowMemory\s*\(/,
    /trust:\s*'low_hint'/,
    /source:\s*'local-engram'/,
    /getDidYouMeanFromEngram\s*\(/,
    /recordEngramTransition\s*\(/,
  ];

  const firstClassSignals = [
    /startup.*engram/i,
    /bootstrap.*engram/i,
    /adapter.*startup/i,
    /first[- ]class.*engram/i,
    /initialize.*engram.*adapter/i,
  ];

  const repoReportSignals = [
    /repo_report_answer/,
    /repo evidence first/i,
    /repo-audit-only/i,
  ];

  const legacyGemmaSignals = [
    /gemma4_chat/,
    /general chat/i,
    /model selection/i,
  ];

  const hintOnly = findFirst(localEngram, hintOnlySignals) && findFirst(engramMemory, hintOnlySignals);
  const firstClass = findFirst(localEngram + '\n' + engramMemory + '\n' + openCode + '\n' + claudeDoc, firstClassSignals);
  const repoReportAnswer = findFirst(openCode + '\n' + gemmaMcp + '\n' + gemmaHandoff, repoReportSignals);
  const legacyGemma = findFirst(openCode + '\n' + gemmaMcp + '\n' + gemmaHandoff, legacyGemmaSignals);
  const engramEmbedExists = await exists(path.resolve(REPO_ROOT, 'scripts', 'mcp', 'engram-embed-mcp.mjs'));

  let decision = 'NEEDS_REVIEW';
  if (hintOnly && repoReportAnswer && !firstClass) {
    decision = 'HINT_ONLY_ADAPTER';
  } else if (firstClass) {
    decision = 'FIRST_CLASS_ADAPTER';
  } else if (!hintOnly) {
    decision = 'NEEDS_REVIEW';
  }

  const summary = {
    decision,
    hintOnly,
    firstClass,
    repoReportAnswer,
    legacyGemma,
    engramEmbedExists,
    evidenceCount: 0,
  };

  const addEvidence = (label, file, detail) => {
    evidence.push({ label, file: path.relative(REPO_ROOT, file), detail });
  };

  addEvidence('local-engram adapter', TARGETS[0], 'getRoutingHints/recordTransition/recordWorkflowMemory and low_hint trust only');
  addEvidence('engram memory store', TARGETS[1], 'Redis-backed bigram transition memory with low-trust hints');
  addEvidence('OpenCode prompt gating', TARGETS[4], 'repo evidence first and repo_report_answer preferred');
  addEvidence('Gemma4 handoff docs', TARGETS[6], 'repo-audit-only and report snippets, not generic chat');
  if (legacyGemma) {
    addEvidence('legacy gemma boundary', TARGETS[3], 'legacy gemma route still present but should remain deprecated');
  }

  summary.evidenceCount = evidence.length;

  return { summary, evidence };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Engram Adapter Decision');
  lines.push('');
  lines.push(`- **decision**: ${report.summary.decision}`);
  lines.push(`- **hintOnly**: ${report.summary.hintOnly}`);
  lines.push(`- **firstClass**: ${report.summary.firstClass}`);
  lines.push(`- **repoReportAnswer**: ${report.summary.repoReportAnswer}`);
  lines.push(`- **legacyGemma**: ${report.summary.legacyGemma}`);
  lines.push(`- **engramEmbedExists**: ${report.summary.engramEmbedExists}`);
  lines.push(`- **evidenceCount**: ${report.summary.evidenceCount}`);
  lines.push('');
  lines.push('## Evidence');
  lines.push('');
  for (const item of report.evidence) {
    lines.push(`- ${item.label}: \`${item.file}\` — ${item.detail}`);
  }
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  if (report.summary.decision === 'HINT_ONLY_ADAPTER') {
    lines.push('Engram stays a hint-only adapter. It contributes low-trust routing hints and Redis-backed transition memory, while repo-audit and report-answer routing stays on `repo_report_answer`.');
  } else if (report.summary.decision === 'FIRST_CLASS_ADAPTER') {
    lines.push('Engram has evidence of a first-class adapter path and should be reviewed before treating it as hint-only.');
  } else {
    lines.push('This lane still needs review because the current code shape does not cleanly classify as hint-only or first-class.');
  }
  lines.push('');
  lines.push('## Finish Line');
  lines.push('');
  lines.push('- keep `repo_report_answer` as the repo-audit path');
  lines.push('- keep `gemma4_chat` deprecated');
  lines.push('- keep Engram opt-in and low-trust');
  return lines.join('\n');
}

async function main() {
  const report = await analyze();
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');
  console.log(JSON.stringify({ ok: true, ...report.summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
