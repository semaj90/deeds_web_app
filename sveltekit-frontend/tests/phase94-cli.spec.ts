import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(frontendRoot, '..');
const cliPath = path.join(frontendRoot, 'scripts', 'phase94-task-cli.py');

function resolvePython(): string {
  const venvPython = process.platform === 'win32'
    ? path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(workspaceRoot, '.venv', 'bin', 'python');

  return fs.existsSync(venvPython) ? venvPython : 'python';
}

function runCli(args: string[]) {
  const output = execFileSync(resolvePython(), [cliPath, ...args, '--json'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

test('analyze-file reports API route metadata offline', async () => {
  const result = runCli([
    'analyze-file',
    '--file',
    'sveltekit-frontend/src/routes/api/evidence/+server.ts',
  ]);

  expect(result.command).toBe('analyze-file');
  expect(result.file.exists).toBe(true);
  expect(result.file.role).toBe('api_route');
  expect(result.file.endpointMethods).toContain('GET');
});

test('recommend includes sync guidance for generated route type errors', async () => {
  const result = runCli([
    'recommend',
    '--language',
    'typescript',
    '--error-type',
    "Cannot find module './$types' or its corresponding type declarations.",
    '--context',
    '+server.ts',
    '--file',
    'sveltekit-frontend/src/routes/api/evidence/+server.ts',
  ]);

  expect(result.command).toBe('recommend');
  expect(Array.isArray(result.actions)).toBe(true);
  expect(result.actions.join(' ')).toContain('svelte-kit sync');
});