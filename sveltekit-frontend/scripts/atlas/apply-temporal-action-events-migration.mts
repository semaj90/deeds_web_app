#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '../../src/lib/server/db/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../..');
const migrationPath = path.join(
  frontendRoot,
  'drizzle/manual/20260821_atlas_agent_action_events.sql',
);

async function main(): Promise<void> {
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);

  const table = await pool.query<{ regclass: string | null }>(
    `SELECT to_regclass('public.atlas_agent_action_events')::text AS regclass`,
  );
  const sequence = await pool.query<{ regclass: string | null }>(
    `SELECT to_regclass('public.atlas_agent_action_ledger_sequence_seq')::text AS regclass`,
  );
  const maxRow = await pool.query<{ max_sequence: string | null }>(
    `SELECT MAX(ledger_sequence)::text AS max_sequence FROM atlas_agent_action_events`,
  );
  const sequenceState = await pool.query<{ last_value: string; is_called: boolean }>(
    `SELECT last_value::text, is_called FROM atlas_agent_action_ledger_sequence_seq`,
  );

  if (!table.rows[0]?.regclass) throw new Error('TEMPORAL_ACTION_EVENTS_TABLE_MISSING');
  if (!sequence.rows[0]?.regclass) throw new Error('TEMPORAL_LEDGER_SEQUENCE_MISSING');

  const maxSequence = Number(maxRow.rows[0]?.max_sequence ?? 0);
  const lastValue = Number(sequenceState.rows[0]?.last_value ?? 0);
  if (!Number.isSafeInteger(maxSequence) || maxSequence < 0) {
    throw new Error(`TEMPORAL_MAX_SEQUENCE_INVALID:${String(maxRow.rows[0]?.max_sequence)}`);
  }
  if (!Number.isSafeInteger(lastValue) || lastValue <= 0) {
    throw new Error(`TEMPORAL_SEQUENCE_STATE_INVALID:${String(sequenceState.rows[0]?.last_value)}`);
  }
  if (lastValue <= maxSequence) {
    throw new Error(`TEMPORAL_SEQUENCE_NOT_ABOVE_PERSISTED_MAX:last=${lastValue}:max=${maxSequence}`);
  }

  console.log(JSON.stringify({
    schema: 'atlas.temporal-action-migration-proof.v1',
    status: 'PROVEN',
    migration: path.relative(frontendRoot, migrationPath).replaceAll('\\', '/'),
    table: table.rows[0]!.regclass,
    sequence: sequence.rows[0]!.regclass,
    persisted_max_ledger_sequence: maxSequence,
    allocator_last_value: lastValue,
    allocator_is_called: sequenceState.rows[0]!.is_called,
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
