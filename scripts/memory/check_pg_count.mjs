import { Pool } from 'pg';
(async function(){
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query("SELECT COUNT(*) AS cnt FROM agent_memory_observations WHERE source='claude-mem' AND created_at > NOW() - INTERVAL '1 hour'");
    console.log('recent_count', res.rows[0].cnt);
  } catch(e){ console.error('err', e.message || e); process.exit(1);} finally{ await pool.end(); }
})();
