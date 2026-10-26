import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });

const ddl = `
CREATE TABLE IF NOT EXISTS atlas_kanban_reconciliation_v1 (
    task_uuid           UUID DEFAULT uuidv7() PRIMARY KEY,
    external_task_id    TEXT NOT NULL,
    board_population    TEXT NOT NULL CHECK (board_population IN (
                            'openspec_workboard',
                            'live_pg_kanban',
                            'repo_global_backlog',
                            'daily_dspy_gepa_rec'
                        )),
    packet_key          TEXT,
    source_ref          TEXT NOT NULL,
    source_revision     TEXT,
    domain_id           SMALLINT,
    status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                            'PENDING', 'IN_PROGRESS', 'GATE_BLOCKED', 'DONE', 'ARCHIVED'
                        )),
    graphify_gate_pass  BOOLEAN NOT NULL DEFAULT FALSE,
    acp_a2a_agent_id    TEXT,
    last_error_receipt  JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (board_population, external_task_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_source_ref_rev 
    ON atlas_kanban_reconciliation_v1 (source_ref, source_revision);

CREATE INDEX IF NOT EXISTS idx_kanban_acp_open_queue 
    ON atlas_kanban_reconciliation_v1 (board_population, status, domain_id)
    WHERE status IN ('PENDING', 'GATE_BLOCKED');
`;

try {
  console.log('Applying atlas_kanban_reconciliation_v1 DDL on PostgreSQL 18.4...');
  await pool.query(ddl);
  console.log('atlas_kanban_reconciliation_v1 schema created successfully with native uuidv7() and partial indexes.');
} catch (error) {
  console.error('DDL application failed:', error);
  process.exit(1);
} finally {
  await pool.end();
}
