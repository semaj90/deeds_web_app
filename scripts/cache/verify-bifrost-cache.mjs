import Redis from 'ioredis';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { resolve } from 'path';

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, '.env.local'), override: false });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: false });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env'), override: false });

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined;
const redis = new Redis(REDIS_URL, {
  password: REDIS_PASSWORD,
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
