#!/usr/bin/env node

/**
 * Simple Ripgrep Test
 * Test basic ripgrep functionality
 */

import { spawn } from 'child_process';

async function testRipgrep() {
  console.log('🧪 Testing Ripgrep Integration');
  console.log('=' .repeat(30));

  return new Promise((resolve, reject) => {
    // Simple test: search for "console" in JS files
    const rg = spawn('rg', [
      '--json',
      '--type', 'js',
      '--glob', '!node_modules/**',
      'console'
    ], { cwd: process.cwd() });

    let stdout = '';
    let stderr = '';

    rg.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    rg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    rg.on('close', (code) => {
      console.log(`Exit code: ${code}`);

      if (code === 0 || code === 1) { // 0 = matches found, 1 = no matches
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        console.log(`Found ${lines.length} matches for "console" in JS files`);

        if (lines.length > 0) {
          // Parse first few matches
          for (let i = 0; i < Math.min(3, lines.length); i++) {
            try {
              const data = JSON.parse(lines[i]);
              if (data.type === 'match') {
                console.log(`  ${data.path.text}:${data.line_number} - ${data.lines.text.trim()}`);
              }
            } catch (e) {
              console.log(`  Parse error: ${lines[i].substring(0, 50)}...`);
            }
          }
        }

        resolve(true);
      } else {
        console.log(`Error: ${stderr}`);
        reject(new Error(stderr));
      }
    });

    rg.on('error', (error) => {
      console.log(`Spawn error: ${error.message}`);
      reject(error);
    });
  });
}

testRipgrep().then(() => {
  console.log('✅ Ripgrep test completed successfully');
}).catch(error => {
  console.log(`❌ Ripgrep test failed: ${error.message}`);
});