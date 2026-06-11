import { parseLargeJsonToMsgpack } from '../../crates/atlas_packet_parser/index.js';
import path from 'path';
import fs from 'fs';

async function main() {
  const filePath = path.resolve('docs/reports/neschrom97-card-registry.json');
  const outputDir = path.resolve('memory/packets');
  const chunkSize = 10000;

  console.log(`[Test] Running Rust parser on: ${filePath}`);
  console.log(`[Test] Output chunks directory: ${outputDir}`);

  try {
    const start = performance.now();
    const manifestJson = parseLargeJsonToMsgpack(filePath, outputDir, chunkSize);
    const duration = performance.now() - start;

    console.log(`[Test] Rust parser finished in ${duration.toFixed(2)}ms`);
    console.log('[Test] Returned Manifest:');
    console.log(manifestJson);

    // Verify chunks exist
    const files = fs.readdirSync(outputDir);
    console.log(`[Test] Chunks in output directory:`, files.filter(f => f.endsWith('.msgpack')));
  } catch (err) {
    console.error('[Test] Error running Rust parser:', err);
  }
}

main();
