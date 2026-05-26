import { Redis } from 'ioredis';
import fs from 'fs';
import path from 'path';

// Assuming standard dev port for loopback
const redis = new Redis('redis://127.0.0.1:6379');

async function auditLegacyFields() {
  console.log("🔍 Auditing Legacy Field Reads from Redis...");

  try {
    const keys = await redis.keys('legacy:atlas:field:*:reads');
    const report = {};

    for (const key of keys) {
      const match = key.match(/legacy:atlas:field:(.+):reads/);
      if (match && match[1]) {
        const fieldName = match[1];
        const count = await redis.get(key);
        report[`${fieldName}_reads`] = parseInt(count || '0', 10);
      }
    }

    // Default missing fields to 0 for the report
    const expectedFields = ['summary', 'dominantTags', 'auditScore', 'somBmuRow', 'somBmuCol'];
    for (const field of expectedFields) {
      if (report[`${field}_reads`] === undefined) {
        report[`${field}_reads`] = 0;
      }
    }

    const outPath = path.join(process.cwd(), 'docs', 'reports', 'legacy-field-usage.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`✅ Wrote legacy field usage report to ${outPath}`);
    console.log(report);
    
    // Determine if we are ready for Phase 9
    const totalReads = Object.values(report).reduce((a, b) => a + b, 0);
    if (totalReads === 0) {
      console.log("\n🚀 ALL CLEAR! No legacy reads detected. System is closer to Phase 9 deletion readiness.");
    } else {
      console.log(`\n⚠️ WARNING: ${totalReads} legacy reads detected. System is NOT ready for Phase 9 deletion.`);
    }

  } catch (err) {
    console.error("❌ Failed to audit legacy fields:", err);
  } finally {
    redis.disconnect();
  }
}

auditLegacyFields().catch(console.error);
