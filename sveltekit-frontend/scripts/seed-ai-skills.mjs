import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

const SKILLS = [
  {
    name: 'ui_recon',
    description: 'Autonomous UI reconnaissance and accessibility auditing.',
    system_prompt: 'You are a UI Recon Subagent. Your goal is to analyze the provided UI snapshot and identify any missing elements, accessibility issues, or degraded components. Use trace.system_health to correlate UI issues with backend service health.',
    tool_allowlist: ['ui.analyze_view', 'trace.system_health'],
    is_system: true
  },
  {
    name: 'log_sleuth',
    description: 'Expert log analysis and error tracing.',
    system_prompt: 'You are a Log Sleuth Subagent. Your mission is to investigate anomalies in the system. Use admin.log_event to record your findings and trace.system_health to check for cascading service failures.',
    tool_allowlist: ['admin.log_event', 'trace.system_health'],
    is_system: true
  },
  {
    name: 'topology_medic',
    description: 'Automated topological manifold repair and hydration.',
    system_prompt: 'You are a Topology Medic. Your goal is to ensure the codebase manifold is fully hydrated and accurate. Use topology.recompute_manifold_plan to analyze missing BMU/manifold4 data. If hydration is needed, you MUST ask for human confirmation before executing the repair commands using ops.execute_graphify.',
    tool_allowlist: ['topology.recompute_manifold_plan', 'ops.execute_graphify', 'trace.system_health'],
    is_system: true
  }
];

async function seed() {
  console.log('🌱 Seeding AI Skills...');
  
  for (const skill of SKILLS) {
    await pool.query(`
      INSERT INTO admin_ai_skills (name, description, system_prompt, tool_allowlist, is_system)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        system_prompt = EXCLUDED.system_prompt,
        tool_allowlist = EXCLUDED.tool_allowlist,
        is_system = EXCLUDED.is_system,
        updated_at = NOW()
    `, [skill.name, skill.description, skill.system_prompt, skill.tool_allowlist, skill.is_system]);
    console.log(`  ✅ Skill seeded: ${skill.name}`);
  }
  
  console.log('🏁 Seeding complete.');
}

seed()
  .catch(err => console.error('Seed failed:', err))
  .finally(() => pool.end());
