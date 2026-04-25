import fs from 'fs';
import path from 'path';

const ERROR_PATTERNS = {
  TS001: {
    name: 'TypeScript: Union types with comma instead of pipe',
    severity: 'HIGH',
    fileTypes: ['.ts', '.tsx'],
    regex: /(?<=\w+\s*:\s*)(?![\w\s]*[=:])[^;,{}\n]*,\s*\w+(?=\s*[;|=])/g,
    description: 'Type union using comma instead of pipe in TypeScript',
    example: 'let x: string, number = "hello";'
  },
  CSS001: {
    name: 'CSS: Commas instead of semicolons',
    severity: 'CRITICAL',
    fileTypes: ['.css', '.scss', '.svelte'],
    regex: /(?<=\w+(?:-\w+)*\s*:\s*[^;]+),\s*(?=\w+(?:-\w+)*\s*:)/g,
    description: 'CSS properties separated by commas instead of semicolons',
    example: 'color: red, font-size: 14px;'
  },
  JS001: {
    name: 'JavaScript: Console statements in production',
    severity: 'LOW',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte', '.mjs'],
    regex: /console\.(log|warn|error|debug|info|trace)\s*\(/g,
    description: 'Console statements left in production code',
    example: 'console.log("Debug info");'
  }
};

const testFile = 'test-errors.svelte';
const content = fs.readFileSync(testFile, 'utf-8');
console.log('Testing patterns on:', testFile);
console.log('File content length:', content.length);
console.log('');

let totalMatches = 0;

for (const [patternId, pattern] of Object.entries(ERROR_PATTERNS)) {
  const fileExt = path.extname(testFile).toLowerCase();
  if (pattern.fileTypes && !pattern.fileTypes.includes(fileExt)) {
    console.log(`${patternId}: Skipped (file type not in ${pattern.fileTypes.join(', ')})`);
    continue;
  }

  const matches = content.match(pattern.regex);
  if (matches) {
    console.log(`${patternId}: ${pattern.name}`);
    console.log(`  Found ${matches.length} matches:`, matches.slice(0, 3));
    console.log(`  Severity: ${pattern.severity}`);
    console.log('');
    totalMatches += matches.length;
  } else {
    console.log(`${patternId}: No matches found`);
  }
}

console.log(`Total pattern matches found: ${totalMatches}`);