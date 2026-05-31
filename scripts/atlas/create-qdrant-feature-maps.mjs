import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';

async function main() {
  console.log(`📡 Checking Qdrant collections at ${QDRANT_URL}...`);
  try {
    const checkRes = await fetch(`${QDRANT_URL}/collections`);
    if (!checkRes.ok) {
      console.error(`  ⚠️ Qdrant returned status ${checkRes.status}`);
      return;
    }
    const data = await checkRes.json();
    const collections = data.result?.collections || [];
    const names = collections.map(c => c.name);
    console.log('✓ Found collections:', names);

    if (!names.includes('feature_maps')) {
      console.log('⚙️ Creating "feature_maps" collection in Qdrant (768-dim, Cosine)...');
      const createRes = await fetch(`${QDRANT_URL}/collections/feature_maps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: 768,
            distance: 'Cosine'
          }
        })
      });
      if (createRes.ok) {
        console.log('✓ Collection "feature_maps" created successfully!');
      } else {
        console.error('  ⚠️ Failed to create collection:', await createRes.text());
      }
    } else {
      console.log('✓ Collection "feature_maps" already exists.');
    }
  } catch (e) {
    console.error('  ⚠️ Failed to communicate with Qdrant:', e.message);
  }
}

main();
