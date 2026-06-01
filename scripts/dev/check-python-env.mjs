import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = path.join(repoRoot, '.tmp');
const outJson = path.join(tmpDir, 'python-env-check.json');
const outMd = path.join(tmpDir, 'python-env-check.md');
const pythonVersionFile = path.join(repoRoot, '.python-version');
const venvPython = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');
const vscodeSettingsPath = path.join(repoRoot, '.vscode', 'settings.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function detectProcessPython() {
  const paths = [];
  for (const cmd of [
    ['python', ['--version']],
    ['py', ['-3', '--version']],
  ]) {
    try {
      const out = execFileSync(cmd[0], cmd[1], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      paths.push({ command: cmd[0], version: out });
    } catch (err) {
      const stderr = err?.stderr?.toString?.().trim?.() || '';
      if (stderr) paths.push({ command: cmd[0], version: stderr });
    }
  }
  return paths;
}

function detectPythonExe(cmd) {
  try {
    return execFileSync(cmd, ['-c', 'import sys; print(sys.executable); print(sys.version.split()[0])'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function readVscodeSettings() {
  try {
    return JSON.parse(fs.readFileSync(vscodeSettingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function main() {
  ensureDir(tmpDir);

  const pythonVersion = readText(pythonVersionFile);
  const processPython = detectProcessPython();
  const venvProbe = exists(venvPython) ? detectPythonExe(venvPython) : [];
  const vscode = readVscodeSettings();
  const vscodePython = String(vscode?.['python.defaultInterpreterPath'] || '');
  const resolvedVscodePython = vscodePython.replace('${workspaceFolder}', repoRoot).replace(/\//g, path.sep);
  const resolvedVscodeExists = exists(resolvedVscodePython);
  const venvVersion = venvProbe[1] || '';
  const shouldUseVenv = exists(venvPython) && venvVersion.startsWith('3.11');

  const payload = {
    repoRoot,
    pythonVersionFile: pythonVersion || '(missing)',
    processPython,
    venvPython: exists(venvPython) ? venvPython : '',
    venvProbe,
    venvVersion,
    vscodePython,
    resolvedVscodePython,
    resolvedVscodeExists,
    shouldUseVenv,
    note: shouldUseVenv ? 'Workspace should use .venv' : 'Workspace venv missing or not Python 3.11.x',
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));

  const md = [
    '# Python Environment Check',
    '',
    `- .python-version: ${payload.pythonVersionFile}`,
    `- process PATH python: ${processPython.map((item) => `${item.command} -> ${item.version}`).join('; ') || '(missing)'}`,
    `- .venv python: ${payload.venvProbe.join(' | ') || '(missing)'}`,
    `- VS Code python.defaultInterpreterPath: ${vscodePython || '(unset)'}`,
    `- resolved VS Code path exists: ${String(resolvedVscodeExists)}`,
    `- python version: ${venvVersion || '(missing)'}`,
    `- workspace should use .venv: ${String(shouldUseVenv)}`,
    '',
    `Output JSON: ${outJson}`,
  ].join('\n');
  fs.writeFileSync(outMd, md);

  console.log(JSON.stringify({
    ok: true,
    outJson,
    outMd,
    shouldUseVenv,
    venvVersion,
    resolvedVscodeExists,
  }, null, 2));
}

main();
