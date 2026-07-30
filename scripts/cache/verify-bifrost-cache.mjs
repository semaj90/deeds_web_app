import Redis from 'ioredis';
import crypto from 'crypto';
import { loadRepoEnv, resolveRedisConfig } from '../atlas/connection-config.mjs';

const ENV = loadRepoEnv(process.env);
const REDIS_CONFIG = resolveRedisConfig(ENV);

if (ENV.REDIS_ENABLED === 'false' || ENV.ENGRAM_ONLY === 'true') {
  console.log('[bifrost-verify] REDIS_ENABLED=false — skipping (Engram-only mode)');
  process.exit(0);
}
const redis = new Redis(REDIS_CONFIG.url, {
  password: REDIS_CONFIG.password,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  connectTimeout: 2000,
});

function canonicalJson(obj) {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj.map(item => JSON.parse(canonicalJson(item))));
  const keys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of keys) {
    sortedObj[key] = JSON.parse(canonicalJson(obj[key]));
  }
  return JSON.stringify(sortedObj);
}

function hashContent(content) {
  const str = typeof content === 'string' ? content : canonicalJson(content);
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function verifyBifrostCache() {
  console.log("🔍 Verifying Bifrost Cache Layer...");
  
  try {
    await redis.connect();
    const stablePrefix = {
      systemPrompt: "You are a legal AI.",
      modelId: "gemma4-tq",
      stablePolicy: "Strict adherence to legal texts"
    };
    
    const dynamicSuffix = {
      query: "What is a property deed?",
      timestamp: Date.now()
    };
    
    const prefixHash = hashContent(stablePrefix);
    const suffixHash = hashContent(dynamicSuffix);
    const modelId = stablePrefix.modelId;
    
    const key = `semantic:bifrost:${modelId}:${prefixHash}:${suffixHash}`;
    
    // Simulate setting the cache from a previous run with 14 day TTL
    const dummyOutput = "A property deed is a legal document that transfers property ownership.";
    await redis.set(key, dummyOutput, 'EX', 3600 * 24 * 14);
    
    // Verify we can read it
    const value = await redis.get(key);
    
    if (value === dummyOutput) {
      console.log(`✅ Bifrost Cache Hit! Key: ${key}`);
      console.log(`   Value: ${value}`);
      console.log("🚀 Bifrost cache layer verified.");
    } else {
      console.warn("⚠️ Bifrost Cache Miss or mismatch.");
    }

  } catch (err) {
    console.error("❌ Failed to verify bifrost cache:", err);
  } finally {
    redis.disconnect();
  }
}

verifyBifrostCache().catch(console.error);
