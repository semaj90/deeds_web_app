import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wasmPath = join(__dirname, '../build/vector-ops.wasm');

async function verify() {
  try {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer);
    
    console.log('✅ WASM module loaded successfully');
    console.log('📦 Exported functions:', Object.keys(wasmModule.instance.exports));
    
    // Test cosine similarity if available
    if (wasmModule.instance.exports.cosineSimilarity) {
      console.log('✅ Vector operations available');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
}

verify();
