/**
 * Phase 56 – Unified Log Parser
 * Merges svelte-check diagnostics with CMake + CUDA logs.
 */

import fs from 'fs';
import path from 'path';

interface Diagnostic {
  phase: string;
  file?: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  type: 'svelte' | 'cuda' | 'cmake';
}

const logPath = path.resolve('../../cpp-ast-exporter/build_log.json');
const svelteLog = path.resolve('../.svelte-check-output.json');
const out = path.resolve('../analyzed-diagnostics.json');

function parseCMakeLog(raw: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const regex = /(error|warning): (.+?)(\r?\n|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    diagnostics.push({
      phase: 'Phase 56 – CUDA Build',
      message: match[2].trim(),
      severity: match[1].toLowerCase() as 'error' | 'warning' | 'info',
      type: 'cuda'
    });
  }
  return diagnostics;
}

function parseSvelteLog(raw: string): Diagnostic[] {
  try {
    const data = JSON.parse(raw);
    return data.errors.map((err: any) => ({
      phase: 'Svelte Check',
      file: err.filename,
      line: err.start?.line,
      message: err.message,
      severity: 'error',
      type: 'svelte'
    }));
  } catch {
    return [];
  }
}

const cmakeDiagnostics = parseCMakeLog(fs.readFileSync(logPath, 'utf8'));
const svelteDiagnostics = fs.existsSync(svelteLog)
  ? parseSvelteLog(fs.readFileSync(svelteLog, 'utf8'))
  : [];

const merged = [...cmakeDiagnostics, ...svelteDiagnostics];

fs.writeFileSync(out, JSON.stringify(merged, null, 2));
console.log(`🧩 Diagnostics merged → ${out}`);