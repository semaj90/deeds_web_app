#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findTsconfig(startDir) {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  while (true) {
	const candidate = path.join(dir, 'tsconfig.json');
	if (fs.existsSync(candidate)) return candidate;
	if (dir === root) return null;
	dir = path.dirname(dir);
  }
}

function formatDiagnostic(ts, diag) {
  const msg = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
  const category = ts.DiagnosticCategory[diag.category] || String(diag.category);
  const code = diag.code;
  if (diag.file && typeof diag.start === 'number') {
	const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
	return {
	  file: path.relative(process.cwd(), diag.file.fileName),
	  line: line + 1,
	  character: character + 1,
	  message: msg,
	  category,
	  code,
	};
  } else {
	return {
	  file: null,
	  line: null,
	  character: null,
	  message: msg,
	  category,
	  code,
	};
  }
}

async function main() {
  let ts;
  try {
	ts = await import('typescript');
  } catch (err) {
	console.error('❌ TypeScript package not found. Install it with: npm install --save-dev typescript');
	process.exit(2);
  }

  const tsconfigPath = findTsconfig(__dirname) || findTsconfig(process.cwd());
  if (!tsconfigPath) {
	console.error('❌ tsconfig.json not found in this project or parent directories.');
	process.exit(2);
  }

  const configText = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configText.error) {
	const formatted = formatDiagnostic(ts, configText.error);
	console.error(JSON.stringify([formatted], null, 2));
	process.exit(2);
  }

  const parsed = ts.parseJsonConfigFileContent(
	configText.config,
	ts.sys,
	path.dirname(tsconfigPath)
  );

  const program = ts.createProgram({
	rootNames: parsed.fileNames,
	options: { ...parsed.options, noEmit: true },
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);
  const results = diagnostics.map(d => formatDiagnostic(ts, d));

  // Print JSON to stdout for easy consumption by other tools/CI
  if (results.length === 0) {
	console.log('[]');
	process.exit(0);
  } else {
	console.log(JSON.stringify(results, null, 2));
	const hasError = diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
	process.exit(hasError ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err && (err.stack || err.message || err));
  process.exit(2);
});
