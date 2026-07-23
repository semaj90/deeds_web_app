#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(root, 'scripts', 'atlas', 'atlas-package-boundaries.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

for (const [name, definition] of Object.entries(manifest.packages)) {
  const packageRoot = path.join(root, definition.path);
  const packageJsonPath = path.join(packageRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    failures.push(`${name}: package.json is missing`);
    continue;
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  for (const exportName of definition.exports) {
    if (!(exportName in (packageJson.exports ?? {}))) failures.push(`${name}: missing declared export ${exportName}`);
  }
}

for (const [name, owner] of Object.entries(manifest.owners)) {
  if (!fs.existsSync(path.join(root, owner))) failures.push(`${name}: owner path is missing (${owner})`);
}

for (const mirror of manifest.forbidden_mirrors) {
  if (fs.existsSync(path.join(root, mirror))) failures.push(`forbidden mirror exists: ${mirror}`);
}

for (const [script, specifier] of Object.entries(manifest.required_imports ?? {})) {
  const scriptPath = path.join(root, script);
  if (!fs.existsSync(scriptPath)) {
    failures.push(`required import script is missing: ${script}`);
  } else if (!fs.readFileSync(scriptPath, 'utf8').includes(specifier)) {
    failures.push(`${script}: missing required package import ${specifier}`);
  }
}

for (const specifier of manifest.runtime_imports ?? []) {
  try {
    await import(specifier);
  } catch (error) {
    failures.push(`runtime import failed: ${specifier} (${error instanceof Error ? error.message : String(error)})`);
  }
}

const report = {
  contract_version: 'atlas-package-boundaries.v1',
  status: failures.length === 0 ? 'PACKAGE_BOUNDARIES_PROVEN' : 'PACKAGE_BOUNDARIES_BLOCKED',
  failures,
  owners: manifest.owners,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
