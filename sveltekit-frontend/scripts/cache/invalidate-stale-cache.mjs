import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Map digests to cache domains
const DIGEST_MAPPINGS = {
  'system:digest:graphify': ['dag', 'rag-kb'],
  'system:digest:documents_atlas': ['research', 'code'],
  'system:digest:model_id': ['llm', 'ace'],
  'system:digest:toon_schema': ['embedding', 'cartridge'],
  'system:digest:bifrost_policy': ['ace'],
  'system:digest:qdrant_collection': ['rag-case', 'embedding']
};

async function checkAndInvalidate() {
  console.log('🔄 Checking system digests for stale caches...');
  let invalidatedAny = false;

  for (const [digestKey, domains] of Object.entries(DIGEST_MAPPINGS)) {
    const currentDigest = await redis.get(digestKey);
    const lastDigestKey = `${digestKey}:last_verified`;
    const lastDigest = await redis.get(lastDigestKey);

    if (currentDigest !== lastDigest && currentDigest !== null) {
      console.log(`⚠️ Change detected in ${digestKey} (${lastDigest} -> ${currentDigest})`);
      for (const domain of domains) {
        console.log(`   🧹 Invalidating domain: ${domain}`);
        // Instead of calling cache-invalidation.ts directly (which might require Drizzle/RabbitMQ setup),
        // we use Redis flush directly based on cache-config.ts policy.
        let prefix = domain;
        if (domain === 'llm') prefix = 'llm:exact';
        if (domain === 'ace') prefix = 'ace:prompt';
        if (domain === 'rag-kb') prefix = 'rag:kb';
        if (domain === 'rag-case') prefix = 'rag:case';
        if (domain === 'embedding') prefix = 'embed';
        if (domain === 'code') prefix = 'code:llm_output:path';
        
        let cursor = '0';
        let deleted = 0;
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 200);
          cursor = next;
          if (keys.length > 0) {
            deleted += await redis.del(...keys);
          }
        } while (cursor !== '0');
        
        console.log(`   ✅ Flushed ${deleted} keys for ${domain}`);
      }
      
      // Update last verified digest
      await redis.set(lastDigestKey, currentDigest);
      invalidatedAny = true;
    }
  }

  if (!invalidatedAny) {
    console.log('✅ All caches are fresh. No invalidation needed.');
  }
  
  redis.disconnect();
}

checkAndInvalidate().catch(err => {
  console.error(err);
  redis.disconnect();
  process.exit(1);
});
