#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const ACTIVE_FILES = [
  'CLAUDE.md',
  'docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md',
  'docs/P1-PACKAGE-CONSOLIDATION-IN-PROGRESS.md',
  'docs/CONSOLIDATION-PHASE-OPTION-B-REPO-SCANNING.md',
  'packages/parent-atlas/docs/atlas/README.md',
];

const REGISTRY_FILE = 'docs/atlas/package-boundary-registry.json';
const PROMOTION_REGISTRY_FILE = 'packages/atlas-core/PROMOTION_REGISTRY.json';

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function scanForTokens(text, tokens) {
  return tokens.filter((token) => text.includes(token));
}

function lineContainsActiveStaleBoundary(line) {
  if (!/\bpackages\/atlas(?!-)\b/.test(line)) {
    return false;
  }
  const normalized = line.toLowerCase();
  if (normalized.includes('not the package boundary')) {
    return false;
  }
  if (normalized.includes('use packages/parent-atlas')) {
    return false;
  }
  return true;
}

function classifyBoundary(registry) {
  const activeTexts = ACTIVE_FILES.map((file) => ({
    file,
    text: readText(file),
  }));

  const activeFindings = [];
  const historicalFindings = [];

  for (const { file, text } of activeTexts) {
    for (const line of text.split(/\r?\n/)) {
      if (line.includes('packages/parent-atlas-sveltekit')) {
        activeFindings.push({ file, token: 'packages/parent-atlas-sveltekit' });
      }
      if (lineContainsActiveStaleBoundary(line)) {
        activeFindings.push({ file, token: 'packages/atlas' });
      }
    }
  }

  const repoSessionFiles = [
    'docs/SESSION-74-FINAL-METADATA-SEARCHABILITY-COMPLETION.md',
    'docs/SESSION-75-FINAL-CHECKPOINT.md',
    'docs/reports/SESSION-74-FINAL-METADATA-SEARCHABILITY-COMPLETION.md',
    'docs/reports/SESSION-75-FINAL-CHECKPOINT.md',
    'docs/reports/phase2-gemma4-acp-kanban-audit.md',
  ];

  for (const file of repoSessionFiles) {
    if (!exists(file)) continue;
    const text = readText(file);
    const hits = scanForTokens(text, ['packages/parent-atlas-sveltekit', 'packages/atlas']);
    for (const hit of hits) {
      historicalFindings.push({ file, token: hit });
    }
  }

  const packageFiles = [
    'packages/atlas-core/package.json',
    'packages/parent-atlas/package.json',
    'packages/parent-atlas-core/package.json',
    'packages/parent-atlas-retrieval/package.json',
    'packages/parent-atlas-ingest/package.json',
    'packages/parent-atlas-opencode/package.json',
  ];

  const packageNames = {};
  const missingPackages = [];
  for (const file of packageFiles) {
    if (!exists(file)) {
      missingPackages.push(file);
      continue;
    }
    packageNames[file] = JSON.parse(readText(file)).name;
  }

  const expectedNames = {
    'packages/atlas-core/package.json': '@deeds/atlas-core',
    'packages/parent-atlas/package.json': '@deeds/parent-atlas',
    'packages/parent-atlas-core/package.json': '@deeds/parent-atlas-core',
    'packages/parent-atlas-retrieval/package.json': '@deeds/parent-atlas-retrieval',
    'packages/parent-atlas-ingest/package.json': '@deeds/parent-atlas-ingest',
    'packages/parent-atlas-opencode/package.json': '@deeds/parent-atlas-opencode',
  };

  const nameMismatches = Object.entries(expectedNames)
    .filter(([file, expected]) => packageNames[file] && packageNames[file] !== expected)
    .map(([file, expected]) => ({
      file,
      expected,
      actual: packageNames[file],
    }));

  const registryIssues = [];
  if (!registry || registry.canonical !== 'packages/atlas-core') {
    registryIssues.push('canonical package must be packages/atlas-core');
  }
  if (registry?.operational !== 'packages/parent-atlas') {
    registryIssues.push('operational package must be packages/parent-atlas');
  }
  if (!Array.isArray(registry?.historical_reference_only) || !registry.historical_reference_only.includes('packages/parent-atlas-sveltekit')) {
    registryIssues.push('historical_reference_only must include packages/parent-atlas-sveltekit');
  }

  const activeBoundaryClean = activeFindings.length === 0 && nameMismatches.length === 0 && registryIssues.length === 0 && missingPackages.length === 0;
  const status = activeBoundaryClean ? 'CURRENT' : 'REFERENCE_CURRENT_WITH_GUARDRAILS';

  const activeScore = activeFindings.length === 0 ? 100 : Math.max(0, 100 - activeFindings.length * 20);
  const packageScore = nameMismatches.length === 0 && missingPackages.length === 0 ? 100 : Math.max(0, 100 - (nameMismatches.length + missingPackages.length) * 20);
  const registryScore = registryIssues.length === 0 ? 100 : Math.max(0, 100 - registryIssues.length * 20);
  const canonicalReadyPercent = Math.round((activeScore * 0.45) + (packageScore * 0.35) + (registryScore * 0.20));

  return {
    status,
    canonical_ready_percent: canonicalReadyPercent,
    active_boundary_score: activeScore,
    package_boundary_score: packageScore,
    registry_score: registryScore,
    active_findings: activeFindings,
    historical_findings: historicalFindings,
    missing_packages: missingPackages,
    name_mismatches: nameMismatches,
    registry_issues: registryIssues,
    package_names: packageNames,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Spec Supersedes Check');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Status: ${report.status}`);
  lines.push(`Canonical ready: ${report.canonical_ready_percent}%`);
  lines.push('');
  lines.push('## Boundary');
  lines.push(`- canonical: ${report.registry.canonical}`);
  lines.push(`- operational: ${report.registry.operational}`);
  lines.push(`- bridge: ${report.registry.compatibility_bridge}`);
  lines.push(`- historical_reference_only: ${report.registry.historical_reference_only.join(', ')}`);
  lines.push('');
  lines.push('## Scores');
  lines.push(`- active_boundary_score: ${report.active_boundary_score}`);
  lines.push(`- package_boundary_score: ${report.package_boundary_score}`);
  lines.push(`- registry_score: ${report.registry_score}`);
  lines.push('');
  lines.push('## Findings');
  if (report.active_findings.length === 0) {
    lines.push('- Active docs: no stale boundary references');
  } else {
    for (const finding of report.active_findings) {
      lines.push(`- Active docs: ${finding.file} contains ${finding.token}`);
    }
  }
  if (report.name_mismatches.length === 0) {
    lines.push('- Package names: all expected package names match');
  } else {
    for (const mismatch of report.name_mismatches) {
      lines.push(`- Package mismatch: ${mismatch.file} expected ${mismatch.expected} got ${mismatch.actual}`);
    }
  }
  if (report.registry_issues.length > 0) {
    for (const issue of report.registry_issues) {
      lines.push(`- Registry issue: ${issue}`);
    }
  }
  if (report.historical_findings.length > 0) {
    lines.push('');
    lines.push('## Historical Only');
    for (const finding of report.historical_findings) {
      lines.push(`- ${finding.file} contains ${finding.token}`);
    }
  }
  return lines.join('\n') + '\n';
}

function main() {
  const registry = exists(REGISTRY_FILE) ? JSON.parse(readText(REGISTRY_FILE)) : {};
  const result = classifyBoundary(registry);
  const report = {
    generated_at: new Date().toISOString(),
    registry: {
      canonical: registry.canonical,
      operational: registry.operational,
      compatibility_bridge: registry.compatibility_bridge,
      historical_reference_only: registry.historical_reference_only ?? [],
    },
    ...result,
  };

  const reportDir = path.join(ROOT, 'docs', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'spec-supersedes-check.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'spec-supersedes-check.md'), renderMarkdown(report));

  console.log(JSON.stringify({
    status: report.status,
    canonical_ready_percent: report.canonical_ready_percent,
    active_boundary_score: report.active_boundary_score,
    package_boundary_score: report.package_boundary_score,
    registry_score: report.registry_score,
    active_findings: report.active_findings.length,
    historical_findings: report.historical_findings.length,
  }, null, 2));

  process.exit(report.status === 'CURRENT' ? 0 : 1);
}

main();
