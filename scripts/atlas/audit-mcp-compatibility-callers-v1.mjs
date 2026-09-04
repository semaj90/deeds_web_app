/**
 * Read-only census of MCP compatibility callers.
 *
 * Reuses the existing revisioned registry manifest and identifies source
 * references that may depend on canonical names, legacy aliases, or private
 * dispatch paths before any registration change is considered.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const REGISTRY = path.join(ROOT, 'docs', 'reports', 'mcp-tool-registry-index.json');
const REPORT = path.join(ROOT, 'docs', 'reports', 'mcp-compatibility-callers-v1.json');

const ROOTS = [
  'scripts/atlas',
  'sveltekit-frontend/src',
  'packages/parent-atlas',
  '.opencode',
].map((relative) => path.join(ROOT, relative));
const EXTENSIONS = new Set(['.js', '.mjs', '.mts', '.ts', '.tsx', '.jsonc', '.yaml', '.yml']);
const SKIP = new Set(['node_modules', '.svelte-kit', 'dist', 'build', '__pycache__']);
const MARKERS = [
  'mcp-tool-registry-index',
  'atlas-tools',
  'record_outcome',
  'domain.classify',
  'tools/call',
  'tools/list',
  'legacy',
  'private',
];

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const relative = (file) => path.relative(ROOT, file).replaceAll(path.sep, '/');

function flattenTools(registry) {
  const tools = [];
  for (const values of Object.values(registry?.by_layer ?? {})) {
    if (Array.isArray(values)) tools.push(...values);
  }
  const seen = new Set();
  return tools.filter((tool) => {
    const name = typeof tool?.tool_name === 'string' ? tool.tool_name : '';
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function classifyLine(line, toolNames) {
  const lower = line.toLowerCase();
  const matchedTools = toolNames.filter((name) => lower.includes(name.toLowerCase()));
  const markers = MARKERS.filter((marker) => lower.includes(marker.toLowerCase()));
  if (!matchedTools.length && !markers.length) return null;
  const role = /register|server\.tool|tool\s*[:=]|definitions/.test(lower)
    ? 'registration'
    : /dispatch|calltool|tools\/call|handle/.test(lower)
      ? 'dispatch'
      : /test|spec|fixture/.test(lower)
        ? 'test'
        : /config|opencode|manifest/.test(lower)
          ? 'configuration'
          : 'caller_or_compatibility';
  const compatibility = /legacy|private|backward|compat|alias/.test(lower)
    ? 'compatibility_reference'
    : matchedTools.length
      ? 'canonical_reference'
      : 'generic_mcp_reference';
  return { role, compatibility, matchedTools, markers };
}

async function main() {
  const registry = JSON.parse(await fs.readFile(REGISTRY, 'utf8'));
  const registryRevision = registry.content_revision ?? null;
  const toolNames = flattenTools(registry).map((tool) => tool.tool_name);
  const listed = execFileSync('rg', [
    '-l', '--no-heading',
    'mcp-tool-registry-index|atlas-tools|record_outcome|domain\\.classify|tools/call|tools/list|legacy|private',
    ...ROOTS.map(relative),
    '--glob', '!**/*.json', '--glob', '!**/node_modules/**', '--glob', '!**/.svelte-kit/**',
  ], { cwd: ROOT, encoding: 'utf8' });
  const files = listed.split(/\r?\n/).filter(Boolean)
    .map((file) => path.join(ROOT, file))
    .filter((file) => EXTENSIONS.has(path.extname(file).toLowerCase()))
    .filter((file) => !file.split(path.sep).some((part) => SKIP.has(part)))
    .sort();
  const references = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = classifyLine(line, toolNames);
      if (match) references.push({ file: relative(file), line: index + 1, ...match });
    });
  }
  const byRole = Object.fromEntries([...new Set(references.map((item) => item.role))].sort().map((role) => [role, references.filter((item) => item.role === role).length]));
  const byCompatibility = Object.fromEntries([...new Set(references.map((item) => item.compatibility))].sort().map((kind) => [kind, references.filter((item) => item.compatibility === kind).length]));
  const body = {
    schema: 'atlas.mcp-compatibility-callers.v1',
    registryPath: relative(REGISTRY),
    registryRevision,
    scannedRoots: ROOTS.map(relative),
    scannedFileCount: files.length,
    referenceCount: references.length,
    byRole,
    byCompatibility,
    references,
    canonicalAuthority: false,
    writesPerformed: false,
    status: 'PROVEN_READ_ONLY_CENSUS',
  };
  const checksumInput = JSON.stringify(body);
  const report = { generatedAt: new Date().toISOString(), ...body, reportChecksum: sha256(checksumInput) };
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, registryRevision, scannedFileCount: files.length, referenceCount: references.length, report: relative(REPORT) }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
