import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svelteDir = path.resolve(__dirname, '../sveltekit-frontend');

// Run TypeScript compiler and get all TS1005 errors
async function getTS1005Errors() {
  try {
    await execAsync('npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS1005"', { cwd: svelteDir, maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    // tsc exits with error code when there are errors, capture the output
    return error.stdout || '';
  }
  return '';
}

// Fix specific patterns in a file
async function fixFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;

    // Pattern 1: Fix "})" followed by semicolon where comma is needed
    if (content.match(/\}\)[;,]?\s*\n\s*\/\//)) {
      content = content.replace(/\}\);(\s*\n\s*\/\/)/g, '}),$1');
      modified = true;
    }

    // Pattern 2: Fix function parameter lists ending with semicolon
    if (content.match(/config:\s*\w+Options;?\)/)) {
      content = content.replace(/(config:\s*\w+Options);(\s*\))/g, '$1$2');
      modified = true;
    }

    // Pattern 3: Fix ".catch()" with wrong closing
    if (content.match(/\.catch\([^)]*\)[;,]?\s*$/m)) {
      content = content.replace(/\.catch\(([^)]*)\);(\s*\n)/g, '.catch($1)$2');
      modified = true;
    }

    // Pattern 4: Fix object literals with "||{," (wrong syntax)
    if (content.match(/\|\|\s*\{,/)) {
      content = content.replace(/\|\|\s*\{,/g, '|| {');
      modified = true;
    }

    // Pattern 5: Fix "result }" missing comma
    if (content.match(/result\s*\}/)) {
      content = content.replace(/result\s*\}/g, 'result, }');
      modified = true;
    }

    if (modified) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`✅ Fixed ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔧 Starting automated syntax error fixes...\n');

  const errorOutput = await getTS1005Errors();
  const lines = errorOutput.split('\n').filter(l => l.includes('error TS1005'));

  // Extract unique file paths
  const files = new Set();
  for (const line of lines) {
    const match = line.match(/^(.*?\.ts)\(/);
    if (match) {
      const filePath = path.resolve(svelteDir, match[1]);
      files.add(filePath);
    }
  }

  console.log(`Found ${files.size} files with TS1005 errors\n`);

  let fixedCount = 0;
  for (const file of files) {
    if (await fixFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} files`);
  console.log('\nRunning TypeScript check to verify fixes...\n');

  // Check remaining errors
  const newErrors = await getTS1005Errors();
  const newErrorCount = newErrors.split('\n').filter(l => l.includes('error TS1005')).length;

  console.log(`📊 Remaining TS1005 errors: ${newErrorCount}`);
}

main().catch(console.error);
