#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Installing dependencies directly (bypassing npm workspace issue)...\n');

try {
  // Set cwd to the sveltekit-frontend directory
  const cwd = __dirname;

  // Run npm install directly with full path
  console.log(`📦 Installing from: ${cwd}\n`);

  // Use npx to bypass npm workspace issues
  execSync('npx npm install', {
    cwd,
    stdio: 'inherit',
    shell: true
  });

  console.log('\n✅ Dependencies installed successfully!');
} catch (error) {
  console.error('\n❌ Installation failed. Trying alternative method...\n');

  try {
    // Alternative: use Node's direct npm
    execSync(`node -e "require('npm').load(() => require('npm').commands.install([], (e) => process.exit(e ? 1 : 0)))"`, {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });

    console.log('\n✅ Dependencies installed successfully!');
  } catch (error2) {
    console.error('❌ Both installation methods failed');
    process.exit(1);
  }
}
