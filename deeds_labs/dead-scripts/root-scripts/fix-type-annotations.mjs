import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Run tsc with no emit to collect type errors
function runTsc() {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['tsc', '--noEmit', '--pretty', 'false'];
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

// Parse tsc output for file/line/column/error/message
function parseTscOutput(output) {
  const lines = output.split(/\r?\n/);
  const diagnostics = [];
  const re = /^(.+?\.[tj]s[x]?):\((\d+),(\d+)\):\s*error\s*TS(\d+):\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const [, file, lineNo, colNo, code, message] = m;
      diagnostics.push({
        file: path.resolve(file),
        line: Number(lineNo),
        column: Number(colNo),
        code: Number(code),
        message: message.trim(),
      });
    }
  }
  return diagnostics;
}

// Generate simple suggestions for known diagnostics (non-destructive)
function generateSuggestions(diagnostics) {
  const suggestions = [];
  for (const d of diagnostics) {
    if (d.code === 7006) {
      // Parameter implicitly has 'any' type
      try {
        const src = fs.readFileSync(d.file, 'utf8').split(/\r?\n/);
        const srcLine = src[d.line - 1] ?? '';
        // crude param name extraction around column
        const before = srcLine.slice(0, d.column + 5);
        const paramMatch = before.match(/([a-zA-Z0-9_$]+)\s*(=|,|\)|:)?\s*$/);
        const paramName = paramMatch ? paramMatch[1] : null;
        const suggestion = paramName ? srcLine.replace(new RegExp(`\\b${paramName}\\b`), `${paramName}: any`) : null;
        suggestions.push({
          diagnostic: d,
          originalLine: srcLine.trim(),
          suggestedLine: suggestion ? suggestion.trim() : null,
          note: suggestion
            ? "Consider replacing the parameter with an explicit type (e.g. ': any' or a stricter type)."
            : 'Unable to infer parameter name automatically; open the file and add an explicit parameter type.',
        });
      } catch (err) {
        suggestions.push({
          diagnostic: d,
          originalLine: null,
          suggestedLine: null,
          note: `Cannot read file: ${String(err)}`,
        });
      }
    } else {
      // generic entry for other codes
      suggestions.push({
        diagnostic: d,
        originalLine: null,
        suggestedLine: null,
        note: 'No automatic suggestion implemented for this error code. Review manually.',
      });
    }
  }
  return suggestions;
}

function writeReport(suggestions) {
  const outPath = path.resolve(process.cwd(), 'fix-type-annotations-report.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), suggestions }, null, 2), 'utf8');
  console.log('Suggestions written to', outPath);
}

// Entry point
(function main() {
  console.log('Running TypeScript check (tsc --noEmit)...');
  const { stdout, stderr, status } = runTsc();
  const combined = [stdout, stderr].filter(Boolean).join('\n');
  const diagnostics = parseTscOutput(combined);
  if (diagnostics.length === 0) {
    console.log('No tsc diagnostics parsed. tsc exit status:', status);
    process.exit(status ?? 0);
  }
  const suggestions = generateSuggestions(diagnostics);
  // print concise summary to console
  for (const s of suggestions) {
    const d = s.diagnostic;
    console.log(`\n${d.file}:${d.line}:${d.column} TS${d.code}: ${d.message}`);
    if (s.originalLine) {
      console.log('  original:', s.originalLine.trim());
    }
    if (s.suggestedLine) {
      console.log('  suggestion:', s.suggestedLine.trim());
    }
    console.log('  note:', s.note);
  }
  writeReport(suggestions);
  process.exit(0);
})();
