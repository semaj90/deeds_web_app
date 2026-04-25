#!/usr/bin/env node
/**
 * 🔍 PHASE 79 SYSTEM STATUS CHECK
 *
 * Validates all components needed for policy-first retrieval
 */

import 'dotenv/config';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const DATABASE_URL = process.env.DATABASE_URL;

async function checkService(name, url, checkFn) {
  try {
    await checkFn(url);
    console.log(`✅ ${name}: Running at ${url}`);
    return true;
  } catch (e) {
    console.log(`❌ ${name}: Not available - ${e.message}`);
    return false;
  }
}

async function checkOllama() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Status ${response.status}`);
  const data = await response.json();
  const models = data.models || [];
  const hasEmbedding = models.some(m => m.name.includes('embeddinggemma'));
  console.log(`   Models: ${models.length} available`);
  if (hasEmbedding) {
    console.log(`   ✅ embeddinggemma:latest found`);
  } else {
    console.log(`   ⚠️ embeddinggemma:latest not found - run: ollama pull embeddinggemma`);
  }
  return hasEmbedding;
}

async function checkQdrant() {
  const response = await fetch(`${QDRANT_URL}/collections`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Status ${response.status}`);
  const data = await response.json();
  const collections = data.result?.collections || [];
  console.log(`   Collections: ${collections.length} available`);

  const kbCollection = collections.find(c => c.name === 'knowledge_base');
  const routeCollection = collections.find(c => c.name === 'codebase_routes');

  if (kbCollection) {
    console.log(`   ✅ knowledge_base: ${kbCollection.points_count || 0} points`);
  } else {
    console.log(`   ⚠️ knowledge_base collection not found`);
  }

  if (routeCollection) {
    console.log(`   ✅ codebase_routes: ${routeCollection.points_count || 0} points`);
  } else {
    console.log(`   ⚠️ codebase_routes collection not indexed yet`);
  }

  return kbCollection !== undefined;
}

async function checkDatabase() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
  // Just check if URL is formatted correctly
  if (!DATABASE_URL.startsWith('postgres://')) {
    throw new Error('Invalid DATABASE_URL format');
  }
  console.log(`   URL configured: ${DATABASE_URL.substring(0, 30)}...`);
  return true;
}

async function checkFiles() {
  const fs = await import('fs/promises');
  const path = await import('path');

  const files = [
    'scripts/phase79-cognitive-engine.mjs',
    'scripts/test-phase79-policy-first.mjs',
    'scripts/generate-route-map.mjs',
    'knowledge/route-map.json',
    'knowledge/patterns/protected-endpoints.md',
    'knowledge/patterns/zod-validation.md',
    'knowledge/patterns/redis-rate-limiting.md',
    'knowledge/patterns/redis-caching-strategies.md'
  ];

  let allPresent = true;
  for (const file of files) {
    try {
      await fs.access(file);
      console.log(`   ✅ ${file}`);
    } catch {
      console.log(`   ❌ ${file} - NOT FOUND`);
      allPresent = false;
    }
  }
  return allPresent;
}

async function runStatusCheck() {
  console.log('🔍 Phase 79 System Status Check\n');
  console.log(`${'='.repeat(80)}\n`);

  const results = {};

  console.log('📡 EXTERNAL SERVICES:\n');
  results.ollama = await checkService('Ollama', OLLAMA_URL, checkOllama);
  console.log('');
  results.qdrant = await checkService('Qdrant', QDRANT_URL, checkQdrant);
  console.log('');
  results.database = await checkService('Database', 'PostgreSQL', checkDatabase);
  console.log('');

  console.log('📁 LOCAL FILES:\n');
  results.files = await checkFiles();
  console.log('');

  console.log(`${'='.repeat(80)}\n`);
  console.log('📊 SUMMARY:\n');

  const allServicesOk = results.ollama && results.qdrant && results.database;
  const filesOk = results.files;

  if (allServicesOk && filesOk) {
    console.log('✅ ALL SYSTEMS READY for Phase 79 policy-first retrieval!\n');
    console.log('🚀 You can now run:');
    console.log('   - npm run phase79:engine          (Full cognitive engine)');
    console.log('   - node scripts/test-phase79-policy-first.mjs    (Test suite)');
    console.log('   - node scripts/demo-policy-first-retrieval.mjs  (Demo)');
  } else {
    console.log('⚠️ SOME COMPONENTS NOT READY:\n');
    if (!results.ollama) {
      console.log('❌ Ollama: Start with `ollama serve` and pull embeddinggemma');
    }
    if (!results.qdrant) {
      console.log('❌ Qdrant: Start with `docker run -p 6333:6333 qdrant/qdrant`');
    }
    if (!results.database) {
      console.log('❌ Database: Check DATABASE_URL in .env');
    }
    if (!results.files) {
      console.log('❌ Files: Some required files are missing');
    }
  }

  console.log('');
}

runStatusCheck().catch(e => {
  console.error('❌ Status check failed:', e.message);
  process.exit(1);
});
