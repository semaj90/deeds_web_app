#!/usr/bin/env node
/**
 * Build the document-governance registry and human Master TOC.
 *
 * This is a deterministic projection only. It never edits, moves, archives,
 * or marks an original document superseded. Supersession must be explicit in
 * a future governance record or operator-reviewed receipt.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const repoRoot = process.cwd();
const registryPath = join(repoRoot, 'docs', 'reports', 'document-governance-registry-v1.json');
const tocPath = join(repoRoot, 'docs', 'MASTER-TOC.md');
const checkOnly = process.argv.includes('--check');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const repoPath = (value) => relative(repoRoot, value).split(sep).join('/');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', '.svelte-kit', 'dist', 'build'].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else out.push(absolute);
  }
  return out;
}

function taskProgress(text) {
  const completed = (text.match(/- \[[xX]\]/g) ?? []).length;
  const total = (text.match(/- \[[ xX]\]/g) ?? []).length;
  return { completedTasks: completed, totalTasks: total, progressFraction: total ? completed / total : null };
}

function kindFor(pathname) {
  if (/^CLAUDE\.md$/i.test(pathname) || /(^|\/)AGENTS\.md$/i.test(pathname)) return 'PROJECT_INSTRUCTIONS';
  if (pathname.startsWith('openspec/changes/')) return 'OPENSPEC';
  if (pathname.startsWith('docs/reports/')) return 'REPORT';
  if (pathname.startsWith('docs/')) return 'ARCHITECTURE_OR_DOCUMENTATION';
  return 'DOCUMENT';
}

function statusFor(pathname, kind, progress) {
  if (kind === 'OPENSPEC' && pathname.endsWith('/tasks.md')) {
    return progress.totalTasks > 0 && progress.completedTasks === progress.totalTasks
      ? 'ACTIVE_WORKING_COMPLETE'
      : 'ACTIVE_WORKING';
  }
  if (kind === 'PROJECT_INSTRUCTIONS') return 'CANONICAL_CURRENT';
  return 'UNCLASSIFIED';
}

const candidates = [
  ...walk(repoRoot).filter((p) => /(^|\/)CLAUDE\.md$/i.test(repoPath(p)) || /(^|\/)AGENTS\.md$/i.test(repoPath(p))),
  ...walk(join(repoRoot, 'docs')).filter((p) => /\.md$/i.test(p) || /\.json$/i.test(p)),
  ...walk(join(repoRoot, 'openspec', 'changes')).filter((p) => /\.(md|json|ya?ml)$/i.test(p)),
].filter((value, index, all) => all.indexOf(value) === index)
  // Generated projections must not become inputs to their own checksum.
  .filter((value) => {
    const path = repoPath(value);
    if (path === repoPath(registryPath) || path === repoPath(tocPath)) return false;
    // Governance outputs are projections and must not feed their own input
    // registry or make replay checksums depend on audit execution time.
    if (/^docs\/reports\/document-(governance|supersession)-/.test(path)) return false;
    return true;
  })
  .sort();

const records = candidates.map((absolute) => {
  const path = repoPath(absolute);
  const content = readFileSync(absolute);
  const text = content.toString('utf8');
  const kind = kindFor(path);
  const progress = path.endsWith('/tasks.md') ? taskProgress(text) : { completedTasks: null, totalTasks: null, progressFraction: null };
  return {
    schema: 'atlas.document.governance.record.v1',
    path,
    sha256: sha256(content),
    bytes: content.byteLength,
    kind,
    status: statusFor(path, kind, progress),
    explicitSupersedes: [],
    explicitSupersededBy: [],
    openspecChange: kind === 'OPENSPEC' ? path.split('/')[2] ?? null : null,
    ...progress,
    archiveEligible: false,
    archiveBlockedReasons: ['NO_EXPLICIT_SUPERSESSION_RECEIPT', 'NO_OPERATOR_ARCHIVE_AUTHORIZATION'],
  };
});

const registry = {
  schema: 'atlas.document.governance.registry.v1',
  generatedBy: 'scripts/atlas/build-master-toc.mjs',
  generatedAt: 'DETERMINISTIC',
  canonicalAuthority: 'DOCUMENT_STATUS_ONLY',
  supersessionPolicy: 'EXPLICIT_LINK_AND_RECEIPT_ONLY',
  records,
};
const registryJson = JSON.stringify(registry, null, 2) + '\n';

const openSpecs = records.filter((r) => r.kind === 'OPENSPEC' && r.path.endsWith('/tasks.md'));
const toc = [
  '# Parent Atlas Master TOC',
  '',
  '> Generated projection from `docs/reports/document-governance-registry-v1.json`.',
  '> This file is navigation, not canonical architecture or supersession authority.',
  '',
  `Registry checksum: \`${sha256(registryJson)}\``,
  '',
  '## Project instructions',
  '',
  ...records.filter((r) => r.kind === 'PROJECT_INSTRUCTIONS').map((r) => `- [${r.path}](${r.path}) — ${r.status} — \`${r.sha256.slice(0, 12)}\``),
  '',
  '## Active OpenSpec task progress',
  '',
  ...openSpecs.map((r) => `- [${r.openspecChange}](${r.path.replace(/\/tasks\.md$/, '')}) — ${r.completedTasks}/${r.totalTasks} tasks (${r.progressFraction == null ? 'n/a' : `${Math.round(r.progressFraction * 100)}%`})`),
  '',
  '## Ordered workboard',
  '',
  '- [OpenSpec workboard](OPENSPEC-WORKBOARD.md) — priority-ordered open tasks with evidence-based ETA fields.',
  '',
  '## Superseded and archive candidates',
  '',
  '- No documents are marked superseded or archive-ready by this projection.',
  '- Original files remain in place until an explicit supersession and archive receipt exists.',
  '',
  '## Runtime ETA',
  '',
  '- ETA unavailable: no current `WorkflowActionEventV1.progress.etaMs` receipt was consumed by this projection.',
  '',
].join('\n');

if (checkOnly) {
  const currentRegistry = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : null;
  const currentToc = existsSync(tocPath) ? readFileSync(tocPath, 'utf8') : null;
  if (currentRegistry !== registryJson || currentToc !== toc) {
    console.error('MASTER_TOC_CHECK_FAILED');
    process.exitCode = 1;
  } else {
    console.log(`MASTER_TOC_CHECK_OK ${sha256(registryJson)}`);
  }
} else {
  writeFileSync(registryPath, registryJson, 'utf8');
  writeFileSync(tocPath, toc, 'utf8');
  console.log(`MASTER_TOC_BUILT ${sha256(registryJson)}`);
  console.log(`records=${records.length} openspecTasks=${openSpecs.length} archiveEligible=0`);
}
