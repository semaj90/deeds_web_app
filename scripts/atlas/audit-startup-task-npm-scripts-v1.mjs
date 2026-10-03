#!/usr/bin/env node
/**
 * audit-startup-task-npm-scripts-v1.mjs — catches the exact failure mode found
 * live on 2026-09-27/28: a `.vscode/tasks.json` task (including several
 * `runOn: folderOpen` startup tasks) whose `npm run <script>` command doesn't
 * resolve to a real script in either `package.json`. Three real instances were
 * found by hand that day (`karpathy:gpu` — since fixed — plus `ace:hit-demand`
 * and `startup:ace:detached`, both still dangling); this script exists so a
 * 4th instance doesn't sit unnoticed indefinitely (npm's own "Missing script"
 * error only ever appeared in a log file nobody was watching).
 *
 * Read-only. Does not fix anything, does not remove tasks, does not create
 * missing scripts — inventory + PASS/FAIL only, per this repo's "audit before
 * code" governance rule.
 *
 * Comment-stripping is string-aware (tracks JSON string literals with escape
 * handling) specifically because a naive line-comment-stripping regex was
 * tried and failed live on this exact file — it mistook the URL value
 * "vscode colon slash slash schemas slash tasks" for a line comment and
 * corrupted the JSON. Both line comments and block comments are stripped
 * this way, matching what VS Code's own tasks.json format actually allows.
 *
 * Usage: node scripts/atlas/audit-startup-task-npm-scripts-v1.mjs
 * Exit code 0 on PASS (zero dangling references), 1 on FAIL.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TASKS_JSON_PATH = path.join(ROOT, '.vscode', 'tasks.json');
const PACKAGE_JSON_PATHS = [
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'sveltekit-frontend', 'package.json'),
];

/**
 * Strips `//` and block comments from JSONC text while leaving string
 * literal contents (including things that merely look like comments, e.g.
 * a `vscode://...` URL) untouched. Comment characters are replaced with
 * spaces rather than deleted, so line/column positions are preserved for
 * any future error reporting.
 */
function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += ch;
      } else {
        out += ' ';
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        out += '  ';
        i++;
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (ch === '\\') {
        // Copy the escaped character verbatim without re-entering string logic on it.
        if (next !== undefined) {
          out += next;
          i++;
        }
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      out += '  ';
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += '  ';
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function loadNpmScriptNames(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return new Set();
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function extractNpmRunReferences(commandText) {
  // Matches: npm run <script>   |   npm run --silent <script>   |   npm run --silent <script> -- <args>
  // Deliberately does NOT match "npm install"/"npx"/etc — only the literal "npm run" form used
  // throughout this repo's tasks.json.
  const pattern = /npm run(?:\s+--\S+)*\s+([A-Za-z0-9][A-Za-z0-9:_-]*)/g;
  const found = [];
  let match;
  while ((match = pattern.exec(commandText)) !== null) {
    found.push(match[1]);
  }
  return found;
}

/**
 * Resolves a task's declared `options.cwd` (a `${workspaceFolder}/...` template) to a real
 * directory relative to ROOT, or null if the task has no explicit cwd (VS Code then defaults to
 * the workspace root, which this audit already always checks).
 */
function resolveTaskCwd(task) {
  const raw = task?.options?.cwd;
  if (typeof raw !== 'string') return null;
  const relative = raw.replace('${workspaceFolder}', '').replace(/^[/\\]/, '');
  return relative || null;
}

function collectTaskCommands(tasksArray) {
  const entries = [];
  for (const task of tasksArray) {
    if (typeof task?.command !== 'string') continue;
    entries.push({
      label: task.label ?? '(unlabeled)',
      command: task.command,
      cwd: resolveTaskCwd(task),
      // folderOpen tasks fail SILENTLY (npm's "Missing script" error only ever lands in a log
      // file nobody is watching) — this is the exact severity distinction that let
      // ace:hit-demand and startup:ace:detached go unnoticed indefinitely. A manual-only task
      // fails LOUDLY the moment a person actually runs it, so it's lower priority to fix.
      runsAutomaticallyOnFolderOpen: task.runOptions?.runOn === 'folderOpen',
    });
  }
  return entries;
}

const rawText = readFileSync(TASKS_JSON_PATH, 'utf8');
const parsed = JSON.parse(stripJsonComments(rawText));
const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

const baselineScripts = new Set();
for (const p of PACKAGE_JSON_PATHS) {
  for (const name of loadNpmScriptNames(p)) baselineScripts.add(name);
}
// Cache per-cwd script sets so a package.json is only read once even if many tasks share a cwd.
const scriptsByCwd = new Map();
function scriptsForCwd(cwd) {
  if (!cwd) return baselineScripts;
  if (!scriptsByCwd.has(cwd)) {
    const pkgPath = path.join(ROOT, cwd, 'package.json');
    const merged = new Set(baselineScripts);
    for (const name of loadNpmScriptNames(pkgPath)) merged.add(name);
    scriptsByCwd.set(cwd, merged);
  }
  return scriptsByCwd.get(cwd);
}

const taskCommands = collectTaskCommands(tasks);
const findings = [];
for (const { label, command, cwd, runsAutomaticallyOnFolderOpen } of taskCommands) {
  const known = scriptsForCwd(cwd);
  for (const scriptName of extractNpmRunReferences(command)) {
    if (!known.has(scriptName)) {
      findings.push({ taskLabel: label, danglingScript: scriptName, cwd, runsAutomaticallyOnFolderOpen });
    }
  }
}

// De-duplicate (the same dangling script may be referenced by multiple tasks).
const seen = new Set();
const uniqueFindings = findings.filter((f) => {
  const key = `${f.taskLabel}::${f.danglingScript}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const silentFolderOpenFindings = uniqueFindings.filter((f) => f.runsAutomaticallyOnFolderOpen);
const manualOnlyFindings = uniqueFindings.filter((f) => !f.runsAutomaticallyOnFolderOpen);

const report = {
  schema: 'atlas.startup-task-npm-script-audit.v1',
  generatedAt: new Date().toISOString(),
  tasksJsonPath: path.relative(ROOT, TASKS_JSON_PATH),
  packageJsonPathsChecked: PACKAGE_JSON_PATHS.map((p) => path.relative(ROOT, p)),
  note: 'Checks the two baseline package.json files above, plus (if a task declares options.cwd) that directory\'s own package.json. Does NOT follow a mid-command directory change (Push-Location/cd inside the command string itself) — a dangling reference from a task whose command switches directories internally may still be a false positive. Treat every finding as a lead to verify by hand, not an automatically-confirmed bug.',
  totalTasksWithCommands: taskCommands.length,
  totalNpmRunReferencesChecked: taskCommands.reduce((sum, t) => sum + extractNpmRunReferences(t.command).length, 0),
  danglingCount: uniqueFindings.length,
  silentFolderOpenDanglingCount: silentFolderOpenFindings.length,
  manualOnlyDanglingCount: manualOnlyFindings.length,
  silentFolderOpenDangling: silentFolderOpenFindings,
  manualOnlyDangling: manualOnlyFindings,
  status: uniqueFindings.length === 0 ? 'PASS' : (silentFolderOpenFindings.length === 0 ? 'PASS_WITH_MANUAL_ONLY_FINDINGS' : 'FAIL'),
};

console.log(JSON.stringify(report, null, 2));
// Only silent, automatic (folderOpen) dangling references fail the gate — a manual-only stale
// task is a real finding worth fixing eventually, but it announces itself the moment someone
// runs it, so it does not need to block this specific audit's pass/fail signal.
process.exit(report.status === 'FAIL' ? 1 : 0);
