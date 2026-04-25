#!/usr/bin/env node

import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

async function test() {
  console.log('Testing glob import...');

  try {
    const files = await glob('**/*.{js,ts}', {
      cwd: process.cwd(),
      absolute: true,
      ignore: ['node_modules/**']
    });

    console.log(`Found ${files.length} files`);
    console.log('Sample:', files.slice(0, 3));

    // Test creating analysis directory
    const analysisDir = path.join(process.cwd(), 'analysis');
    await fs.mkdir(analysisDir, { recursive: true });
    console.log('Analysis directory ready');

  } catch (error) {
    console.error('Error:', error);
  }
}

test();