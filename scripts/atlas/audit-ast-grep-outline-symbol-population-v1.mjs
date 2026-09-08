#!/usr/bin/env node

/**
 * Read-only capability and bounded symbol-population audit.
 *
 * ast-grep outline is a navigation aid, not a canonical symbol registry. Exact
 * spans and source revisions remain owned by Tree-sitter/8095; compiler
 * semantics remain owned by LSP/ts-morph.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = join(repoRoot, 'docs/reports/ast-grep-symbol-population-v1.json');
const executable = process.platform === 'win32' ? 'ast-grep.cmd' : 'ast-grep';
const requestedPaths = [
  'sveltekit-frontend/src/lib/server/retrieval',
  'packages/parent-atlas/src',
  'services/go-retrieval-service',
  'python/miniforge_nlp_sidecar_v2.py',
].filter((path) => existsSync(join(repoRoot, path)));
const useNpx = process.argv.includes('--use-npx');
const npxArgs = useNpx ? ['--yes', '--package=@ast-grep/cli@0.45.3', 'ast-grep'] : [executable];

function run(args) {
  try {
    if (process.platform === 'win32') {
      // All arguments are fixed by this audit (the paths contain no spaces).
      // Use cmd.exe because npm exposes the Windows .cmd shim, not a native binary.
      const command = [useNpx ? 'npx' : executable, ...(useNpx ? npxArgs : []), ...args].join(' ');
      return { ok: true, stdout: execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) };
    }
    return { ok: true, stdout: execFileSync(useNpx ? 'npx' : executable, useNpx ? [...npxArgs, ...args] : args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, code: error.status ?? null, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? error.message ?? error) };
  }
}

const version = run(['--version']);
const outline = version.ok
  ? run(['outline', ...requestedPaths, '--items', 'structure', '--view', 'digest', '--json=compact'])
  : { ok: false, code: null, stdout: '', stderr: 'ast-grep executable unavailable' };

const report = {
  schema: 'atlas.ast-grep-outline-symbol-population.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  provider: {
    executable,
    executionMode: useNpx ? 'NPX_PINNED_0.45.3' : 'PATH_RESOLUTION',
    version: version.ok ? version.stdout.trim() : null,
    outlineSupported: outline.ok,
    upstreamContract: 'ast-grep outline --items structure --view digest',
  },
  requestedPaths,
  structuralOwnership: {
    outline: 'bounded structural discovery/index candidate',
    treeSitter8095: 'exact CST/AST spans and source-bound evidence',
    lspTsMorph: 'compiler-semantic symbols, types, and references',
    canonicalPromotion: 'revision-qualified resolver plus independent readback',
  },
  population: outline.ok ? (() => {
    let files = [];
    try { files = JSON.parse(outline.stdout); } catch { files = []; }
    const items = files.flatMap((file) => file.items ?? []);
    const members = items.flatMap((item) => item.members ?? []);
    const byType = (rows) => Object.fromEntries([...new Set(rows.map((row) => row.symbolType))].sort().map((type) => [type, rows.filter((row) => row.symbolType === type).length]));
    const byLanguage = Object.fromEntries([...new Set(files.map((file) => file.language))].sort().map((language) => [language, files.filter((file) => file.language === language).length]));
    return {
      rawOutputChecksum: createHash('sha256').update(outline.stdout, 'utf8').digest('hex'),
      rawOutputBytes: Buffer.byteLength(outline.stdout, 'utf8'),
      fileCount: files.length,
      fileLanguages: byLanguage,
      itemCount: items.length,
      memberCount: members.length,
      exportedItemCount: items.filter((item) => item.isExported).length,
      itemTypes: byType(items),
      memberTypes: byType(members),
      sample: items.slice(0, 40).map(({ name, symbolType, signature, astKind, range, isExported }) => ({ name, symbolType, signature, astKind, range, isExported })),
      note: 'Outline output is a bounded structural observation; it is not a canonical symbol index.',
    };
  })() : null,
  diagnostics: outline.ok ? [] : [
    'AST_GREP_OUTLINE_UNAVAILABLE',
    'Installed ast-grep CLI does not expose outline; refresh the pinned CLI before using this gate.',
    outline.stderr.trim().slice(0, 500),
  ].filter(Boolean),
  nextGate: outline.ok ? 'AST_GREP_OUTLINE_TREE_SITTER_PARITY' : 'AST_GREP_CLI_OUTLINE_CAPABILITY',
  status: outline.ok ? 'OUTLINE_STRUCTURAL_DISCOVERY_PROVEN' : 'OUTLINE_CAPABILITY_UNAVAILABLE',
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  version: report.provider.version,
  outlineSupported: report.provider.outlineSupported,
  requestedPaths: report.requestedPaths,
  reportPath: relative(repoRoot, reportPath),
  writesPerformed: false,
}, null, 2));
