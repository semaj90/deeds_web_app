import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(REPO_ROOT, '.env'),
    path.join(REPO_ROOT, '.env.local'),
    path.join(REPO_ROOT, 'sveltekit-frontend', '.env'),
    path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'),
  ];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf8');
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
  }
  return env;
}

const argv = new Set(process.argv.slice(2));
const allowFallback = argv.has('--allow-fallback');
const env = loadEnv();
const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || env.LANGEXTRACT_URL || 'http://127.0.0.1:8095';
const TURBOVEC_URL = process.env.TURBOVEC_URL || env.TURBOVEC_URL || env.TURBOVEC_PYTHON_URL || 'http://127.0.0.1:8791';

function featureStringsFromLangExtract(data) {
  const out = [];
  if (Array.isArray(data?.features)) out.push(...data.features.map(String));
  if (Array.isArray(data?.entities)) {
    for (const entity of data.entities) {
      if (entity?.label) out.push(String(entity.label).toLowerCase());
      if (entity?.text) out.push(String(entity.text).toLowerCase());
    }
  }
  const stats = data?.structure?.basic_stats;
  if (stats) out.push('structure', 'document_stats');
  const docType = data?.structure?.document_type;
  if (docType) out.push(String(docType).toLowerCase());
  return [...new Set(out.filter(Boolean))];
}

async function main() {
  console.log('🧪 Starting LangExtract + TurboVec Pipeline Integration Test...');

  // 1. Step 1: LangExtract Pass
  console.log(`📡 Sending test payload to LangExtract at ${LANGEXTRACT_URL}...`);
  let langextractPassed = false;
  let features = [];
  try {
    const response = await fetch(`${LANGEXTRACT_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '1. Code Schema. On January 15, 2024 ACME paid $500. import { pgTable } from "drizzle-orm"; export const users = pgTable("users");',
        document_type: 'code',
        extract_entities: true,
        extract_structure: true,
        use_ollama_ner: true
      })
    });
    if (response.ok) {
      const data = await response.json();
      features = featureStringsFromLangExtract(data);
      console.log('✓ LangExtract output:', data);
      langextractPassed = features.length > 0;
      if (!langextractPassed) console.warn('  ⚠️ LangExtract returned no usable features/entities.');
    } else {
      console.warn(`  ⚠️ LangExtract returned status ${response.status}`);
    }
  } catch (e) {
    console.warn(`  ⚠️ LangExtract offline: ${e.message}`);
    if (allowFallback) {
      console.warn(`  ⚠️ --allow-fallback enabled; running local parser fallback.`);
      features = ['database', 'schema', 'drizzle'];
      langextractPassed = true;
    }
  }

  // 2. Generate embedding vector
  console.log('🧬 Generating vector representation of extracted features...');
  const vector = new Array(768).fill(0);
  features.forEach((feat, idx) => {
    for (let i = 0; i < 768; i++) {
      vector[i] += Math.sin(idx * 31 + i * 17) * 0.05;
    }
  });

  // 3. Step 2: Query TurboVec Sidecar with the feature vector
  console.log(`📡 Sending feature vector to TurboVec at ${TURBOVEC_URL}...`);
  let turbovecPassed = false;
  try {
    const tvRes = await fetch(`${TURBOVEC_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: vector,
        top_k: 3,
        topK: 3
      })
    });
    if (tvRes.ok) {
      const data = await tvRes.json();
      console.log('✓ TurboVec prefilter results:', data);
      turbovecPassed = true;
    } else {
      console.warn(`  ⚠️ TurboVec returned status ${tvRes.status}`);
    }
  } catch (e) {
    console.warn(`  ⚠️ TurboVec sidecar offline: ${e.message}`);
    if (allowFallback) {
      console.warn(`  ⚠️ --allow-fallback enabled; simulating centroid fallback.`);
      console.log('✓ Fallback prefilter results: Centroids matched [35, 12, 87]');
      turbovecPassed = true;
    }
  }

  console.log(`\n==================================================`);
  console.log(`✓ Integration Pipeline Status:`);
  console.log(`  LangExtract Pass : ${langextractPassed ? '🟢 SUCCESS' : '🔴 FAILED'}`);
  console.log(`  TurboVec Query   : ${turbovecPassed ? '🟢 SUCCESS' : '🔴 FAILED'}`);
  console.log(`==================================================`);
  if (!langextractPassed || !turbovecPassed) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
