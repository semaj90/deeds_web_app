import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const addonPath = path.resolve(__dirname, '../../..', 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');

async function main() {
  try {
    const addon = require(addonPath);
    console.log('Loaded addon from', addonPath);

    const text = process.argv.slice(2).join(' ') || 'Test: feature extraction for sample evidence text.';

    if (typeof addon.computeCaseEmbedding !== 'function') {
      console.error('Addon does not expose computeCaseEmbedding. Available keys:', Object.keys(addon));
      process.exit(2);
    }

    const vec = addon.computeCaseEmbedding(text);

    let arr;
    if (Array.isArray(vec)) arr = vec;
    else if (vec instanceof Float32Array || vec instanceof Float64Array) arr = Array.from(vec);
    else if (Buffer.isBuffer(vec)) arr = Array.from(new Float32Array(vec.buffer));
    else arr = Array.from(vec || []);

    const out = {
      inputSample: text.slice(0, 200),
      dim: arr.length,
      head: arr.slice(0, 16),
    };

    await fs.mkdir(path.resolve(__dirname, '../../../.tmp'), { recursive: true });
    const outPath = path.resolve(__dirname, '../../../.tmp/prototype_embedding.json');
    await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote prototype embedding to', outPath);
  } catch (err) {
    console.error('Prototype extraction failed:', err);
    process.exit(1);
  }
}

main();
