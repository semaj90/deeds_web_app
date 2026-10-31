import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./collect-host-preflight-v1.ps1', import.meta.url), 'utf8');

test('host preflight collects bounded host, GPU, Docker, and WSL diagnostics', () => {
  assert.match(source, /Win32_OperatingSystem/);
  assert.match(source, /Win32_Processor/);
  assert.match(source, /Win32_LogicalDisk/);
  assert.match(source, /nvidia-smi/);
  assert.match(source, /'ps', '--all'/);
  assert.match(source, /'stats', '--no-stream'/);
  assert.match(source, /'--list', '--running', '--quiet'/);
  assert.match(source, /configuredLimits/);
  assert.match(source, /hasWslLimitSettings/);
  assert.match(source, /if \(\$hasWslLimitSettings\) \{ \$wslLimits\.status = 'CONFIGURED_ONLY_RUNTIME_NOT_VERIFIED' \}/);
  assert.match(source, /runtimeResourceUsage/);
  assert.match(source, /atlas\.host-preflight\.v1/);
  assert.match(source, /DIAGNOSTIC_ONLY_NO_ADMISSION_OR_EXECUTION_AUTHORITY/);
});

test('WSL telemetry does not start a stopped distribution or authorize execution', () => {
  assert.doesNotMatch(source, /wsl\.exe['"]?\s+@?\([^)]*(?:-e|--exec|sh)/i);
  assert.match(source, /CONFIGURED_ONLY_RUNTIME_NOT_VERIFIED/);
  assert.match(source, /does not start a stopped distribution/);
  assert.doesNotMatch(source, /Start-Process|docker\s+(?:start|restart|rm|prune)|Set-ItemProperty/i);
});
