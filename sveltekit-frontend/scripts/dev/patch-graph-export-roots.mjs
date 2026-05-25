#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.join(process.cwd(), 'scripts', 'atlas', 'generate-graph-exports.mjs');
const canonicalBody = [
  '  process.cwd(),',
  "  path.join(process.cwd(), 'sveltekit-frontend'),",
  "  path.resolve(process.cwd(), '..'),",
  "  path.resolve(process.cwd(), '..', 'sveltekit-frontend'),",
  '  ABSOLUTE_REPO_ROOT'
].join('\n');

const source = fs.readFileSync(filePath, 'utf8');
const rootBlockMatch = source.match(/const CANDIDATE_ROOTS = \[(?<body>[\s\S]*?)\];/);
if (!rootBlockMatch?.groups?.body) {
  throw new Error('Could not locate CANDIDATE_ROOTS block in generate-graph-exports.mjs');
}

const body = rootBlockMatch.groups.body;
const nextBlock = `const CANDIDATE_ROOTS = [\n${canonicalBody}\n];`;

if (body.trim() !== canonicalBody.trim()) {
  const nextSource = source.replace(rootBlockMatch[0], nextBlock);
  fs.writeFileSync(filePath, nextSource);
}

console.log(JSON.stringify({
  status: 'pass',
  filePath,
  added: body.trim() === canonicalBody.trim() ? [] : ['canonicalized CANDIDATE_ROOTS'],
  changed: body.trim() !== canonicalBody.trim()
}, null, 2));
