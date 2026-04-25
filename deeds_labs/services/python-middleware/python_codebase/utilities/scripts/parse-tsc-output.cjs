const fs = require('fs');
const path = require('path');

const inputPath = path.resolve(__dirname, '..', 'sveltekit-tsc-output.txt');
if (!fs.existsSync(inputPath)) {
  console.error('Error: sveltekit-tsc-output.txt not found at', inputPath);
  process.exit(2);
}

const raw = fs.readFileSync(inputPath, 'utf8');

// Flatten the raw output to remove accidental line-breaks inside file paths
const flat = raw.replace(/\r?\n/g, ' ');
// More tolerant regex to account for stray bytes before path. Capture up to 200 chars before the extension.
const fileRegex = /([^^\s]{1,200}?\.(ts|tsx|js|jsx|svelte))\((\d+),(\d+)\):\s*error/gi;
const counts = Object.create(null);

for (const m of flat.matchAll(fileRegex)) {
  let file = m[1];
  // strip non-printable/leading junk characters that sometimes appear in the tsc output
  file = file.replace(/^[^\w\.\\/:-]+/, '');
  counts[file] = (counts[file] || 0) + 1;
}

const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
if (entries.length === 0) {
  // Fallback: try a simpler regex directly on raw text
  const fallbackRegex = /(\S+?\.(ts|tsx|js|jsx|svelte))\(/gi;
  for (const m of raw.matchAll(fallbackRegex)) {
    let f = m[1];
    f = f.replace(/^[^\w\.\\/:-]+/, '');
    counts[f] = (counts[f] || 0) + 1;
  }

  const fallbackEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (fallbackEntries.length > 0) {
    console.log('Top files by error count (fallback):');
    const topFallback = fallbackEntries.slice(0, 30);
    for (const [file, cnt] of topFallback) {
      console.log(cnt.toString().padStart(5), file);
    }
    console.log('\nTotal files with errors:', fallbackEntries.length);
    process.exit(0);
  }

  console.error('No matching file error lines found. Debugging sample below:');
  const sample = raw.split(/\r?\n/).slice(0, 60);
  const perLineRegex = /([\S]+?\.(ts|tsx|js|jsx|svelte))\((\d+),(\d+)\):\s+error\s+/i;
  for (let i = 0; i < sample.length; i++) {
    const line = sample[i];
    const ok = perLineRegex.test(line);
    console.error(i.toString().padStart(3) + (ok ? ' MATCH ' : ' ----- ') + ' | ' + line);
  }
  process.exit(3);
}

console.log('Top files by error count:');
const top = entries.slice(0, 30);
for (const [file, cnt] of top) {
  console.log(cnt.toString().padStart(5), file);
}

console.log('\nTotal files with errors:', entries.length);
