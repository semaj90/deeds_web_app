#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function probe(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const ok = result.status === 0;
  const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { ok, out };
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
