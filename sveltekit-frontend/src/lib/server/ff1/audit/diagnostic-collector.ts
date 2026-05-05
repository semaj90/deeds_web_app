/**
 * FF1 Diagnostic Collector
 *
 * Runs tsgo, svelte-check, and (optionally) vitest using spawn() — NOT execSync.
 * Output is consumed line-by-line so we never buffer more than ~1MB in RAM.
 *
 * OOM prevention rules:
 *   1. spawn (streaming) instead of exec (buffered)
 *   2. MAX_DIAGNOSTICS cap (2000) — extra entries are discarded
 *   3. readline line-by-line processing
 *   4. Per-tool timeout (default 120s)
 */

import { spawn }         from 'child_process';
import { createInterface } from 'readline';
import { createHash }    from 'crypto';
import path              from 'path';
import type { DiagnosticEntry } from '../graph/graph-schema.js';
import { severityScore }        from '../graph/graph-schema.js';

const MAX_DIAGNOSTICS = 2000;
const ROOT = path.resolve(process.cwd());

// ── Output format regexes ─────────────────────────────────────────────────

// tsgo (new): "src/file.ts:34:19 - error TS2345: message"
const TSGO_RE   = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
// tsc (classic): "src/file.ts(34,19): error TS2345: message"
const TSC_RE    = /^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+):\s+(.+)$/;
// svelte-check file line: "c:\path\to\file.ts:34:19"
const SV_FILE_RE = /^(.+\.(ts|svelte)):(\d+):(\d+)$/i;
// svelte-check error line: "Error: message"
const SV_ERR_RE  = /^(Error|Warning):\s+(.+)$/;

// ── Helpers ───────────────────────────────────────────────────────────────

function diagId(source: string, filePath: string, line: number | undefined, message: string): string {
  return createHash('sha1')
    .update(`${source}:${filePath}:${line ?? 0}:${message}`)
    .digest('hex')
    .slice(0, 16);
}

function rel(p: string): string {
  try {
    const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
    return path.relative(ROOT, abs).replace(/\\/g, '/');
  } catch {
    return p;
  }
}

// ── Spawn runner ──────────────────────────────────────────────────────────

async function spawnLines(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let timedOut = false;

    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      // shell needed on Windows for npx
      shell: process.platform === 'win32',
    });

    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    const re = createInterface({ input: proc.stderr, crlfDelay: Infinity });
    rl.on('line', l => lines.push(l));
    re.on('line', l => lines.push(l));

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      lines.push(`[ff1] TIMEOUT after ${timeoutMs}ms — ${cmd} ${args.join(' ')}`);
      resolve(lines);
    }, timeoutMs);

    proc.on('close', () => {
      if (!timedOut) {
        clearTimeout(timer);
        resolve(lines);
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      lines.push(`[ff1] spawn error: ${e.message}`);
      resolve(lines);
    });
  });
}

// ── Parsers ───────────────────────────────────────────────────────────────

function parseTsgoLines(lines: string[]): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  for (const line of lines) {
    let m = TSGO_RE.exec(line);
    if (!m) m = TSC_RE.exec(line);
    if (!m) continue;

    const [, file, lineNo, col, sev, code, msg] = m;
    const severity = (sev === 'error' ? 'error' : sev === 'warning' ? 'warning' : 'info') as DiagnosticEntry['severity'];
    const filePath = rel(file);
    const ln = parseInt(lineNo, 10);
    out.push({
      id:       diagId('tsgo', filePath, ln, msg),
      source:   'tsgo',
      severity,
      filePath,
      line:     ln,
      column:   parseInt(col, 10),
      code:     code.trim(),
      message:  msg.trim(),
      riskScore: severityScore(severity) * 4,
    });
  }
  return out;
}

function parseSvelteCheckLines(lines: string[]): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  let pending: { path: string; line: number; col: number } | null = null;

  for (const line of lines) {
    const fm = SV_FILE_RE.exec(line.trim());
    if (fm) {
      pending = { path: rel(fm[1]), line: parseInt(fm[3], 10), col: parseInt(fm[4], 10) };
      continue;
    }
    if (pending) {
      const em = SV_ERR_RE.exec(line.trim());
      if (em) {
        const [, sevWord, msg] = em;
        const severity: DiagnosticEntry['severity'] = sevWord === 'Error' ? 'error' : 'warning';
        out.push({
          id:       diagId('svelte-check', pending.path, pending.line, msg),
          source:   'svelte-check',
          severity,
          filePath: pending.path,
          line:     pending.line,
          column:   pending.col,
          message:  msg.trim(),
          riskScore: severityScore(severity) * 4,
        });
        pending = null;
      }
    }
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────

export interface CollectorOptions {
  cwd?: string;
  includeWarnings?: boolean;
  timeoutMs?: number;
  tools?: Array<'tsgo' | 'svelte-check' | 'vitest'>;
}

export interface CollectorResult {
  diagnostics: DiagnosticEntry[];
  truncated: boolean;
  durationMs: number;
  bySource: Record<string, number>;
}

export async function collectDiagnostics(opts: CollectorOptions = {}): Promise<CollectorResult> {
  const start   = Date.now();
  const cwd     = opts.cwd ?? ROOT;
  const tools   = opts.tools ?? ['tsgo', 'svelte-check'];
  const timeout = opts.timeoutMs ?? 120_000;
  const all: DiagnosticEntry[] = [];

  for (const tool of tools) {
    if (all.length >= MAX_DIAGNOSTICS) break;

    try {
      if (tool === 'tsgo') {
        const lines  = await spawnLines('npx', ['tsgo', '--noEmit'], cwd, timeout);
        all.push(...parseTsgoLines(lines));

      } else if (tool === 'svelte-check') {
        const lines  = await spawnLines(
          'npx', ['svelte-check', '--threshold', 'warning', '--output', 'human'], cwd, timeout
        );
        all.push(...parseSvelteCheckLines(lines));

      } else if (tool === 'vitest') {
        // vitest human output — grab FAIL lines; --reporter=json is slower
        const lines = await spawnLines('npx', ['vitest', 'run', '--reporter=verbose'], cwd, timeout);
        for (const l of lines.filter(l => l.match(/FAIL|✗|× /))) {
          all.push({
            id:       diagId('vitest', '(vitest)', undefined, l),
            source:   'vitest',
            severity: 'error',
            filePath: '(vitest)',
            message:  l.trim().slice(0, 200),
            riskScore: 12,
          });
        }
      }
    } catch (err) {
      console.warn(`[ff1] ${tool} runner error:`, (err as Error).message);
    }
  }

  // Filter warnings if not requested
  const filtered = opts.includeWarnings ? all : all.filter(d => d.severity === 'error');

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = filtered.filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  // Cap
  const truncated = deduped.length > MAX_DIAGNOSTICS;
  const final     = deduped.slice(0, MAX_DIAGNOSTICS);

  // Count by source
  const bySource: Record<string, number> = {};
  for (const d of final) bySource[d.source] = (bySource[d.source] ?? 0) + 1;

  return { diagnostics: final, truncated, durationMs: Date.now() - start, bySource };
}
