#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

function resolveOnPath(command) {
  const pathEnv = process.env.PATH ?? '';
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const candidates = process.platform === 'win32'
    ? [command, `${command}.cmd`, `${command}.exe`, `${command}.bat`, `${command}.ps1`]
    : [command];

  for (const dir of dirs) {
    for (const candidate of candidates) {
      const resolved = join(dir, candidate);
      if (existsSync(resolved)) return resolved;
    }
  }

  return null;
}

function probe(command) {
  const resolved = resolveOnPath(command);
  return { ok: Boolean(resolved), out: resolved ?? '' };
}

const sg = probe('sg');
const astGrep = probe('ast-grep');
const jq = probe('jq');

const summary = {
  ok: sg.ok || astGrep.ok,
  structural_cli: sg.ok ? 'sg' : (astGrep.ok ? 'ast-grep' : 'missing'),
  sg: sg.ok,
  ast_grep: astGrep.ok,
  jq: jq.ok,
  notes: [
    'sg/ast-grep enables structural AST search and complements rg lexical search.',
    'jq is optional but useful for JSON-heavy smoke and ops scripts.'
  ]
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  console.error('Missing sg/ast-grep. Install with: npm i -g @ast-grep/cli');
  process.exit(1);
}
