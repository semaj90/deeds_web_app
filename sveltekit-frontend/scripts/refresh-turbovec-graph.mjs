import { spawn } from 'node:child_process';
import path from 'node:path';

async function refreshGraph() {
  console.log('🚀 Refreshing TurboVec Graph (Python Extraction)...');

  const pythonPath = 'C:/Users/james/AppData/Local/Programs/Python/Python311/python.exe';
  const scriptPath = 'scripts/extract-enhanced-graph.mjs';
  const binPath = 'npx';

  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, ['tsx', scriptPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
      shell: true
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Python extraction complete.');
        resolve();
      } else {
        console.error(`❌ Python extraction failed with code ${code}`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

refreshGraph();
