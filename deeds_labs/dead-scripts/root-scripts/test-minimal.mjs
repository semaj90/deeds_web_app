#!/usr/bin/env node

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { glob } = require('glob');

console.log('🚀 Starting minimal Redis Error Analyzer...');

try {
  const files = glob.sync('**/*.{js,ts}', {
    cwd: process.cwd(),
    absolute: true,
    ignore: ['node_modules/**']
  });
  console.log('Found', files.length, 'files');
  console.log('Sample:', files.slice(0, 3));
} catch (error) {
  console.error('Error:', error.message);
}