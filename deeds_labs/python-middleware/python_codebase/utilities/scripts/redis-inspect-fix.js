// scripts/redis-inspect-fix.js
// Usage: node scripts/redis-inspect-fix.js --pattern "prefix:*" [--apply]
// Default: --dry-run (no writes)

import process from 'process';
import { createClient } from 'redis';

const args = process.argv.slice(2);
const pattern = (() => {
  const p = args.find(a => a.startsWith('--pattern=') || a === '--pattern') ;
  if (!p) return '*';
  const idx = args.indexOf('--pattern');
  if (idx !== -1) return args[idx+1];
  const kv = args.find(a => a.startsWith('--pattern='));
  return kv ? kv.split('=')[1] : '*';
})();
const apply = args.includes('--apply');
const dry = !apply;

async function tryParse(value) {
  try {
    return { ok: true, obj: JSON.parse(value) };
  } catch (e1) {
    // Heuristic 1: value might be single-quoted JSON
    try {
      const v2 = value.replace(/(^'|'$)/g, '').replace(/'/g, '"');
      return { ok: true, obj: JSON.parse(v2), repaired: 'single-quote->double-quote' };
    } catch (e2) {}
    // Heuristic 2: value might be double-encoded: JSON.stringify(JSON.stringify(obj))
    try {
      const un = JSON.parse(value);
      if (typeof un === 'string') {
        const second = JSON.parse(un);
        return { ok: true, obj: second, repaired: 'double-encoded' };
      }
    } catch (e3) {}
    // Heuristic 3: unescape common escape patterns
    try {
      const unesc = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return { ok: true, obj: JSON.parse(unesc), repaired: 'unescape-escapes' };
    } catch (e4) {}
    return { ok: false, error: e1?.message || 'parse failed' };
  }
}

async function main() {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:4005'
  });
  client.on('error', err => console.error('Redis client error', err));
  await client.connect();

  console.log({ pattern, apply, dryRun: dry });

  let cursor = 0;
  const summary = { inspected: 0, valid: 0, repaired: 0, failed: 0, sample: [] };

  do {
    const reply = await client.scan(cursor.toString(), {
      MATCH: pattern,
      COUNT: '100'
    });
    
    cursor = parseInt(reply.cursor) || 0;
    const keys = reply.keys;

    for (const key of keys) {
      summary.inspected++;
      
      try {
        const value = await client.get(key);
        if (!value) continue;

        const parseResult = await tryParse(value);
        
        if (parseResult.ok) {
          if (parseResult.repaired) {
            summary.repaired++;
            console.log(`🔧 REPAIRED [${parseResult.repaired}] ${key}: ${value.slice(0,50)}...`);
            
            if (apply) {
              const fixedValue = JSON.stringify(parseResult.obj);
              await client.set(key, fixedValue);
              console.log(`   ✅ Applied fix to ${key}`);
            } else {
              console.log(`   📋 Would fix: ${JSON.stringify(parseResult.obj).slice(0,50)}...`);
            }
          } else {
            summary.valid++;
            if (summary.sample.length < 3) {
              summary.sample.push({ key, value: value.slice(0, 30) });
            }
          }
        } else {
          summary.failed++;
          console.log(`❌ FAILED ${key}: ${parseResult.error} (${value.slice(0,30)}...)`);
        }
        
        // Rate limit to be gentle on Redis
        if (summary.inspected % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
      } catch (err) {
        console.error(`Error processing key ${key}:`, err.message);
        summary.failed++;
      }
    }
    
  } while (cursor !== 0);

  console.log('\n=== REDIS INSPECTION SUMMARY ===');
  console.log(`Pattern: ${pattern}`);
  console.log(`Mode: ${dry ? 'DRY RUN' : 'APPLY FIXES'}`);
  console.log(`Inspected: ${summary.inspected} keys`);
  console.log(`Valid JSON: ${summary.valid}`);
  console.log(`Repaired: ${summary.repaired}`);
  console.log(`Failed: ${summary.failed}`);
  
  if (summary.sample.length > 0) {
    console.log('\nSample valid entries:');
    summary.sample.forEach(s => console.log(`  ${s.key}: ${s.value}...`));
  }
  
  if (summary.repaired > 0 && dry) {
    console.log(`\n🔧 To apply fixes, run with --apply flag`);
  }
  
  await client.disconnect();
  
  // Exit code indicates if any issues were found
  process.exit(summary.repaired > 0 || summary.failed > 0 ? 1 : 0);
}

main().catch(console.error);