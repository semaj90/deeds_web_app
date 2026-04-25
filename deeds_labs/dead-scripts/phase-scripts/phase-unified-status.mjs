import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import Redis from 'ioredis';

// ANSI Colors
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m"
};

console.log(`${C.bold}${C.cyan}╔════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}${C.cyan}║   GRAND UNIFIED SYSTEM CHECK (PHASES 66-79)    ║${C.reset}`);
console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════╝${C.reset}\n`);

async function check() {
  let allPass = true;

  // 1. Environment & Languages
  console.log(`${C.bold}1. 🛠️  Environment Stack${C.reset}`);

  // Node
  const nodeVer = process.version;
  console.log(`   - Node.js: ${C.green}${nodeVer}${C.reset}`);

  // Go (Check binary)
  try {
    const goCheck = spawnSync('go', ['version'], { encoding: 'utf8' });
    if (goCheck.status === 0) {
      console.log(`   - Go-Lang: ${C.green}${goCheck.stdout.trim()}${C.reset}`);
    } else {
      console.log(`   - Go-Lang: ${C.yellow}Not found in PATH (ignoring if not strictly needed now)${C.reset}`);
    }
  } catch (e) {
    console.log(`   - Go-Lang: ${C.yellow}Check failed${C.reset}`);
  }

  // 2. Database & Cache (Drizzle/Redis)
  console.log(`\n${C.bold}2. 💾 Data Persistence${C.reset}`);

  // Postgres via Drizzle (Simulating connection via postgres driver)
  try {
    const sql = postgres(process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db', { connect_timeout: 3 });
    const [{ version }] = await sql`SELECT version()`;
    console.log(`   - PostgreSQL: ${C.green}Connected (${version.split(' ')[0]})${C.reset}`);
    await sql.end();
  } catch (e) {
    console.log(`   - PostgreSQL: ${C.red}FAILED - ${e.message}${C.reset}`);
    allPass = false;
  }

  // Redis
  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null // Stop retrying immediately
    });

    // Silence global error handlers for this instance
    redis.on('error', (err) => {
      // We handle the error in the ping() catch block
    });

    await redis.ping();
    console.log(`   - Redis:      ${C.green}Connected (Cache Ready)${C.reset}`);
    await redis.quit();
  } catch (e) {
    console.log(`   - Redis:      ${C.red}FAILED - Is Docker running? (localhost:6379)${C.reset}`);
    // allPass = false; // Redis is optional for basic operations
  }

  // 3. Agentic Pipeline (Phase 79)
  console.log(`\n${C.bold}3. 🤖 Agentic Pipeline (Phase 79)${C.reset}`);

  const filesToCheck = [
    'scripts/phase79-cognitive-engine.mjs',
    'scripts/phase79-cognitive-ultimate.mts',
    'scripts/phase79-safety-gate.mts',
    'PHASE79_STRATEGY_GUIDE_ENHANCED.md',
    'llms.txt',
    'src/routes/odin/+page.svelte' // Svelte 5 UI
  ];

  filesToCheck.forEach(f => {
    if (fs.existsSync(f)) {
      console.log(`   - File: ${f.padEnd(40)} ${C.green}FOUND${C.reset}`);
    } else {
      console.log(`   - File: ${f.padEnd(40)} ${C.red}MISSING${C.reset}`);
      allPass = false;
    }
  });

  // 4. Svelte 5 Compliance Check
  console.log(`\n${C.bold}4. ⚡ Svelte 5 Compliance${C.reset}`);
  try {
    const content = fs.readFileSync('src/routes/odin/+page.svelte', 'utf8');
    if (content.includes('$state') && content.includes('$props')) {
      console.log(`   - Odin Dashboard: ${C.green}Verified Svelte 5 Runes ($state, $props)${C.reset}`);
    } else {
      console.log(`   - Odin Dashboard: ${C.red}Failed Syntax Check${C.reset}`);
      allPass = false;
    }
  } catch (e) {
    console.log(`   - Odin Dashboard: ${C.red}Read Failed${C.reset}`);
  }

  console.log(`\n${C.bold}--------------------------------------------------${C.reset}`);
  if (allPass) {
    console.log(`${C.green}✅ SYSTEM STATUS: OPERATIONAL via Phase 79 Agentic Engine${C.reset}`);
  } else {
    console.log(`${C.red}❌ SYSTEM STATUS: ISSUES DETECTED (See above)${C.reset}`);
  }
}

check();
