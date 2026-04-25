const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true, ...opts });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: 1, signal: null, stdout, stderr: String(err) }));
  });
}

(async () => {
  const start = new Date();
  const iso = start.toISOString().replace(/[:]/g, '-');
  const logsDir = path.resolve(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `check-test-${iso}.log`);

  const header = [
    `CHECK/TEST RUN`,
    `timestamp: ${start.toISOString()}`,
    `cwd: ${process.cwd()}`,
    '',
  ].join('\n');

  // 1) Run TypeScript check (machine-friendly)
  process.stdout.write('Running TypeScript check...\n');
  const tscCmd = 'npx';
  const tscArgs = ['tsc', '--noEmit', '--pretty', 'false'];
  const tsc = await runCommand(tscCmd, tscArgs, { cwd: process.cwd() });

  // Parse tsc diagnostics lines like: file.ts(12,5): error TS2345: message
  const tsLines = (tsc.stdout + tsc.stderr).split(/\r?\n/).filter(Boolean);
  const tsDiagnostics = [];
  const tsOther = [];
  const diagRe = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):\s*(.*)$/i;
  for (const line of tsLines) {
    const m = diagRe.exec(line);
    if (m) {
      const file = path.relative(process.cwd(), m[1]);
      const entry = {
        file,
        line: m[2],
        col: m[3],
        kind: m[4].toLowerCase(),
        code: `TS${m[5]}`,
        message: m[6].trim(),
        raw: line,
      };
      tsDiagnostics.push(entry);
    } else {
      tsOther.push(line);
    }
  }

  // Group diagnostics by file
  const grouped = {};
  for (const d of tsDiagnostics) {
    grouped[d.file] = grouped[d.file] || [];
    grouped[d.file].push(d);
  }

  // 2) Run tests (use npm test if present)
  process.stdout.write('Running tests (npm test --if-present)...\n');
  const test = await runCommand('npm', ['run', 'test', '--if-present'], { cwd: process.cwd() });

  // Compose log
  const parts = [];
  parts.push(header);

  parts.push('=== TYPESCRIPT DIAGNOSTICS (grouped by file) ===\n');
  if (Object.keys(grouped).length === 0) {
    parts.push('No TypeScript diagnostics (tsc output empty or unparsable).\n');
  } else {
    for (const file of Object.keys(grouped).sort()) {
      parts.push(`-- ${file}`);
      for (const e of grouped[file]) {
        parts.push(`  [${e.code}] ${e.kind} at ${e.line}:${e.col} — ${e.message}`);
      }
      parts.push('');
    }
  }

  if (tsOther.length) {
    parts.push('=== REMAINING TSC OUTPUT ===');
    parts.push(...tsOther);
    parts.push('');
  }

  parts.push('=== TEST OUTPUT (npm test) ===');
  if (test.stdout) parts.push(test.stdout.trim());
  if (test.stderr) parts.push(test.stderr.trim());
  parts.push('');

  parts.push('=== SUMMARY ===');
  parts.push(`tsc exit code: ${String(tsc.code)}${tsc.signal ? ' signal:' + tsc.signal : ''}`);
  parts.push(`test exit code: ${String(test.code)}${test.signal ? ' signal:' + test.signal : ''}`);
  parts.push('');

  // Write log file
  try {
    fs.writeFileSync(logPath, parts.join('\n') + '\n', 'utf8');
    process.stdout.write(`Wrote log: ${logPath}\n`);
  } catch (err) {
    process.stderr.write(`Failed to write log: ${err}\n`);
  }

  // Print concise summary to console
  if (Object.keys(grouped).length) {
    process.stdout.write(`TypeScript diagnostics found in ${Object.keys(grouped).length} file(s).\n`);
    const files = Object.keys(grouped).slice(0, 5);
    for (const f of files) {
      process.stdout.write(` - ${f}: ${grouped[f].length} issue(s)\n`);
    }
  } else {
    process.stdout.write('No TypeScript diagnostics parsed.\n');
  }

  process.stdout.write(`tsc exit: ${String(tsc.code)}  test exit: ${String(test.code)}\n`);

  // Determine exit code: prefer tsc non-zero, else tests non-zero, else 0
  let exitCode = 0;
  if (typeof tsc.code === 'number' && tsc.code !== 0) exitCode = tsc.code;
  else if (typeof test.code === 'number' && test.code !== 0) exitCode = test.code;
  if (!exitCode && tsc.signal) exitCode = -1;
  if (!exitCode && test.signal) exitCode = -1;

  process.exit(exitCode);
})();
