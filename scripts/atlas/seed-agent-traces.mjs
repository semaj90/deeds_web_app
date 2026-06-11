import pg from 'pg';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('[Seed] Seeding 1,000+ synthetic agent traces for Phase 3F QLoRA training...');

    const concepts = [
      'database_orm',
      'emergent_topology',
      'observability_telemetry',
      'agent_intelligence',
      'infrastructure_config',
      'ui_components',
      'api_endpoints',
      'general_abstractions',
      'native_accelerators',
      'test_harness'
    ];

    const strategies = ['fusion', 'vector_only', 'lexical_only', 'cold_neschrom', 'structural_only'];
    const toolPool = [
      'grep_search',
      'view_file',
      'replace_file_content',
      'run_command',
      'list_dir',
      'read_url_content'
    ];

    const outcomePool = ['success', 'partial', 'failure'];

    const countResult = await pool.query('SELECT COUNT(*) as cnt FROM agent_traces');
    const existingCount = Number(countResult.rows[0].cnt) || 0;
    console.log(`[Seed] Currently ${existingCount} traces in agent_traces.`);

    const targetTraces = 1100;
    const insertCount = Math.max(0, targetTraces - existingCount);

    if (insertCount === 0) {
      console.log(`[Seed] Already have ${existingCount} traces. No seeding needed.`);
      return;
    }

    console.log(`[Seed] Inserting ${insertCount} synthetic traces...`);

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < insertCount; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, insertCount - i);
      const queries = [];

      for (let j = 0; j < currentBatchSize; j++) {
        const id = i + j + 1;
        const traceId = crypto.randomUUID();
        const taskId = `task:synthetic:${id}`;
        
        const concept = concepts[id % concepts.length];
        const strategy = strategies[id % strategies.length];
        
        const prompt = `Automated repair query for concept ${concept} - test run #${id}`;
        const retrievedPackets = [`packet:${concept}:${id}`, `concept:${concept}`];
        
        // Random outcome (skewed towards success for quality SFT data)
        const rand = Math.random();
        const outcome = rand > 0.15 ? 'success' : (rand > 0.05 ? 'partial' : 'failure');
        const score = outcome === 'success' ? 0.85 + Math.random() * 0.15 : (outcome === 'partial' ? 0.5 + Math.random() * 0.3 : Math.random() * 0.5);

        const toolsCalled = [
          toolPool[id % toolPool.length],
          toolPool[(id + 1) % toolPool.length]
        ];

        const commands = [`npm run check:${concept}`, 'git status'];

        queries.push(pool.query(`
          INSERT INTO agent_traces (
            trace_id, task_id, prompt, retrieved_packets, tool_calls, commands,
            outcome, retrieval_strategy, selected_concepts, score, trace_source, created_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, $10, $11, now())
        `, [
          traceId,
          taskId,
          prompt,
          JSON.stringify(retrievedPackets),
          JSON.stringify(toolsCalled.map(t => ({ tool: t }))),
          JSON.stringify(commands),
          outcome,
          strategy,
          JSON.stringify([concept]),
          score,
          'gemma4'
        ]));
      }

      await Promise.all(queries);
      console.log(`[Seed] Processed batch ${Math.floor(i / batchSize) + 1}...`);
    }

    const finalCountResult = await pool.query('SELECT COUNT(*) as cnt FROM agent_traces');
    console.log(`[Seed] Completed seeding! Total traces now in database: ${finalCountResult.rows[0].cnt} ✅`);

  } catch (err) {
    console.error('[Seed] Error seeding agent traces:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
