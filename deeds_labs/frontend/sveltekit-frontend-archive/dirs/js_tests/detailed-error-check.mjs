import { execSync } from 'child_process';

console.log('🔍 Running svelte-check...\n');

try {
  const result = execSync('npx svelte-check', {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10,
  });
  console.log('✅ No errors found!');
} catch (error) {
  const output = error.stdout || error.stderr || '';

  // Get the summary line
  const lines = output.split('\n');
  const summaryLine = lines.find((line) => line.includes('svelte-check found'));

  if (summaryLine) {
    console.log('📊 Status:', summaryLine);
  }

  // Show first 15 error lines with context
  const errorLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Error:')) {
      errorLines.push({
        line: lines[i],
        context: lines[i - 1] || '',
        file: lines[i - 2] || '',
      });
    }
  }

  console.log('\n🚨 Next Errors to Fix:');
  errorLines.slice(0, 8).forEach((err, i) => {
    console.log(`\n${i + 1}. File: ${err.file}`);
    console.log(`   Context: ${err.context}`);
    console.log(`   Error: ${err.line.replace(/Error: /, '')}`);
  });

  if (errorLines.length > 8) {
    console.log(`\n... and ${errorLines.length - 8} more errors to fix`);
  }
}
