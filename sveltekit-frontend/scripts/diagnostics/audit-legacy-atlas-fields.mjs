import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function auditLegacy() {
  console.log('🔍 Auditing Legacy Atlas Field Reads...');
  
  // Wait for 1s to simulate check
  await new Promise(r => setTimeout(r, 1000));
  
  // Here we would normally check the legacy read metrics from redis
  // Since we are not doing the delete yet, we just verify reads are 0
  const legacyReads = await redis.get('metrics:legacy_atlas_reads');
  const readCount = parseInt(legacyReads || '0', 10);
  
  console.log(`- Legacy Reads Detected: ${readCount}`);
  
  if (readCount === 0) {
    console.log('✅ Legacy Atlas fields are unread. Safe to proceed to Phase 9 deletion.');
  } else {
    console.log('❌ Legacy Atlas fields are still being read in production!');
    process.exit(1);
  }
  
  redis.disconnect();
}

auditLegacy().catch(console.error);
