/**
 * Shared data loading utility for Phase 3 (Logistic Regression) and Phase 4 (XGBoost) classifiers.
 * Loads training/validation/test packets from Postgres with stratified split.
 *
 * CRITICAL: Stratification happens BEFORE limiting to prevent class bias.
 * Per-domain sampling ensures all classes represented proportionally.
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import type { ClassifierFeatureManifest } from './classifier-contracts.ts';

export interface TrainingRow {
  packet_key: string;
  domain_class: string;
  feature_vector: number[];
}

export interface DataSplit {
  training: TrainingRow[];
  validation: TrainingRow[];
  test: TrainingRow[];
  metadata: SplitMetadata;
}

export interface SplitMetadata {
  total_source_rows: number;
  total_loaded_rows: number;
  rows_per_class: Record<string, number>;
  classes_excluded: string[];
  train_rows_per_class: Record<string, number>;
  validation_rows_per_class: Record<string, number>;
  test_rows_per_class: Record<string, number>;
  vector_manifest: VectorManifest;
  feature_manifest: ClassifierFeatureManifest;
  split_seed: number;
  dataset_hash: string;
}

export interface VectorManifest {
  vector_name: string;
  embedding_model: string;
  embedding_model_revision: string;
  dimensions: number;
  distance_metric: string;
  training_snapshot_sha256: string;
}

/**
 * Load all packets from atlas_packets with known domain_class
 * Stratified by domain_class BEFORE applying per-domain limit
 */
async function loadPacketsFromPostgres(
  pool: Pool,
  limit_per_domain: number | null = null
): Promise<{ rows: TrainingRow[]; metadata: any }> {
  try {
    // Step 1: Count rows per domain
    const countQuery = `
      SELECT domain_class, COUNT(*) as count
      FROM atlas_packets
      WHERE domain_class IS NOT NULL AND embedding IS NOT NULL
      GROUP BY domain_class
      ORDER BY domain_class
    `;
    const countResult = await pool.query(countQuery);
    const rows_per_class: Record<string, number> = {};
    let total_source_rows = 0;
    for (const row of countResult.rows) {
      rows_per_class[row.domain_class] = row.count;
      total_source_rows += row.count;
    }

    console.log(`  Source rows by class: ${JSON.stringify(rows_per_class)}`);
    console.log(`  Total source rows: ${total_source_rows}`);

    // Step 2: Load packets with per-domain stratification
    // Use ROW_NUMBER to ensure deterministic sampling within each domain
    const loadQuery = `
      WITH ranked AS (
        SELECT
          packet_key,
          domain_class,
          embedding::text as embedding_json,
          ROW_NUMBER() OVER (PARTITION BY domain_class ORDER BY packet_key) as class_row
        FROM atlas_packets
        WHERE domain_class IS NOT NULL AND embedding IS NOT NULL
      )
      SELECT packet_key, domain_class, embedding_json
      FROM ranked
      WHERE class_row <= COALESCE($1::int, 999999999)
      ORDER BY domain_class, packet_key
    `;

    const result = await pool.query(loadQuery, [limit_per_domain]);

    if (!result.rows || result.rows.length === 0) {
      console.warn('⚠️  No training packets found in Postgres');
      return { rows: [], metadata: { rows_per_class, total_source_rows, total_loaded: 0 } };
    }

    const rows = result.rows.map((row) => {
      let embedding: number[] = [];
      try {
        if (typeof row.embedding_json === 'string') {
          const trimmed = row.embedding_json.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            const content = trimmed.slice(1, -1);
            embedding = content.split(',').map((s) => parseFloat(s.trim())).filter((v) => !isNaN(v));
          }
        }
      } catch (e) {
        // Silently skip malformed vectors
      }

      if (embedding.length !== 768) {
        return null;
      }

      return {
        packet_key: row.packet_key,
        domain_class: row.domain_class,
        feature_vector: embedding,
      };
    });

    const validRows = rows.filter((r) => r !== null) as TrainingRow[];
    console.log(
      `  Loaded ${validRows.length}/${result.rows.length} valid packets (${((validRows.length / result.rows.length) * 100).toFixed(1)}% valid)`
    );

    return {
      rows: validRows,
      metadata: { rows_per_class, total_source_rows, total_loaded: validRows.length },
    };
  } catch (err) {
    console.error('❌ Failed to load packets from Postgres:', err);
    throw err;
  }
}

/**
 * Minimum support rules for class inclusion
 */
function filterByMinimumSupport(
  packets: TrainingRow[],
  min_class_support = 6
): { packets: TrainingRow[]; excluded_classes: string[] } {
  const counts: Record<string, number> = {};
  for (const p of packets) {
    counts[p.domain_class] = (counts[p.domain_class] || 0) + 1;
  }

  const excluded = Object.keys(counts).filter((c) => counts[c] < min_class_support);
  const filtered = packets.filter((p) => counts[p.domain_class] >= min_class_support);

  return { packets: filtered, excluded_classes: excluded };
}

/**
 * Stratified train/val/test split (70% train, 15% val, 15% test)
 * Preserves class distribution across splits
 * Enforces minimum support per class
 */
export function stratifiedSplit(
  packets: TrainingRow[],
  seed = 42,
  min_class_support = 6
): { split: DataSplit; excluded_classes: string[] } {
  if (packets.length === 0) {
    return {
      split: {
        training: [],
        validation: [],
        test: [],
        metadata: {
          total_source_rows: 0,
          total_loaded_rows: 0,
          rows_per_class: {},
          classes_excluded: [],
          train_rows_per_class: {},
          validation_rows_per_class: {},
          test_rows_per_class: {},
          vector_manifest: {
            vector_name: 'semantic_768',
            embedding_model: 'embeddinggemma:latest',
            embedding_model_revision: 'unknown',
            dimensions: 768,
            distance_metric: 'cosine',
            training_snapshot_sha256: '',
          },
          feature_manifest: {
            schemaVersion: 'atlas.classifier.features.v1',
            semantic: {
              representationId: 'semantic_768',
              offset: 0,
              width: 768,
              modelId: 'embeddinggemma:latest',
              modelRevision: 'unknown',
            },
            totalWidth: 768,
          },
          split_seed: seed,
          dataset_hash: '',
        },
      },
      excluded_classes: [],
    };
  }

  // Filter by minimum support
  const { packets: filtered, excluded_classes } = filterByMinimumSupport(packets, min_class_support);

  if (filtered.length === 0) {
    console.error('❌ No classes meet minimum support threshold');
    process.exit(1);
  }

  // Group by domain_class
  const byDomain: Record<string, TrainingRow[]> = {};
  for (const packet of filtered) {
    if (!byDomain[packet.domain_class]) {
      byDomain[packet.domain_class] = [];
    }
    byDomain[packet.domain_class].push(packet);
  }

  // Shuffle each domain's packets (deterministic with seed)
  const rng = seededRandom(seed);
  for (const domain of Object.keys(byDomain)) {
    byDomain[domain] = shuffleArray(byDomain[domain], rng);
  }

  // Split each domain 70/15/15
  const training: TrainingRow[] = [];
  const validation: TrainingRow[] = [];
  const test: TrainingRow[] = [];

  const train_rows_per_class: Record<string, number> = {};
  const validation_rows_per_class: Record<string, number> = {};
  const test_rows_per_class: Record<string, number> = {};

  for (const domain of Object.keys(byDomain)) {
    const domainPackets = byDomain[domain];
    const trainSize = Math.floor(domainPackets.length * 0.7);
    const valSize = Math.floor(domainPackets.length * 0.15);

    training.push(...domainPackets.slice(0, trainSize));
    validation.push(...domainPackets.slice(trainSize, trainSize + valSize));
    test.push(...domainPackets.slice(trainSize + valSize));

    train_rows_per_class[domain] = trainSize;
    validation_rows_per_class[domain] = valSize;
    test_rows_per_class[domain] = domainPackets.length - trainSize - valSize;
  }

  // Compute dataset hash
  const datasetHash = createHash('sha256')
    .update(JSON.stringify({ training: training.map((r) => r.packet_key).sort() }))
    .digest('hex');

  const split: DataSplit = {
    training,
    validation,
    test,
    metadata: {
      total_source_rows: packets.length,
      total_loaded_rows: filtered.length,
      rows_per_class: Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, v.length])),
      classes_excluded: excluded_classes,
      train_rows_per_class,
      validation_rows_per_class,
      test_rows_per_class,
      vector_manifest: {
        vector_name: 'semantic_768',
        embedding_model: 'embeddinggemma:latest',
        embedding_model_revision: 'unknown',
        dimensions: 768,
        distance_metric: 'cosine',
        training_snapshot_sha256: datasetHash,
      },
      feature_manifest: {
        schemaVersion: 'atlas.classifier.features.v1',
        semantic: {
          representationId: 'semantic_768',
          offset: 0,
          width: 768,
          modelId: 'embeddinggemma:latest',
          modelRevision: 'unknown',
        },
        totalWidth: 768,
      },
      split_seed: seed,
      dataset_hash: datasetHash,
    },
  };

  return { split, excluded_classes };
}

/**
 * Seeded random number generator (deterministic for reproducibility)
 */
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/**
 * Shuffle array using Fisher-Yates
 */
function shuffleArray<T>(array: T[], rng: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Main entry point: load and split training data
 * Uses per-domain limit (not total limit) to ensure all classes represented
 */
export async function loadTrainingData(
  limit_per_domain: number = 500,
  min_class_support: number = 6
): Promise<DataSplit> {
  const dbUrl = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;

  if (!dbUrl) {
    console.error(`
❌ DATABASE_URL not set. Please configure:
   set DATABASE_URL=postgresql://legal_admin:<password>@localhost:5434/legal_ai_db
    `);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log(`📂 Loading training packets from Postgres (${limit_per_domain} per domain)...`);
    const { rows, metadata } = await loadPacketsFromPostgres(pool, limit_per_domain);
    console.log(`✓ Loaded ${rows.length} packets`);

    if (rows.length === 0) {
      console.error('❌ No training data available. Aborting.');
      process.exit(1);
    }

    // Stratified split with minimum support enforcement
    console.log(
      `🔀 Splitting into train/val/test (70/15/15) with min_support=${min_class_support}...`
    );
    const { split, excluded_classes } = stratifiedSplit(rows, 42, min_class_support);

    console.log(`✓ Training set: ${split.training.length} packets`);
    console.log(`✓ Validation set: ${split.validation.length} packets`);
    console.log(`✓ Test set: ${split.test.length} packets`);

    if (excluded_classes.length > 0) {
      console.log(`⚠️  Excluded classes (insufficient support): ${excluded_classes.join(', ')}`);
    }

    console.log(`\n📊 SPLIT MANIFEST:`);
    console.log(`  Rows per class (source):`);
    for (const [cls, count] of Object.entries(split.metadata.rows_per_class)) {
      console.log(`    ${cls}: ${count}`);
    }
    console.log(`\n  Train/Val/Test breakdown:`);
    for (const cls of Object.keys(split.metadata.train_rows_per_class)) {
      const tr = split.metadata.train_rows_per_class[cls];
      const vr = split.metadata.validation_rows_per_class[cls];
      const te = split.metadata.test_rows_per_class[cls];
      console.log(`    ${cls}: ${tr}/${vr}/${te}`);
    }

    console.log(`\n  Vector manifest:`, split.metadata.vector_manifest);
    console.log(`  Dataset hash: ${split.metadata.dataset_hash}`);

    return split;
  } finally {
    await pool.end();
  }
}
