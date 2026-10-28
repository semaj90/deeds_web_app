// Drizzle alignment probe (rehearsal only). Runs the same shapes the app uses against a DISPOSABLE database and reports pass/fail.
// SAFETY: refuses any connection that is not 127.0.0.1:55433 so it can never touch the live database (5434) by accident.
// Usage: PROBE_DATABASE_URL=postgres://postgres:<pw>@127.0.0.1:55433/postgres npx tsx scripts/atlas/drizzle-alignment-probe-v1.mts
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { taskSemanticPackets } from '../../src/lib/server/db/schema/tasks.js';
import { routeRuntimePackets } from '../../src/lib/server/db/schema/route_runtime_packets.js';

const url = process.env.PROBE_DATABASE_URL ?? '';
const parsed = new URL(url || 'postgres://invalid');
if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55433') {
  console.error('REFUSED: PROBE_DATABASE_URL must point at 127.0.0.1:55433 (the disposable rehearsal database)');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);
const report: Record<string, string> = {};
const attempt = async (name: string, fn: () => Promise<unknown>) => {
  try { await fn(); report[name] = 'PASS'; } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message;
    report[name] = 'FAIL: ' + String(cause).split('\n')[0].slice(0, 200);
  }
};

await attempt('task_semantic_packets insert ... returning() (as POST /api/tasks/packets)', async () => {
  await db.insert(taskSemanticPackets).values({
    point_kind: 'task_summary', feature_id: 'probe.feature', source_ref: 'probe://alignment', file_path: 'probe://alignment',
    summary_llm: 'alignment probe', next_action: 'none', confidence: '0.5', status: 'open', agent_pickup_ready: false,
  }).returning();
});
await attempt('task_semantic_packets select all declared columns', async () => { await db.select().from(taskSemanticPackets).limit(1); });
await attempt('route_runtime_packets select all declared columns', async () => { await db.select().from(routeRuntimePackets).limit(1); });
console.log(JSON.stringify(report, null, 1));
await pool.end();
