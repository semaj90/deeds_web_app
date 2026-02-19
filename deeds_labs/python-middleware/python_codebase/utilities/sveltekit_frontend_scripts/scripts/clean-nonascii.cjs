const fs = require('fs');
const path = require('path');
const glob = require('glob');

const repoRoot = path.resolve(__dirname, '..');
const patterns = [
  'src/**/*.ts',
  'src/**/*.js',
  'src/**/*.svelte',
  'src/**/*.tsx',
  'src/**/*.jsx'
];

const fixes = [
  { re: /\u2026/g, replace: '...' },        // ellipsis
  { re: /\u2018/g, replace: "'" },         // left single quote
  { re: /\u2019/g, replace: "'" },         // right single quote
  { re: /\u201C/g, replace: '"' },         // left double quote
  { re: /\u201D/g, replace: '"' },         // right double quote
  { re: /\u2013/g, replace: '-' },         // en-dash
  { re: /\u2014/g, replace: '--' },        // em-dash
  { re: /\u00A0/g, replace: ' ' }          // non-breaking space
];

function scanFiles(fix = false) {
  const results = [];
  for (const pat of patterns) {
    const files = glob.sync(pat, { cwd: repoRoot, dot: true, nodir: true });
    for (const f of files) {
      const fp = path.join(repoRoot, f);
      let src;
      try {
        src = fs.readFileSync(fp, 'utf8');
      } catch (e) {
        continue;
      }
      const fileMatches = [];
      for (const fixDef of fixes) {
        if (fixDef.re.test(src)) {
          fileMatches.push({ regex: fixDef.re, replaceWith: fixDef.replace });
        }
      }
      if (fileMatches.length) {
        results.push({ path: fp, matches: fileMatches.map(m => String(m.regex)) });
        if (fix) {
          let newSrc = src;
          for (const fixDef of fixes) newSrc = newSrc.replace(fixDef.re, fixDef.replace);
          fs.writeFileSync(fp, newSrc, 'utf8');
        }
      }
    }
  }
  return results;
}

const args = process.argv.slice(2);
const doFix = args.includes('--fix');

const found = scanFiles(doFix);
if (found.length === 0) {
  console.log('No problematic unicode characters found.');
} else {
  console.log(`Found ${found.length} file(s) with problematic characters:`);
  for (const r of found) {
    console.log(' -', r.path);
    for (const m of r.matches) console.log('    ', m);
  }
  if (doFix) {
    console.log('\nApplied replacements (--fix). Please re-run: npx tsc --noEmit');
  } else {
    console.log('\nRun: node ./scripts/clean-nonascii.cjs --fix  to automatically replace common problematic characters.');
  }
}
