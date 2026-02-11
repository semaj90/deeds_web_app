const fs = require('fs');
const { execSync } = require('child_process');

const base = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend';
const output = execSync(
  'grep -rln "\$state<any>(undefined)" --include="*.svelte" "' + base + '/src/" | grep -v _archive | grep -v routes_parked',
  { encoding: 'utf8' }
);
const files = output.trim().split('\n').filter(Boolean);
let totalFixed = 0;
let totalLinesRemoved = 0;

for (const fullPath of files) {
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    const newLines = [];
    let removed = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\s*let\s+(\w+)\s*=\s*\$state<any>\(undefined\)\s*;?\s*$/);
      if (match) {
        const varName = match[1];
        // Check if this variable appears in $props() elsewhere in the file
        const restContent = lines.slice(i + 1).join('\n');
        if (restContent.includes('$props') && restContent.includes(varName)) {
          removed++;
          continue;
        }
      }
      newLines.push(line);
    }

    if (removed > 0) {
      content = newLines.join('\n');
      fs.writeFileSync(fullPath, content, 'utf8');
      totalFixed++;
      totalLinesRemoved += removed;
      const relPath = fullPath.substring(fullPath.indexOf('src'));
      console.log('Fixed ' + removed + ' duplicates: ' + relPath);
    }
  } catch (err) {
    console.log('ERROR: ' + err.message);
  }
}

console.log('\nTotal files fixed: ' + totalFixed);
console.log('Total lines removed: ' + totalLinesRemoved);
