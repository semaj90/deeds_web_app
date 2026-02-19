// scripts/log-ts-errors.mjs
import fs from 'fs/promises';
import path from 'path';
import ts from 'typescript';

const repoRoot = path.resolve(new URL(import.meta.url).pathname, '..', '..'); // adjust if running from different cwd
const outDir = path.resolve(process.cwd(), 'logs');
await fs.mkdir(outDir, { recursive: true });

function formatDiagnostic(diag, host) {
  return ts.formatDiagnosticsWithColorAndContext([diag], host);
}

async function run() {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  let options = {};
  let fileNames = [];

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
    options = parsed.options;
    fileNames = parsed.fileNames;
  } else {
    console.log('No tsconfig.json found — defaulting to all .ts/.tsx in cwd');
    const glob = ['**/*.ts','**/*.tsx','**/*.js','**/*.jsx'];
    // fallback: ask program to search files by host (could be large). We'll just use ts.sys.readDirectory:
    fileNames = ts.sys.readDirectory(process.cwd(), ['.ts', '.tsx', '.js', '.jsx'], undefined, ['**/node_modules/**']);
  }

  const program = ts.createProgram({ rootNames: fileNames, options });
  const host = ts.createCompilerHost(options);

  // collect diagnostics
  const syntactic = program.getSyntacticDiagnostics();
  const semantic = program.getSemanticDiagnostics();
  const optionsDiag = program.getOptionsDiagnostics();
  const all = [...optionsDiag, ...syntactic, ...semantic];

  // aggregate by code+message
  const agg = new Map();
  for (const d of all) {
    const code = d.code;
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const key = `${code} - ${message}`;
    const entry = agg.get(key) || { code, message, count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 5) {
      // push filename:line:col sample if available
      if (d.file && typeof d.start === 'number') {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        entry.examples.push(`${d.file.fileName}:${line + 1}:${character + 1}`);
      } else {
        entry.examples.push('unknown');
      }
    }
    agg.set(key, entry);
  }

  // sort aggregates by count desc
  const sorted = Array.from(agg.values()).sort((a, b) => b.count - a.count);

  // write JSON & text summary
  await fs.writeFile(path.join(outDir, 'ts-errors.json'), JSON.stringify({ total: all.length, byCode: sorted }, null, 2), 'utf8');

  const lines = [
    `Total diagnostics: ${all.length}`,
    '',
    'Top diagnostics (code - message) and example locations:',
  ];
  for (const e of sorted.slice(0, 50)) {
    lines.push(`${e.code} (${e.count}) — ${e.message}`);
    lines.push(`  examples: ${e.examples.join(', ')}`);
  }
  await fs.writeFile(path.join(outDir, 'ts-errors-summary.txt'), lines.join('\n'), 'utf8');

  console.log(`Wrote logs: ${path.join(outDir, 'ts-errors.json')} and ts-errors-summary.txt`);
}

run().catch(err => {
  console.error('error running diagnostic script', err);
  process.exit(1);
});