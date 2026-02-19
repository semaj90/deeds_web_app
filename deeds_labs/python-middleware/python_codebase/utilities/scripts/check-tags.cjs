#!/usr/bin/env node
// CommonJS tag checker for Svelte files
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('Usage: node check-tags.cjs <file>'); process.exit(2); }
let contentFull = fs.readFileSync(file,'utf8');
// remove HTML comments
contentFull = contentFull.replace(/<!--([\s\S]*?)-->/g, '');
// remove script/style contents to avoid false positives
contentFull = contentFull.replace(/<script[\s\S]*?<\/script>/gi, '');
contentFull = contentFull.replace(/<style[\s\S]*?<\/style>/gi, '');
const lines = contentFull.split(/\r?\n/);
const stack = [];
const selfClosing = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

const re = /<(\/)?\s*([A-Za-z0-9-:]+)([^>]*)>/g;
let m;
while ((m = re.exec(contentFull)) !== null) {
  const match = m[0];
  const isClose = !!m[1];
  const tag = m[2];
  const rest = m[3] || '';
  const self = /\/$/.test(rest) || rest.includes('/>') || rest.trim().endsWith('/');
  // compute line number by counting newlines before match.index
  const start = contentFull.slice(0, m.index);
  const lineNumber = start.split(/\r?\n/).length;
  if (isClose) {
    if (stack.length === 0) {
      console.error(`Unmatched closing </${tag}> at ${file}:${lineNumber}`);
      console.error('Line:', lines[lineNumber-1].trim());
      process.exit(3);
    }
    const top = stack[stack.length-1];
    if (top !== tag) {
      console.error(`Tag mismatch at ${file}:${lineNumber} - closing </${tag}> but top of stack is <${top}>`);
      console.error('Context lines:');
      const startLine = Math.max(0, lineNumber-4);
      console.error(lines.slice(startLine, lineNumber+1).join('\n'));
      process.exit(4);
    }
    stack.pop();
  } else {
    if (!self && !selfClosing.has(tag.toLowerCase())) {
      stack.push(tag);
    }
  }
}
if (stack.length>0) {
  console.error('Unclosed tags at EOF:', stack.slice(-10));
  process.exit(5);
}
console.log('No tag mismatches found.');
