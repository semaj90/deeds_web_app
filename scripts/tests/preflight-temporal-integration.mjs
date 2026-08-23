#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const requiredMigrations = [
  'sveltekit-frontend/drizzle/manual/parent_atlas_artifact_transport_v1.sql',
  'sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_events.sql',
  'sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_ledger_sequence.sql',
  'sveltekit-frontend/drizzle/manual/20260821_atlas_recommendation_outcome_receipts.sql',
];

const raw = process.env.ATLAS_INTEGRATION_DATABASE_URL;
if (!raw) {
  console.log(JSON.stringify({ status: 'BLOCKED', reason: 'ATLAS_INTEGRATION_DATABASE_URL_REQUIRED', migrations_present: requiredMigrations.every((file) => existsSync(resolve(file))) }, null, 2));
  process.exit(2);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error('ATLAS_INTEGRATION_DATABASE_URL_INVALID');
  process.exit(2);
}

const database = url.pathname.replace(/^\//, '');
const shared = url.port === '5434' || database === 'legal_ai_db';
const migrations = Object.fromEntries(requiredMigrations.map((file) => [file, existsSync(resolve(file))]));
const migrationsPresent = Object.values(migrations).every(Boolean);
const result = {
  status: !shared && migrationsPresent ? 'READY_FOR_OPERATOR_APPROVAL' : 'BLOCKED',
  host: url.hostname,
  port: url.port || '5432',
  database,
  shared_workstation_target: shared,
  migrations,
};
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'READY_FOR_OPERATOR_APPROVAL') process.exit(2);
