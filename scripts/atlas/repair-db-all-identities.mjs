import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function repairAll() {
  console.log('--- REPAIRING ALL IDENTITY COLUMNS TO INTEGER ---');

  // List of tables and columns found as UUID/Text in check-db-types.mjs
  const targets = [
    { table: 'cases', column: 'assigned_attorney' },
    { table: 'criminals', column: 'created_by' },
    { table: 'document_chunks', column: 'created_by' }, // if exists
    { table: 'documents', column: 'created_by' },
    { table: 'evidence', column: 'created_by' },
    { table: 'evidence_audit_log', column: 'user_id' },
    { table: 'evidence_board_connections', column: 'created_by' },
    { table: 'report_audit_log', column: 'user_id' },
    { table: 'route_error_patches', column: 'created_by' },
    { table: 'synthesis_runs', column: 'user_id' },
    { table: 'timeline_events', column: 'created_by' },
    { table: 'user_interaction_history', column: 'user_id' },
    { table: 'user_research_tasks', column: 'user_id' },
    { table: 'workspace_notes', column: 'created_by' },
    { table: 'workspaces', column: 'created_by' },
    { table: 'yorha_cases', column: 'created_by' },
    { table: 'yorha_cases', column: 'assigned_to' },
    { table: 'yorha_chat_sessions', column: 'user_id' },
    { table: 'yorha_evidence_connections', column: 'created_by' },
    { table: 'yorha_evidence_nodes', column: 'created_by' },
    { table: 'agent_actions', column: 'user_id' }, // currently text
    { table: 'admin_ai_skills', column: 'created_by' },
    { table: 'panel_activity_log', column: 'user_id' },
    { table: 'error_suggestion_states', column: 'user_id' },
    { table: 'panel_activity_log', column: 'user_id' },
    { table: 'ai_interactions', column: 'user_id' },
    { table: 'legal_knowledge_base', column: 'verified_by' },
    { table: 'persons_of_interest', column: 'created_by' },
    { table: 'case_poi_relations', column: 'created_by' },
    { table: 'evidence_boards', column: 'created_by' },
    { table: 'evidence_board_items', column: 'created_by' },
    { table: 'evidence_board_connections', column: 'created_by' },
    { table: 'cases', column: 'user_id' },
    { table: 'cases', column: 'created_by' },
    { table: 'documents', column: 'user_id' },
    { table: 'evidence', column: 'user_id' },
    { table: 'ace_context_cache', column: 'user_id' },
    { table: 'ai_usage_log', column: 'user_id' },
    { table: 'analytics_events', column: 'user_id' },
    { table: 'api_audit_log', column: 'user_id' },
    { table: 'case_notes', column: 'created_by' },
    { table: 'case_statute_links', column: 'created_by' },
    { table: 'chunk_hit_log', column: 'user_id' },
    { table: 'citation_collections', column: 'user_id' },
    { table: 'codebase_audit_reports', column: 'created_by' },
    { table: 'diagnosis_events', column: 'user_id' },
    { table: 'email_verification_codes', column: 'user_id' },
    { table: 'rag_query_log', column: 'user_id' },
    { table: 'response_feedback', column: 'user_id' },
    { table: 'user_analytics_events', column: 'user_id' }
  ];

  for (const target of targets) {
    console.log(`Repairing ${target.table}.${target.column}...`);
    try {
      // Check if table exists first
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = ${target.table}
        )
      `;
      
      if (!tableExists[0].exists) {
        console.log(`  - Table ${target.table} does not exist, skipping.`);
        continue;
      }

      // Check if column exists
      const colRes = await sql`
        SELECT data_type FROM information_schema.columns 
        WHERE table_name = ${target.table} AND column_name = ${target.column}
      `;
      
      if (colRes.length === 0) {
        console.log(`  - Column ${target.column} does not exist in ${target.table}, skipping.`);
        continue;
      }

      if (colRes[0].data_type === 'integer') {
        console.log(`  - Column ${target.column} is already integer, skipping.`);
        continue;
      }

      // Execute repair
      await sql.unsafe(`ALTER TABLE ${target.table} ALTER COLUMN ${target.column} TYPE integer USING NULL`);
      console.log(`  - SUCCESS: ${target.table}.${target.column} converted to integer.`);
    } catch (err) {
      console.error(`  - FAILED to repair ${target.table}.${target.column}: ${err.message}`);
    }
  }

  console.log('--- REPAIR COMPLETE ---');
  await sql.end();
}

repairAll();
