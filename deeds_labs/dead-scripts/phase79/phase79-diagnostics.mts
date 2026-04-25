#!/usr/bin/env tsx
/**
 * Phase 79 Diagnostics - Debug agent issues
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createClient } from 'redis';

const CONFIG = {
  QDRANT_URL: 'http://localhost:6333',
  QDRANT_COLLECTION: 'phase79_knowledge_base',
  REDIS_URL: 'redis://localhost:6379',
};

async function main() {
  console.log('🔍 Phase 79 Diagnostics\n');

  // 1. Test Qdrant
  console.log('1️⃣ Testing Qdrant connection...');
  try {
    const qdrant = new QdrantClient({ url: CONFIG.QDRANT_URL });
    const collections = await qdrant.getCollections();
    console.log(`   ✅ Found ${collections.collections.length} collections:`);
    collections.collections.forEach(c => console.log(`      - ${c.name}`));

    // Check our specific collection
    console.log(`\n   📊 Checking ${CONFIG.QDRANT_COLLECTION}...`);
    try {
      const info = await qdrant.getCollection(CONFIG.QDRANT_COLLECTION);
      console.log(`   ✅ Collection exists: ${info.points_count} points`);
      console.log(`      Vector size: ${info.config?.params?.vectors}`);
    } catch (err: any) {
      console.log(`   ❌ Collection check failed: ${err.message}`);
      if (err.message?.includes('404')) {
        console.log(`      ℹ️  Collection needs to be created or name mismatch`);
      }
    }
  } catch (err: any) {
    console.log(`   ❌ Qdrant connection failed: ${err.message}`);
  }

  // 2. Test Redis
  console.log('\n2️⃣ Testing Redis connection...');
  try {
    const redis = createClient({ url: CONFIG.REDIS_URL });
    await redis.connect();
    await redis.ping();
    console.log('   ✅ Redis connected');

    // Check for cached embeddings
    const keys = await redis.keys('embedding:*');
    console.log(`   📦 Found ${keys.length} cached embeddings`);

    await redis.quit();
  } catch (err: any) {
    console.log(`   ❌ Redis connection failed: ${err.message}`);
  }

  // 3. Check database
  console.log('\n3️⃣ Checking knowledge base...');
  try {
    const { default: postgres } = await import('postgres');
    const sql = postgres('postgresql://legal_admin:legal_admin_pass@localhost:5432/legal_ai_db');

    const counts = await sql`
      SELECT chunk_type, COUNT(*) as count
      FROM knowledge_base
      GROUP BY chunk_type
      ORDER BY count DESC
    `;
    console.log('   ✅ Knowledge base content:');
    counts.forEach((row: any) => console.log(`      ${row.chunk_type}: ${row.count}`));

    // Check for embeddings
    const withEmbeddings = await sql`
      SELECT COUNT(*) as count
      FROM knowledge_base
      WHERE embedding IS NOT NULL
    `;
    console.log(`   📊 Items with embeddings: ${withEmbeddings[0].count}`);

    await sql.end();
  } catch (err: any) {
    console.log(`   ❌ Database check failed: ${err.message}`);
  }

  console.log('\n✅ Diagnostics complete\n');
}

main().catch(console.error);
