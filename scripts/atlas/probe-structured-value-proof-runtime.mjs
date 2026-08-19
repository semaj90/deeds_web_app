#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const manifestPath = path.join(REPO_ROOT, 'packages/parent-atlas/fixtures/structured-value/runtime-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function packageVersion(name) {
  try {
    const resolved = require.resolve(`${name}/package.json`, { paths: [REPO_ROOT, path.join(REPO_ROOT, 'sveltekit-frontend')] });
    return JSON.parse(fs.readFileSync(resolved, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function pythonProbe() {
  const python = process.env.PYTHON_BIN ?? process.env.PYTHON ?? 'python';
  const code = String.raw`
import json, sys
out={"python":sys.version.split()[0],"treesitter_chunker":None,"pyarrow":None,"diagnostics":[]}
try:
 import importlib.metadata as md
 out["treesitter_chunker"]=md.version("treesitter-chunker")
except Exception as exc:
 out["diagnostics"].append(f"TREE_SITTER_CHUNKER_UNAVAILABLE:{type(exc).__name__}:{exc}")
try:
 import pyarrow
 out["pyarrow"]=pyarrow.__version__
except Exception as exc:
 out["diagnostics"].append(f"PYARROW_UNAVAILABLE:{type(exc).__name__}:{exc}")
print(json.dumps(out, sort_keys=True))
`;
  const result = spawnSync(python, ['-c', code], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    return { python: null, treesitter_chunker: null, pyarrow: null, diagnostics: [`PYTHON_PROBE_FAILED:${result.status}:${(result.stderr || result.stdout).trim()}`] };
  }
  try { return JSON.parse(result.stdout.trim()); }
  catch { return { python: null, treesitter_chunker: null, pyarrow: null, diagnostics: ['PYTHON_PROBE_INVALID_JSON'] }; }
}

const nodeVersions = {
  tree_sitter: packageVersion('tree-sitter'),
  tree_sitter_typescript: packageVersion('tree-sitter-typescript'),
};
const python = pythonProbe();
const diagnostics = [...(python.diagnostics ?? [])];

if (nodeVersions.tree_sitter !== manifest.node['tree-sitter']) {
  diagnostics.push(`TREE_SITTER_REVISION_MISMATCH:expected=${manifest.node['tree-sitter']}:observed=${nodeVersions.tree_sitter ?? 'missing'}`);
}
if (nodeVersions.tree_sitter_typescript !== manifest.node['tree-sitter-typescript']) {
  diagnostics.push(`TREE_SITTER_TYPESCRIPT_REVISION_MISMATCH:expected=${manifest.node['tree-sitter-typescript']}:observed=${nodeVersions.tree_sitter_typescript ?? 'missing'}`);
}
if (python.treesitter_chunker !== manifest.python['treesitter-chunker']) {
  diagnostics.push(`TREE_SITTER_CHUNKER_REVISION_MISMATCH:expected=${manifest.python['treesitter-chunker']}:observed=${python.treesitter_chunker ?? 'missing'}`);
}
if (!python.pyarrow) diagnostics.push('PYARROW_REQUIRED');

const receipt = {
  schema: 'atlas.structured-value-proof-runtime-probe.v1',
  manifest,
  observed: { node: nodeVersions, python },
  ready: diagnostics.length === 0,
  diagnostics,
  canonical_authority: false,
};
console.log(JSON.stringify(receipt, null, 2));
process.exitCode = receipt.ready ? 0 : 3;
