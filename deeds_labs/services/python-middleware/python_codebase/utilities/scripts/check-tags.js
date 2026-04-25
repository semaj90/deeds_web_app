#!/usr/bin/env node
// Simple tag stack checker for HTML-like files (Svelte aware)
// Usage: node scripts/check-tags.js path/to/file
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('Usage: node check-tags.js <file>'); process.exit(2); }
const content = fs.readFileSync(file,'utf8');
const lines = content.split(/\r?\n/);
const stack = [];
const selfClosing = new Set(['img','input','br','hr','meta','link','path','svg']);
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  // find tags
  const re = /<(\/)?\s*([A-Za-z0-9-:]+)([^>]*)>/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const isClose = !!m[1];
    const tag = m[2];
    const rest = m[3] || '';
    const self = /\/$/.test(rest) || rest.includes('/>') || rest.trim().endsWith('/');
    if (isClose) {
      if (stack.length === 0) {
        console.error(`Unmatched closing </${tag}> at ${file}:${i+1}`);
        console.error('Line:', line.trim());
        process.exit(3);
      }
      const top = stack[stack.length-1];
      if (top !== tag) {
        console.error(`Tag mismatch at ${file}:${i+1} - closing </${tag}> but top of stack is <${top}>`);
        console.error('Context lines:');
        console.error(lines.slice(Math.max(0,i-3), i+2).join('\n'));
        process.exit(4);
      }
      stack.pop();
    } else {
      // ignore component tags (capitalized) to avoid false positives maybe still push though
      if (!self && !selfClosing.has(tag.toLowerCase())) {
        stack.push(tag);
      }
    }
  }
}
if (stack.length>0) {
  console.error('Unclosed tags at EOF:', stack.slice(-10));
  process.exit(5);
}
console.log('No tag mismatches found.');
