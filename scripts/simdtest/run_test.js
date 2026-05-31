// Simple test harness to exercise the native napi-rs crate if built.
// Usage: node run_test.js <path-to-json-file>

const path = require('path');
const fs = require('fs');

async function main() {
  const file = process.argv[2] || path.join(__dirname, '..', '..', '.tmp', 'parent_atlas_packets', '00a337a7c6c8fadc.json');
  if (!fs.existsSync(file)) {
    console.error('Test file not found:', file);
    process.exit(1);
  }
  const input = fs.readFileSync(file, 'utf8');

  try {
    // try to load the built native addon in common output paths
    const candidates = [
      path.join(__dirname, '..', '..', 'simd-bridge', 'rust-simdjson', 'target', 'release', 'simd_bridge_rs.node'),
      path.join(__dirname, '..', '..', 'simd-bridge', 'rust-simdjson', 'target', 'release', 'simd_bridge_rs.dll'),
      path.join(__dirname, '..', '..', 'simd-bridge', 'rust-simdjson', 'target', 'release', 'libsimd_bridge_rs.so'),
      path.join(__dirname, '..', '..', 'simd-bridge', 'rust-simdjson', 'target', 'release', 'simd_bridge_rs.dylib')
    ];
    let native = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          native = require(c);
          console.log('Loaded native addon from', c);
          break;
        } catch (e) {
          // ignore
        }
      }
    }

    if (!native) {
      console.warn('Native addon not found; falling back to pure-Node JSON.parse for test. Build the crate first.');
      const parsed = JSON.parse(input);
      console.log('Top-level type:', Array.isArray(parsed) ? 'array' : typeof parsed);
      if (parsed && typeof parsed === 'object') console.log('Keys:', Object.keys(parsed).slice(0,10));
      process.exit(0);
    }

    // If native has parse_fast
    if (typeof native.parse_fast === 'function') {
      const out = native.parse_fast(input);
      console.log('Native parse_fast output length:', out.length);
      try {
        const parsed = JSON.parse(out);
        console.log('Parsed OK; top keys:', Object.keys(parsed).slice(0,10));
      } catch (e) {
        console.error('Native output not valid JSON:', e.message);
      }
    } else if (typeof native.parse_fast_count === 'function') {
      const count = native.parse_fast_count(input);
      console.log('Native parse_fast_count:', count);
    } else {
      console.error('Native addon loaded but expected symbols not found. Exported keys:', Object.keys(native));
    }

  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

main();
