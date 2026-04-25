import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function readPkgVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return pkg.devDependencies?.typescript || pkg.dependencies?.typescript || null;
  } catch (e) {
    return null;
  }
}

let declared = readPkgVersion();
let installed = null;
try {
  // try to require typescript from node_modules
  const ts = await import('typescript');
  installed = ts.version;
} catch (e) {
  // not installed locally
}

console.log('package.json declares typescript:', declared || 'none');
console.log('installed typescript version:', installed || 'none');
if (!installed) process.exitCode = 1;
