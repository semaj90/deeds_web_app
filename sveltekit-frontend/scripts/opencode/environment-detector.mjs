import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { ROOT } from './task-registry-helpers.mjs';
import { loadAtlasEnv } from '../atlas/load-atlas-env.mjs';

const APP_ROOT = ROOT;
const REPO_ROOT = path.resolve(ROOT, '..');

function rel(filePath) {
  return path.relative(APP_ROOT, filePath);
}

function exists(filePath) {
  return existsSync(filePath);
}

function envFlag(name) {
  const value = process.env[name];
  return value === undefined ? null : value;
}

function firstExisting(paths) {
  return paths.find((candidate) => exists(candidate)) ?? null;
}

function detectShell() {
  const shell = process.env.SHELL ?? process.env.ComSpec ?? process.env.PSModulePath ?? '';
  const terminal = process.env.TERM_PROGRAM ?? process.env.WT_SESSION ?? process.env.TERM ?? '';
  if (process.env.WT_SESSION) return 'windows-terminal';
  if (/powershell|pwsh/i.test(shell)) return 'powershell';
  if (/cmd\.exe/i.test(shell)) return 'cmd';
  if (/vscode/i.test(terminal)) return 'vscode-terminal';
  if (/bash|zsh|fish/i.test(shell)) return 'posix-shell';
  return 'unknown-shell';
}

function detectSurface(vscode, opencode, codex) {
  if (codex.detected) return 'codex';
  if (opencode.detected) return 'opencode';
  if (vscode.detected) return 'vscode-workspace';
  return 'plain-shell';
}

export function detectAgentEnvironment() {
  const envLoad = loadAtlasEnv(APP_ROOT);
  const vscodeFiles = [
    path.join(APP_ROOT, '.vscode', 'tasks.json'),
    path.join(REPO_ROOT, '.vscode', 'tasks.json'),
  ];
  const workspaceFile = firstExisting([
    path.join(REPO_ROOT, 'deeds-web-app.code-workspace'),
    path.join(APP_ROOT, 'sveltekit-frontend.code-workspace'),
  ]);
  const vscode = {
    detected: Boolean(
      process.env.VSCODE_PID ||
      process.env.TERM_PROGRAM === 'vscode' ||
      workspaceFile ||
      vscodeFiles.some((file) => exists(file))
    ),
    workspaceFile: workspaceFile ? rel(workspaceFile) : null,
    tasksFiles: vscodeFiles.filter((file) => exists(file)).map(rel),
    env: {
      VSCODE_PID: envFlag('VSCODE_PID'),
      TERM_PROGRAM: envFlag('TERM_PROGRAM'),
    },
  };

  const opencode = {
    detected: exists(path.join(APP_ROOT, 'opencode.json')) || exists(path.join(APP_ROOT, '.opencode')),
    config: exists(path.join(APP_ROOT, 'opencode.json')) ? 'opencode.json' : null,
    startupContext: exists(path.join(APP_ROOT, '.opencode', 'startup-context.json')) ? '.opencode/startup-context.json' : null,
    taskStateMarkdown: exists(path.join(APP_ROOT, '.opencode', 'tasks', 'task-state.md')) ? '.opencode/tasks/task-state.md' : null,
    taskState: exists(path.join(APP_ROOT, '.opencode', 'tasks', 'task-state.json')) ? '.opencode/tasks/task-state.json' : null,
  };

  const codex = {
    detected: Boolean(process.env.CODEX_SANDBOX || process.env.CODEX_HOME || process.env.OPENAI_WORKSPACE_ID),
    env: {
      CODEX_SANDBOX: envFlag('CODEX_SANDBOX'),
      CODEX_HOME: envFlag('CODEX_HOME'),
      OPENAI_WORKSPACE_ID: envFlag('OPENAI_WORKSPACE_ID'),
    },
  };

  const services = {
    postgres: {
      url: process.env.DATABASE_URL ? 'configured' : 'missing',
      defaultPort: 5434,
    },
    qdrant: {
      url: process.env.QDRANT_URL ?? 'http://127.0.0.1:6333',
      codebaseCollection: process.env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_768',
      envCollection: process.env.QDRANT_COLLECTION ?? null,
    },
    redis: {
      url: process.env.REDIS_URL ? 'configured' : 'missing',
      passwordConfigured: Boolean(process.env.REDIS_PASSWORD),
    },
    gemma4: {
      provider: 'turboquant',
      baseUrl: process.env.TURBOQUANT_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:8090',
      role: 'repo-audit-only-after-evidence',
    },
  };

  const workspace = {
    appRoot: APP_ROOT,
    repoRoot: REPO_ROOT,
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    shell: detectShell(),
    envFilesLoaded: envLoad.loadedFiles.map(rel),
  };

  const guardrails = [
    'repo-evidence-first',
    'regular-opencode-in-vscode-is-the-primary-agent-surface',
    'opencode-bootstrap-is-an-optional-context-refresh-not-the-entrypoint',
    'kanban-is-persistent-task-registry',
    'recommendations-are-append-only-inbox',
    'gemma4-is-local-orchestration-synthesis-only',
    'do-not-use-gemma4-for-generic-model-advice',
    'prefer-sse-browser-edge-until-transport-proof-changes',
  ];

  const surface = detectSurface(vscode, opencode, codex);

  return {
    generatedAt: new Date().toISOString(),
    surface,
    workspace,
    vscode,
    opencode,
    codex,
    services,
    guardrails,
    nextCommands: {
      refreshTasks: 'npm run opencode:tasks:refresh',
      optionalContextRefresh: 'npm run opencode:bootstrap',
      productionReadiness: 'npm run atlas:production-readiness',
      liveServiceEnv: 'npm run atlas:live-service-env',
    },
  };
}

export function renderAgentEnvironmentMarkdown(report) {
  return [
    '# OpenCode Agent Environment',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Surface',
    '',
    `- detected surface: ${report.surface}`,
    `- shell: ${report.workspace.shell}`,
    `- platform: ${report.workspace.platform}/${report.workspace.arch}`,
    `- cwd: ${report.workspace.cwd}`,
    '',
    '## Workspace',
    '',
    `- app root: ${report.workspace.appRoot}`,
    `- repo root: ${report.workspace.repoRoot}`,
    `- env files loaded: ${report.workspace.envFilesLoaded.length ? report.workspace.envFilesLoaded.join(', ') : 'none'}`,
    `- VS Code detected: ${report.vscode.detected}`,
    `- VS Code workspace: ${report.vscode.workspaceFile ?? 'n/a'}`,
    `- VS Code tasks: ${report.vscode.tasksFiles.length ? report.vscode.tasksFiles.join(', ') : 'none'}`,
    `- OpenCode detected: ${report.opencode.detected}`,
    `- OpenCode config: ${report.opencode.config ?? 'n/a'}`,
    `- OpenCode task state markdown: ${report.opencode.taskStateMarkdown ?? 'n/a'}`,
    `- OpenCode task state json: ${report.opencode.taskState ?? 'n/a'}`,
    `- Codex detected: ${report.codex.detected}`,
    '',
    '## Runtime Roles',
    '',
    `- Gemma4 role: ${report.services.gemma4.role}`,
    `- Gemma4 base URL: ${report.services.gemma4.baseUrl}`,
    `- Qdrant URL: ${report.services.qdrant.url}`,
    `- Qdrant codebase collection: ${report.services.qdrant.codebaseCollection}`,
    `- Qdrant env collection: ${report.services.qdrant.envCollection ?? 'n/a'}`,
    `- Redis password configured: ${report.services.redis.passwordConfigured}`,
    '',
    '## Guardrails',
    '',
    ...report.guardrails.map((item) => `- ${item}`),
    '',
    '## Next Commands',
    '',
    ...Object.entries(report.nextCommands).map(([key, command]) => `- ${key}: \`${command}\``),
    '',
  ].join('\n');
}

export async function writeAgentEnvironmentReport(paths) {
  const report = detectAgentEnvironment();
  await fs.mkdir(path.dirname(paths.json), { recursive: true });
  await fs.writeFile(paths.json, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(paths.md, renderAgentEnvironmentMarkdown(report), 'utf8');
  return report;
}
