#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const outDir = path.resolve('.tmp');
try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}
const outPath = path.join(outDir, 'vscode-workspace-health.json');

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

const packageJson = safeRead(path.join(root, 'package.json'));
const appPkg = safeRead(path.join(root, 'sveltekit-frontend', 'package.json'));

let pkgScriptsRoot = {};
let pkgScriptsApp = {};
try { if (packageJson) pkgScriptsRoot = JSON.parse(packageJson).scripts || {}; } catch(e){}
try { if (appPkg) pkgScriptsApp = JSON.parse(appPkg).scripts || {}; } catch(e){}

// Only treat a script as a duplicate if the root/app commands differ.
const duplicateScripts = Object.keys(pkgScriptsRoot)
  .filter((key) => key in pkgScriptsApp)
  .map((key) => ({
    name: key,
    root: pkgScriptsRoot[key],
    app: pkgScriptsApp[key],
  }))
  .filter((entry) => entry.root !== entry.app);

const tasksJson = safeRead(path.join(root, '.vscode', 'tasks.json')) !== null;

const envFiles = {
  dotEnv: fs.existsSync(path.join(root, '.env')),
  dotEnvExample: fs.existsSync(path.join(root, '.env.example')),
};

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch (e) { return null; }
}

const nodeVersion = sh('node --version');
const npmVersion = sh('npm --version');
const bunVersion = sh('bun --version');

const logsExist = fs.existsSync(path.join(root, 'logs')) || fs.existsSync(path.join(root, 'sveltekit-frontend', 'logs'));

const result = {
  ts: new Date().toISOString(),
  duplicateScripts,
  tasksJson,
  envFiles,
  node: !!nodeVersion,
  nodeVersion,
  npmVersion,
  bunVersion,
  logsExist,
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.error('Wrote', outPath);
process.exit(0);
