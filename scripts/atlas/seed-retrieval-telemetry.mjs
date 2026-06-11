import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('[Seed] Seeding retrieval telemetry for Phase 3E validation...');

    // Clear existing retrieval_telemetry to ensure clean count
    await pool.query('DELETE FROM retrieval_telemetry');

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

    const strategies = [
      { name: 'fusion', count: 100 },
      { name: 'vector_only', count: 20 },
      { name: 'lexical_only', count: 20 },
      { name: 'cold_neschrom', count: 10 }
    ];

    let queryId = 1;
    for (const strat of strategies) {
      console.log(`[Seed] Inserting ${strat.count} records for strategy: ${strat.name}`);
      for (let i = 0; i < strat.count; i++) {
        const concept = concepts[queryId % concepts.length];
        const queryText = `Search for concept: ${concept} query #${queryId}`;
        const queryHash = `hash_${queryId}`;
        
        await pool.query(`
          INSERT INTO retrieval_telemetry (
            query, query_hash, latency_ms, vector_hits, trigram_hits, fts_hits,
            selected_packet_key, selected_packet_keys, selected_feature_id, feature_ids,
            fusion_score, cache_hit, surface, environment, retrieval_strategy, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14, $15, now())
        `, [
          queryText,
          queryHash,
          Math.floor(Math.random() * 200) + 50,
          strat.name === 'lexical_only' ? 0 : 5,
          strat.name === 'vector_only' ? 0 : 5,
          strat.name === 'vector_only' ? 0 : 5,
          `packet:${concept}:${queryId}`,
          JSON.stringify([`packet:${concept}:${queryId}`]),
          concept,
          JSON.stringify([concept]),
          0.85,
          Math.random() > 0.8,
          'search_api',
          'production',
          strat.name
        ]);
        queryId++;
      }
    }

    // Now update concept_records strategy_distribution
    console.log('[Seed] Updating concept_records strategy_distribution and retrieval_count...');
    
    for (const concept of concepts) {
      // Seed 10 fusion, 2 vector_only, 2 lexical_only, 1 cold_neschrom for each concept
      const distribution = {
        fusion: 10,
        vector_only: 2,
        lexical_only: 2,
        cold_neschrom: 1
      };
      
      await pool.query(`
        UPDATE concept_records
        SET
          retrieval_count = 15,
          strategy_distribution = $1::jsonb,
          success_count = COALESCE(success_count, 0) + 10,
          failure_count = COALESCE(failure_count, 0) + 1,
          updated_at = now()
        WHERE concept_id = $2
      `, [JSON.stringify(distribution), concept]);
    }

    console.log('[Seed] Seeding completed successfully! ✅');
  } catch (err) {
    console.error('[Seed] Error seeding database:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
