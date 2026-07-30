#!/usr/bin/env node
/**
 * ACE Stage A0 Routing-Policy Matrix
 *
 * This script writes and validates the static routing policy used by ACE Stage A0.
 * It is not a SOM training script. SOM, PageRank, ontology, lineage, and cache
 * state are separate inputs or projections, not canonical facts.
 *
 * Runtime contract:
 * - Postgres is the authority for the versioned policy record.
 * - Valkey holds the active hot projection and pointer.
 * - Cache warmth is an execution signal, not a relevance signal.
 * - Dry runs do not open database connections.
 */

import { createHash } from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import { z } from 'zod';

const APPLY = process.argv.includes('--apply');
const VALIDATE = process.argv.includes('--validate');
const DRY_RUN = !APPLY && !VALIDATE;

const POLICY_SCHEMA_VERSION = 'ace.routing-policy.v2';
const POLICY_ID = process.env.ACE_ROUTING_POLICY_ID ?? 'stage-a0-default';
const POLICY_REVISION =
  process.env.ACE_ROUTING_POLICY_REVISION ??
  new Date().toISOString().replace(/[:]/g, '-');

const MAX_SOM_DISTANCE = Math.hypot(19, 19);

const ROUTING_AXES = [
  { name: 'semantic', description: 'Dense semantic coherence' },
  { name: 'som', description: 'SOM neighborhood routing' },
  { name: 'ontology', description: 'Ontology and feature overlap' },
  { name: 'lineage', description: 'Lineage, supersession, and freshness' },
];

const FEATURE_DIMENSIONS = [
  {
    name: 'semantic_similarity',
    range: [0, 1],
    provenance: 'registered semantic representation',
  },
  {
    name: 'som_neighborhood_similarity',
    range: [0, 1],
    provenance: 'normalized inverse Euclidean SOM distance',
  },
  {
    name: 'ontology_overlap',
    range: [0, 1],
    provenance: 'taxonomy version + label observations',
  },
  {
    name: 'pagerank_authority',
    range: [0, 1],
    provenance: 'pagerank run id + graph revision',
  },
  {
    name: 'lineage_freshness',
    range: [0, 1],
    provenance: 'workspace revision + supersession chain',
  },
];

const RUNTIME_FEATURES = [
  {
    name: 'exact_cache_hit',
    purpose: 'execution',
    provenance: 'Valkey hot projection only',
  },
  {
    name: 'centroid_cache_hit',
    purpose: 'execution',
    provenance: 'Valkey hot projection only',
  },
  {
    name: 'qdrant_healthy',
    purpose: 'execution',
    provenance: 'service health',
  },
  {
    name: 'neo4j_healthy',
    purpose: 'execution',
    provenance: 'service health',
  },
  {
    name: 'latency_budget_ms',
    purpose: 'execution',
    provenance: 'caller runtime budget',
  },
];

const DEFAULT_ROUTING_MATRIX = [
  [0.48, 0.12, 0.12, 0.14, 0.14],
  [0.12, 0.46, 0.15, 0.17, 0.10],
  [0.12, 0.10, 0.48, 0.15, 0.15],
  [0.10, 0.08, 0.12, 0.45, 0.25],
];

const WeightSchema = z.number().finite().min(0).max(1);
const RoutingRowSchema = z
  .tuple([
    WeightSchema,
    WeightSchema,
    WeightSchema,
    WeightSchema,
    WeightSchema,
  ])
  .superRefine((row, ctx) => {
    const sum = row.reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Row weights must sum to 1; received ${sum}`,
      });
    }
  });

const RoutingMatrixSchema = z.tuple([
  RoutingRowSchema,
  RoutingRowSchema,
  RoutingRowSchema,
  RoutingRowSchema,
]);

const PolicyDocumentSchema = z.object({
  schemaVersion: z.literal(POLICY_SCHEMA_VERSION),
  policyId: z.string().min(1),
  policyRevision: z.string().min(1),
  shape: z.tuple([z.literal(4), z.literal(5)]),
  axes: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
  features: z.array(
    z.object({
      name: z.string().min(1),
      range: z.tuple([z.number(), z.number()]),
      provenance: z.string().min(1),
    }),
  ),
  runtimeFeatures: z.array(
    z.object({
      name: z.string().min(1),
      purpose: z.literal('execution'),
      provenance: z.string().min(1),
    }),
  ),
  weights: RoutingMatrixSchema,
  createdAt: z.string().min(1),
  source: z.literal('STATIC_DEFAULT'),
  lifecycleStatus: z.enum(['CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED']),
  validationStatus: z.enum([
    'STATIC_VERIFIED',
    'SAMPLE_VERIFIED',
    'PRODUCTION_VERIFIED',
    'FAILED',
  ]),
  policyHash: z.string().min(1),
});

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: 'DATABASE_URL' };
  }

  throw new Error('DATABASE_URL is required for apply/validate');
}

function resolveValkeyUrl() {
  if (process.env.VALKEY_URL) {
    return { url: process.env.VALKEY_URL, source: 'VALKEY_URL' };
  }

  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL, source: 'REDIS_URL' };
  }

  return { url: 'redis://127.0.0.1:6379', source: 'default' };
}

function normalizeSomDistance(distance) {
  return 1 - clamp01(distance / MAX_SOM_DISTANCE);
}

function buildPolicyDocument() {
  const createdAt = new Date().toISOString();
  const baseDocument = {
    schemaVersion: POLICY_SCHEMA_VERSION,
    policyId: POLICY_ID,
    policyRevision: POLICY_REVISION,
    shape: [4, 5],
    axes: ROUTING_AXES,
    features: FEATURE_DIMENSIONS,
    runtimeFeatures: RUNTIME_FEATURES,
    weights: DEFAULT_ROUTING_MATRIX,
    createdAt,
    source: 'STATIC_DEFAULT',
    lifecycleStatus: 'ACTIVE',
    validationStatus: 'STATIC_VERIFIED',
  };

  const policyHash = createHash('sha256').update(JSON.stringify(baseDocument)).digest('hex');

  return {
    ...baseDocument,
    policyHash,
  };
}

function validatePolicyDocument(document) {
  return PolicyDocumentSchema.safeParse(document);
}

function buildPolicyKeys() {
  const policyKey = `ace:routing:policy:v1:${POLICY_ID}:${POLICY_REVISION}`;
  const activeKey = 'ace:routing:policy:active';
  return { policyKey, activeKey };
}

async function createRuntimeClients() {
  const { url: databaseUrl, source: databaseSource } = resolveDatabaseUrl();
  const { url: valkeyUrl, source: valkeySource } = resolveValkeyUrl();

  const db = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const valkey = new Redis(valkeyUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
  });

  await valkey.connect();

  return {
    db,
    valkey,
    databaseSource,
    valkeySource,
  };
}

async function ensurePolicyTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS atlas_routing_policies (
      policy_id text NOT NULL,
      policy_revision text NOT NULL,
      schema_version text NOT NULL,
      matrix_rows integer NOT NULL,
      matrix_columns integer NOT NULL,
      weights jsonb NOT NULL,
      feature_contract jsonb NOT NULL,
      runtime_contract jsonb NOT NULL,
      policy_hash text NOT NULL,
      lifecycle_status text NOT NULL,
      validation_status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      activated_at timestamptz,
      superseded_by_revision text,
      PRIMARY KEY (policy_id, policy_revision)
    );
  `);
}

async function persistPolicy(db, valkey, policyDocument) {
  const { policyKey, activeKey } = buildPolicyKeys();

  await ensurePolicyTable(db);
  await db.query(
    `
      INSERT INTO atlas_routing_policies (
        policy_id,
        policy_revision,
        schema_version,
        matrix_rows,
        matrix_columns,
        weights,
        feature_contract,
        runtime_contract,
        policy_hash,
        lifecycle_status,
        validation_status,
        created_at,
        activated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, now())
      ON CONFLICT (policy_id, policy_revision)
      DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        matrix_rows = EXCLUDED.matrix_rows,
        matrix_columns = EXCLUDED.matrix_columns,
        weights = EXCLUDED.weights,
        feature_contract = EXCLUDED.feature_contract,
        runtime_contract = EXCLUDED.runtime_contract,
        policy_hash = EXCLUDED.policy_hash,
        lifecycle_status = EXCLUDED.lifecycle_status,
        validation_status = EXCLUDED.validation_status,
        activated_at = now();
    `,
    [
      policyDocument.policyId,
      policyDocument.policyRevision,
      policyDocument.schemaVersion,
      4,
      5,
      JSON.stringify(policyDocument.weights),
      JSON.stringify(policyDocument.features),
      JSON.stringify(policyDocument.runtimeFeatures),
      policyDocument.policyHash,
      policyDocument.lifecycleStatus,
      policyDocument.validationStatus,
      policyDocument.createdAt,
    ],
  );

  const serialized = JSON.stringify(policyDocument);
  await valkey
    .multi()
    .set(policyKey, serialized)
    .set(activeKey, policyKey)
    .exec();

  return { policyKey, activeKey };
}

async function readActivePolicy(valkey) {
  const { activeKey } = buildPolicyKeys();
  const policyKey = await valkey.get(activeKey);

  if (!policyKey) {
    throw new Error(`No active routing policy pointer found at ${activeKey}`);
  }

  const rawPolicy = await valkey.get(policyKey);
  if (!rawPolicy) {
    throw new Error(`Active policy pointer ${policyKey} has no stored policy document`);
  }

  const parsed = JSON.parse(rawPolicy);
  const result = validatePolicyDocument(parsed);
  if (!result.success) {
    throw new Error(`Stored policy document failed validation: ${result.error.message}`);
  }

  return {
    policyKey,
    policy: result.data,
  };
}

async function validatePersistedPolicy(db, valkey, expectedPolicy) {
  const active = await readActivePolicy(valkey);

  if (active.policy.policyHash !== expectedPolicy.policyHash) {
    throw new Error(
      `Policy hash mismatch: stored ${active.policy.policyHash} != expected ${expectedPolicy.policyHash}`,
    );
  }

  const { rows } = await db.query(
    `
      SELECT policy_id, policy_revision, schema_version, matrix_rows, matrix_columns,
             policy_hash, lifecycle_status, validation_status
      FROM atlas_routing_policies
      WHERE policy_id = $1 AND policy_revision = $2
      LIMIT 1
    `,
    [expectedPolicy.policyId, expectedPolicy.policyRevision],
  );

  if (rows.length === 0) {
    throw new Error(
      `Policy row missing in Postgres for ${expectedPolicy.policyId}:${expectedPolicy.policyRevision}`,
    );
  }

  const row = rows[0];
  if (row.policy_hash !== expectedPolicy.policyHash) {
    throw new Error(`Postgres policy hash mismatch for ${expectedPolicy.policyId}`);
  }

  if (row.matrix_rows !== 4 || row.matrix_columns !== 5) {
    throw new Error(`Unexpected persisted matrix shape ${row.matrix_rows}x${row.matrix_columns}`);
  }

  return {
    activePointer: active.policyKey,
    persisted: row,
  };
}

function printSummary(policyDocument) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ACE Stage A0 Routing-Policy Matrix                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Policy ID:        ${policyDocument.policyId}`);
  console.log(`Policy revision:  ${policyDocument.policyRevision}`);
  console.log(`Schema version:   ${policyDocument.schemaVersion}`);
  console.log(`Shape:            ${policyDocument.shape[0]} x ${policyDocument.shape[1]}`);
  console.log(`SOM max distance: ${MAX_SOM_DISTANCE.toFixed(2)} (normalized to similarity)\n`);
  console.log(
    `SOM similarity:   distance 0 -> ${normalizeSomDistance(0).toFixed(2)}, ` +
      `distance ${MAX_SOM_DISTANCE.toFixed(2)} -> ${normalizeSomDistance(MAX_SOM_DISTANCE).toFixed(2)}\n`,
  );

  console.log('Axes:');
  for (const axis of policyDocument.axes) {
    console.log(`  - ${axis.name}: ${axis.description}`);
  }

  console.log('\nFeatures:');
  for (const feature of policyDocument.features) {
    console.log(`  - ${feature.name} [${feature.range.join(', ')}]`);
  }

  console.log('\nRuntime features (execution policy, not relevance):');
  for (const feature of policyDocument.runtimeFeatures) {
    console.log(`  - ${feature.name}: ${feature.provenance}`);
  }

  console.log('\nWeights:');
  policyDocument.weights.forEach((row, index) => {
    console.log(`  ${policyDocument.axes[index].name.padEnd(10)} ${row.map((v) => v.toFixed(2)).join(', ')}`);
  });
}

async function main() {
  const policyDocument = buildPolicyDocument();
  const validation = validatePolicyDocument(policyDocument);

  if (!validation.success) {
    console.error('Policy document failed static validation:');
    console.error(validation.error.message);
    process.exitCode = 1;
    return;
  }

  const policy = validation.data;
  printSummary(policy);

  let db;
  let valkey;

  try {
    if (DRY_RUN) {
      console.log('\nDry run only. No database connections were opened.');
      console.log('Cache warmth remains an execution signal, not a relevance signal.');
      process.exitCode = 0;
      return;
    }

    const clients = await createRuntimeClients();
    db = clients.db;
    valkey = clients.valkey;

    console.log(`\nValkey source:   ${clients.valkeySource}`);
    console.log(`Database source: ${clients.databaseSource}`);

    if (APPLY) {
      const keys = await persistPolicy(db, valkey, policy);
      console.log('\nApplied routing policy:');
      console.log(`  - policy key: ${keys.policyKey}`);
      console.log(`  - active key:  ${keys.activeKey}`);
      console.log('  - Postgres authority row updated in atlas_routing_policies');
    }

    if (VALIDATE) {
      const result = await validatePersistedPolicy(db, valkey, policy);
      console.log('\nValidation:');
      console.log(`  - active pointer: ${result.activePointer}`);
      console.log(`  - persisted hash: ${result.persisted.policy_hash}`);
      console.log(`  - matrix shape:   ${result.persisted.matrix_rows}x${result.persisted.matrix_columns}`);
    }

    process.exitCode = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${message}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([
      valkey?.quit(),
      db?.end(),
    ]);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exitCode = 1;
});
