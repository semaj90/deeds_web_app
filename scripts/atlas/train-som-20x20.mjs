#!/usr/bin/env node
/**
 * Train SOM: 20×20 Self-Organizing Map on latent-64 space
 *
 * Goal: Cluster 64-dim latent vectors into 20×20 grid cells
 * Use case: Topology-aware routing for ACE context selection
 *
 * Prerequisites:
 * - Autoencoder training complete (latent_64 index exists)
 * - Qdrant packet_key identity consistency ≥ 95% (VERIFIED)
 *
 * Output:
 * - som_20x20_codebook.json (400 BMU centroids in 64-dim space)
 * - som_assignments.json (packet_id → {row, col, distance} mappings)
 * - Neo4j SIMILAR_TOPOLOGY edges seeded from SOM grid adjacency
 * - Redis cache: gpu:som:cell:{row}:{col} = packet IDs in that cell
 */

import pg from 'pg';
import { createRequire } from 'module';
import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import Redis from 'ioredis';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const require = createRequire(import.meta.url);
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const MODEL_OUTPUT_DIR = resolve('.', 'models/som');
const SOM_CODEBOOK_PATH = resolve(MODEL_OUTPUT_DIR, 'som_20x20_codebook.json');
const SOM_ASSIGNMENTS_PATH = resolve(MODEL_OUTPUT_DIR, 'som_assignments.json');

const SOM_GRID_WIDTH = 20;
const SOM_GRID_HEIGHT = 20;
const LATENT_DIM = 64;
const SOM_ITERATIONS = Number(process.env.ATLAS_SOM_ITERATIONS || 50);
const LEARNING_RATE_INITIAL = 0.5;
const LEARNING_RATE_FINAL = 0.01;
const RADIUS_INITIAL = 10;
const RADIUS_FINAL = 1;
const ADDON_PATH = resolve('.', 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');

function euclideanDistance(vector, weights, offset) {
  let distance = 0;
  for (let d = 0; d < LATENT_DIM; d++) {
    const diff = vector[d] - weights[offset + d];
    distance += diff * diff;
  }
  return Math.sqrt(distance);
}

function trainSomCpu(vectors, iterations) {
  const neuronCount = SOM_GRID_WIDTH * SOM_GRID_HEIGHT;
  const trainingVectors = vectors.length > 5000
    ? Array.from({ length: 5000 }, (_, i) => vectors[Math.floor(i * vectors.length / 5000)])
    : vectors;
  const weights = new Float32Array(neuronCount * LATENT_DIM);

  for (let neuron = 0; neuron < neuronCount; neuron++) {
    const seed = trainingVectors[Math.floor(neuron * trainingVectors.length / neuronCount)];
    weights.set(seed, neuron * LATENT_DIM);
  }

  for (let epoch = 0; epoch < iterations; epoch++) {
    const progress = iterations === 1 ? 1 : epoch / (iterations - 1);
    const learningRate = LEARNING_RATE_INITIAL +
      (LEARNING_RATE_FINAL - LEARNING_RATE_INITIAL) * progress;
    const radius = RADIUS_INITIAL + (RADIUS_FINAL - RADIUS_INITIAL) * progress;
    const radiusSquared = Math.max(radius * radius, 1e-6);

    for (const vector of trainingVectors) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let neuron = 0; neuron < neuronCount; neuron++) {
        const distance = euclideanDistance(vector, weights, neuron * LATENT_DIM);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = neuron;
        }
      }

      const bestRow = Math.floor(bestIndex / SOM_GRID_WIDTH);
      const bestCol = bestIndex % SOM_GRID_WIDTH;
      for (let neuron = 0; neuron < neuronCount; neuron++) {
        const row = Math.floor(neuron / SOM_GRID_WIDTH);
        const col = neuron % SOM_GRID_WIDTH;
        const gridDistanceSquared = (row - bestRow) ** 2 + (col - bestCol) ** 2;
        if (gridDistanceSquared > radiusSquared) continue;
        const influence = Math.exp(-gridDistanceSquared / (2 * radiusSquared));
        const offset = neuron * LATENT_DIM;
        for (let d = 0; d < LATENT_DIM; d++) {
          weights[offset + d] += learningRate * influence * (vector[d] - weights[offset + d]);
        }
      }
    }
  }

  return { weights, backend: 'cpu-sampled-fallback' };
}

function trainSom(vectors, allowCpu) {
  const flat = new Float32Array(vectors.length * LATENT_DIM);
  for (let i = 0; i < vectors.length; i++) flat.set(vectors[i], i * LATENT_DIM);

  if (existsSync(ADDON_PATH)) {
    const addon = require(ADDON_PATH);
    if (typeof addon.trainSOM === 'function') {
      const result = addon.trainSOM(
        flat,
        vectors.length,
        LATENT_DIM,
        SOM_GRID_WIDTH,
        SOM_GRID_HEIGHT,
        SOM_ITERATIONS,
        LEARNING_RATE_INITIAL,
        LEARNING_RATE_FINAL,
        RADIUS_INITIAL,
        RADIUS_FINAL
      );
      if (!result?.weights) throw new Error('Native trainSOM returned no codebook weights');
      return {
        weights: new Float32Array(result.weights),
        bmu: result.bmu ? new Int32Array(result.bmu) : null,
        backend: addon.checkCudaAvailable?.() === 1 ? 'native-cuda' : 'native-cpu',
      };
    }
  }

  if (!allowCpu) {
    throw new Error(`Native trainSOM unavailable at ${ADDON_PATH}; pass --allow-cpu for the bounded CPU fallback`);
  }
  return trainSomCpu(vectors, Math.min(SOM_ITERATIONS, 20));
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Train SOM: 20×20 Self-Organizing Map                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');
  const allowCpu = process.argv.includes('--allow-cpu');
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';

  console.log(`Mode: ${mode}\n`);

  // Step 1: Load latent index
  console.log('Step 1: Load latent vectors');
  console.log('────────────────────────────');

  const latentIndexPath = resolve('.', 'models/autoencoder/autoencoder_latent_index.json');
  let latentIndex;
  let candidatesMap = {};
  try {
    const content = readFileSync(latentIndexPath, 'utf-8');
    const data = JSON.parse(content);
    latentIndex = data.index;
    candidatesMap = data.candidates || {};
    console.log(`Loaded ${Object.keys(latentIndex).length} latent vectors from ${latentIndexPath}`);
  } catch (err) {
    console.error(`❌ Failed to load latent index: ${err.message}`);
    console.log('   Run autoencoder training first: npm --prefix sveltekit-frontend run ae:train\n');
    await pool.end();
    process.exit(1);
  }

  const packetCount = Object.keys(latentIndex).length;
  console.log(`✅ Loaded ${packetCount} latent vectors\n`);

  if (!dryRun) {
    const pointEntries = Object.entries(latentIndex).filter(([, entry]) =>
      Array.isArray(entry?.latent_64) &&
      entry.latent_64.length === LATENT_DIM &&
      entry.kind !== 'directory-cluster' &&
      entry.ledger_type !== 'legacy_qdrant_only' &&
      entry.canonical !== false &&
      entry.payload_unmatched !== true &&
      Boolean(entry.packet_key || entry.source_ref)
    );
    if (pointEntries.length === 0) throw new Error('Latent index contains no valid latent_64 vectors');

    console.log('Step 2: Train SOM codebook');
    console.log('───────────────────────────');
    const vectors = pointEntries.map(([, entry]) => Float32Array.from(entry.latent_64));
    const t0 = Date.now();
    const trained = trainSom(vectors, allowCpu);
    const t_som = Date.now() - t0;
    const neuronCount = SOM_GRID_WIDTH * SOM_GRID_HEIGHT;
    if (trained.weights.length !== neuronCount * LATENT_DIM) {
      throw new Error(`SOM codebook shape mismatch: ${trained.weights.length} values`);
    }
    const codebook = Array.from({ length: neuronCount }, (_, index) => ({
      row: Math.floor(index / SOM_GRID_WIDTH),
      col: index % SOM_GRID_WIDTH,
      bmu: Array.from(trained.weights.subarray(index * LATENT_DIM, (index + 1) * LATENT_DIM)),
    }));
    console.log(`✅ Trained ${codebook.length} BMUs via ${trained.backend} in ${t_som} ms\n`);

    console.log('Step 3: Assign packets to trained BMUs');
    console.log('──────────────────────────────────────');
    const assignments = {};
    const cellAssignments = {};

    for (let pointIndex = 0; pointIndex < pointEntries.length; pointIndex++) {
      const [pointId, entry] = pointEntries[pointIndex];
      const latent = entry.latent_64;
      let bestIndex = trained.bmu?.[pointIndex];
      if (!Number.isInteger(bestIndex) || bestIndex < 0 || bestIndex >= neuronCount) {
        let bestDistance = Infinity;
        bestIndex = 0;
        for (let neuron = 0; neuron < neuronCount; neuron++) {
          const distance = euclideanDistance(latent, trained.weights, neuron * LATENT_DIM);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = neuron;
          }
        }
      }
      const row = Math.floor(bestIndex / SOM_GRID_WIDTH);
      const col = bestIndex % SOM_GRID_WIDTH;
      const bestDistance = euclideanDistance(latent, trained.weights, bestIndex * LATENT_DIM);
      const cellKey = `${row}:${col}`;
      assignments[pointId] = {
        row,
        col,
        distance: Number(bestDistance.toFixed(6)),
      };

      if (!cellAssignments[cellKey]) {
        cellAssignments[cellKey] = [];
      }
      cellAssignments[cellKey].push(pointId);
    }
    console.log(`✅ Assigned ${Object.keys(assignments).length} packets to SOM cells`);
    console.log(`   Occupied cells: ${Object.keys(cellAssignments).length} / ${codebook.length}`);
    console.log(`   Avg packets per cell: ${(packetCount / Object.keys(cellAssignments).length).toFixed(1)}\n`);

    // Step 4: Save SOM model
    console.log('Step 4: Save SOM model');
    console.log('──────────────────────');

    mkdirSync(MODEL_OUTPUT_DIR, { recursive: true });

    writeFileSync(SOM_CODEBOOK_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      grid_width: SOM_GRID_WIDTH,
      grid_height: SOM_GRID_HEIGHT,
      latent_dim: LATENT_DIM,
      bmu_count: codebook.length,
      iterations: SOM_ITERATIONS,
      training_backend: trained.backend,
      codebook: codebook
    }, null, 2));

    writeFileSync(SOM_ASSIGNMENTS_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      packet_count: Object.keys(assignments).length,
      assignments: assignments,
      cell_memberships: cellAssignments
    }, null, 2));

    console.log(`✅ SOM model saved: ${SOM_CODEBOOK_PATH}`);
    console.log(`✅ Assignments saved: ${SOM_ASSIGNMENTS_PATH}\n`);

    // Step 4.5: Write som_row, som_col, som_index → Postgres atlas_packets
    console.log('Step 4.5: Write som_row, som_col, som_index → Postgres');
    console.log('────────────────────────────────────────────────────────');

    let pgUpdated = 0;
    let pgNotMatched = 0;
    let pg_reasons = {
      qdrant_point_id: 0,
      packet_key: 0,
      source_ref: 0,
      jsonb_fallback: 0,
      skipped: 0
    };
    const entries = Object.entries(assignments);

    for (let start = 0; start < entries.length; start += 100) {
      const slice = entries.slice(start, start + 100);
      await pool.query('BEGIN');
      try {
        let batchUpdated = 0;
        for (const [pointId, assign] of slice) {
          const entry = latentIndex[pointId] || {};
          if (entry.kind === 'directory-cluster' || (!entry.packet_key && !entry.source_ref)) {
            pg_reasons.skipped++;
            continue;
          }
          const somIndex = assign.row * SOM_GRID_WIDTH + assign.col;
          const cands = candidatesMap[pointId] || [pointId];
          let qdId = entry.qdrant_point_id || null;
          let pKeys = [];
          let sRefs = [];

          if (entry.packet_key) {
            pKeys.push(entry.packet_key);
            const prefix = entry.packet_key.startsWith('sveltekit-frontend/')
              ? entry.packet_key.replace('sveltekit-frontend/', '')
              : 'sveltekit-frontend/' + entry.packet_key;
            pKeys.push(prefix);
          }
          if (entry.source_ref) {
            sRefs.push(entry.source_ref);
            const prefix = entry.source_ref.startsWith('sveltekit-frontend/')
              ? entry.source_ref.replace('sveltekit-frontend/', '')
              : 'sveltekit-frontend/' + entry.source_ref;
            sRefs.push(prefix);
          }

          for (const c of cands) {
            if (/^\d+$/.test(c)) {
              if (!qdId) qdId = c;
            } else if (c.includes(':')) {
              if (!pKeys.includes(c)) pKeys.push(c);
              const prefix = c.startsWith('sveltekit-frontend/') ? c.replace('sveltekit-frontend/', '') : 'sveltekit-frontend/' + c;
              if (!pKeys.includes(prefix)) pKeys.push(prefix);
            } else if (c.includes('/') || c.includes('.')) {
              if (!sRefs.includes(c)) sRefs.push(c);
              const prefix = c.startsWith('sveltekit-frontend/') ? c.replace('sveltekit-frontend/', '') : 'sveltekit-frontend/' + c;
              if (!sRefs.includes(prefix)) sRefs.push(prefix);
            } else {
              if (!pKeys.includes(c)) pKeys.push(c);
              if (!sRefs.includes(c)) sRefs.push(c);
              const prefix = c.startsWith('sveltekit-frontend/') ? c.replace('sveltekit-frontend/', '') : 'sveltekit-frontend/' + c;
              if (!pKeys.includes(prefix)) pKeys.push(prefix);
              if (!sRefs.includes(prefix)) sRefs.push(prefix);
            }
          }

          if (!qdId) qdId = pointId;
          if (pKeys.length === 0) pKeys = [pointId, 'sveltekit-frontend/' + pointId];
          if (sRefs.length === 0) sRefs = [pointId, 'sveltekit-frontend/' + pointId];

          let matched = false;

          // 1. Try direct qdrant_point_id match
          let res = await pool.query(
            `UPDATE atlas_packets
                SET som_row = $1,
                    som_col = $2,
                    som_index = $3,
                    topology = coalesce(topology, '{}'::jsonb) || $4::jsonb,
                    metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb,
                    updated_at = NOW()
              WHERE qdrant_point_id = $6
             RETURNING packet_id`,
            [
              assign.row,
              assign.col,
              somIndex,
              JSON.stringify({ som_row: assign.row, som_col: assign.col, som_index: somIndex }),
              JSON.stringify({ som_updated_at: new Date().toISOString() }),
              qdId
            ]
          );

          if (res.rowCount > 0) {
            pg_reasons.qdrant_point_id += res.rowCount;
            matched = true;
            batchUpdated += res.rowCount;
          }

          // 2. Try packet_key match
          if (!matched && pKeys.length > 0) {
            res = await pool.query(
              `UPDATE atlas_packets
                  SET som_row = $1,
                      som_col = $2,
                      som_index = $3,
                      topology = coalesce(topology, '{}'::jsonb) || $4::jsonb,
                      metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb,
                      updated_at = NOW()
                WHERE packet_key = ANY($6)
               RETURNING packet_id`,
              [
                assign.row,
                assign.col,
                somIndex,
                JSON.stringify({ som_row: assign.row, som_col: assign.col, som_index: somIndex }),
                JSON.stringify({ som_updated_at: new Date().toISOString() }),
                pKeys
              ]
            );

            if (res.rowCount > 0) {
              pg_reasons.packet_key += res.rowCount;
              matched = true;
              batchUpdated += res.rowCount;
            }
          }

          // 3. Try source_ref match
          if (!matched && sRefs.length > 0) {
            res = await pool.query(
              `UPDATE atlas_packets
                  SET som_row = $1,
                      som_col = $2,
                      som_index = $3,
                      topology = coalesce(topology, '{}'::jsonb) || $4::jsonb,
                      metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb,
                      updated_at = NOW()
                WHERE source_ref = ANY($6)
               RETURNING packet_id`,
              [
                assign.row,
                assign.col,
                somIndex,
                JSON.stringify({ som_row: assign.row, som_col: assign.col, som_index: somIndex }),
                JSON.stringify({ som_updated_at: new Date().toISOString() }),
                sRefs
              ]
            );

            if (res.rowCount > 0) {
              pg_reasons.source_ref += res.rowCount;
              matched = true;
              batchUpdated += res.rowCount;
            }
          }

          // 4. Try JSONB fallback
          if (!matched) {
            const directPKey = entry.packet_key || qdId;
            const directSRef = entry.source_ref || qdId;
            const primaryIdVal = entry.primary_id || qdId;
            res = await pool.query(
              `UPDATE atlas_packets
                  SET som_row = $1,
                      som_col = $2,
                      som_index = $3,
                      topology = coalesce(topology, '{}'::jsonb) || $4::jsonb,
                      metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb,
                      updated_at = NOW()
                WHERE payload @> jsonb_build_object('qdrant_point_id', $6::text)
                   OR metadata @> jsonb_build_object('qdrant_point_id', $6::text)
                   OR payload @> jsonb_build_object('packet_key', $7::text)
                   OR metadata @> jsonb_build_object('packet_key', $7::text)
                   OR payload @> jsonb_build_object('packetKey', $7::text)
                   OR metadata @> jsonb_build_object('packetKey', $7::text)
                   OR payload @> jsonb_build_object('source_ref', $8::text)
                   OR metadata @> jsonb_build_object('source_ref', $8::text)
                   OR payload @> jsonb_build_object('sourceRef', $8::text)
                   OR metadata @> jsonb_build_object('sourceRef', $8::text)
                   OR payload @> jsonb_build_object('primary_id', $9::text)
                   OR metadata @> jsonb_build_object('primary_id', $9::text)
               RETURNING packet_id`,
              [
                assign.row,
                assign.col,
                somIndex,
                JSON.stringify({ som_row: assign.row, som_col: assign.col, som_index: somIndex }),
                JSON.stringify({ som_updated_at: new Date().toISOString() }),
                qdId,
                directPKey,
                directSRef,
                primaryIdVal
              ]
            );

            if (res.rowCount > 0) {
              pg_reasons.jsonb_fallback += res.rowCount;
              matched = true;
              batchUpdated += res.rowCount;
            }
          }
        }
        await pool.query('COMMIT');
        const result = { rowCount: batchUpdated };
        pgUpdated += Number(result?.rowCount ?? 0);
        const expected = slice.length;
        pgNotMatched += Math.max(0, expected - Number(result?.rowCount ?? 0));
      } catch (e) {
        await pool.query('ROLLBACK');
        console.error(`❌ Postgres update failed: ${e.message}`);
        await pool.end();
        process.exit(1);
      }
      process.stdout.write(`\r  PG: ${pgUpdated} updated, ${pgNotMatched} not matched...`);
    }
    process.stdout.write('\n');
    console.log(`  ✅ Postgres: ${pgUpdated} rows updated, ${pgNotMatched} not matched\n`);

    const writebackReportPath = resolve('.', 'docs/reports/train-som-20x20-writeback.json');
    mkdirSync(resolve('.', 'docs/reports'), { recursive: true });
    const batchTotal = entries.length;
    writeFileSync(writebackReportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      total_processed: batchTotal,
      postgres: {
        updated: pgUpdated,
        notMatched: pgNotMatched,
        matchRate:
          batchTotal > 0
            ? Number(((pgUpdated / batchTotal) * 100).toFixed(2))
            : 0
      },
      reasons: pg_reasons
    }, null, 2));
    console.log(`  ✅ Reasoned writeback report saved to ${writebackReportPath}\n`);

    // Step 4.7: Cache SOM packet coordinates and cell memberships → Redis
    console.log('Step 4.7: Cache SOM coordinates → Redis');
    console.log('───────────────────────────────────────');

    const redisPassword = process.env.REDIS_PASSWORD || process.env.REDIS_PASS
      || process.env.VALKEY_PASSWORD || process.env.VALKEY_PASS || 'redis';

    const redis = new Redis({
      host:                process.env.REDIS_HOST || '127.0.0.1',
      port:                Number(process.env.REDIS_PORT || 6379),
      password:            redisPassword,
      lazyConnect:         true,
      enableOfflineQueue:  false,
      maxRetriesPerRequest: 1
    });

    let redisOk = false;
    try {
      await redis.connect();
      const pipeline = redis.pipeline();

      // Cache cell memberships: gpu:som:cell:{row}:{col} = packet IDs
      for (const [cellKey, packets] of Object.entries(cellAssignments)) {
        const [row, col] = cellKey.split(':').map(Number);
        pipeline.setex(`gpu:som:cell:${row}:${col}`, 7 * 24 * 3600, JSON.stringify(packets));
      }

      // Cache individual packet coords: gpu:som:packet:{pointId}
      for (const [pointId, assign] of Object.entries(assignments)) {
        pipeline.setex(`gpu:som:packet:${pointId}`, 7 * 24 * 3600, JSON.stringify({
          row: assign.row,
          col: assign.col,
          distance: assign.distance
        }));
      }

      await pipeline.exec();
      console.log(`  ✅ Redis cached SOM cell memberships and packet coordinates.\n`);
      redisOk = true;
    } catch (e) {
      console.warn(`  ⚠️  Redis unavailable: ${e.message} — continuing without cache`);
    } finally {
      try { await redis.quit(); } catch {}
    }

    // Step 4.9: Record SOM telemetry
    console.log('Step 4.9: Record SOM telemetry');
    console.log('──────────────────────────────');

    await pool.query(
      `INSERT INTO atlas_topology_eval_times
         (packet_key, feature_id, lane, input_dim, latent_dim, som_grid,
          som_ms, redis_ms, postgres_ms, total_ms, cache_hit, metadata)
       VALUES ($1, $2, 'som_train', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        Object.keys(assignments)[0] ?? '', null, null, LATENT_DIM, `${SOM_GRID_WIDTH}x${SOM_GRID_HEIGHT}`,
        t_som, null, null, t_som, redisOk,
        JSON.stringify({
          packet_count: Object.keys(assignments).length,
          occupied_cells: Object.keys(cellAssignments).length,
          total_cells: codebook.length,
          pg_updated: pgUpdated,
          pg_skipped: pgNotMatched
        })
      ]
    ).catch(e => console.warn('topology_eval row failed:', e.message));

    // Step 5: Seed Neo4j SIMILAR_TOPOLOGY edges from grid adjacency
    console.log('Step 5: Seed Neo4j SIMILAR_TOPOLOGY edges');
    console.log('─────────────────────────────────────────');

    let adjacencyEdgeCount = 0;
    const adjacencyEdgeSample = [];
    for (const [cellKey, packets] of Object.entries(cellAssignments)) {
      const [row, col] = cellKey.split(':').map(Number);

      // Check adjacent cells (8-neighborhood)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const adjRow = row + dr;
          const adjCol = col + dc;
          if (adjRow < 0 || adjRow >= SOM_GRID_HEIGHT || adjCol < 0 || adjCol >= SOM_GRID_WIDTH) continue;

          const adjCellKey = `${adjRow}:${adjCol}`;
          const adjPackets = cellAssignments[adjCellKey] || [];

          // Create edges from packets in current cell to packets in adjacent cells
          for (const p1 of packets) {
            for (const p2 of adjPackets) {
              adjacencyEdgeCount++;
              if (adjacencyEdgeSample.length < 100) {
                adjacencyEdgeSample.push({
                  source: p1,
                  target: p2,
                  distance_hops: 1,
                  edge_type: 'SIMILAR_TOPOLOGY'
                });
              }
            }
          }
        }
      }
    }

    console.log(`Counted ${adjacencyEdgeCount} candidate SIMILAR_TOPOLOGY edges`);
    console.log(`✅ Retained ${adjacencyEdgeSample.length} sample edges; live graph writes stay in the GDS lane\n`);

    // Step 6: Validate
    console.log('Step 6: Validate SOM');
    console.log('────────────────────');

    const samples = Object.entries(assignments).slice(0, 5);
    console.log('Sample SOM assignments:');
    samples.forEach(([pointId, assign]) => {
      console.log(`  Point ${pointId}: Cell (${assign.row}, ${assign.col}), distance = ${assign.distance}`);
    });

    console.log('\n✅ SOM training complete');
    console.log('   Grid: 20×20 (400 cells)');
    console.log('   Assignments: ' + Object.keys(assignments).length + ' packets');
    console.log('   Next step: Seed Neo4j edges + run topology-aware reranking\n');
  } else {
    const validVectors = Object.values(latentIndex).filter((entry) =>
      Array.isArray(entry?.latent_64) && entry.latent_64.length === LATENT_DIM
    ).length;
    const addressableVectors = Object.values(latentIndex).filter((entry) =>
      Array.isArray(entry?.latent_64) &&
      entry.latent_64.length === LATENT_DIM &&
      entry.kind !== 'directory-cluster' &&
      entry.ledger_type !== 'legacy_qdrant_only' &&
      entry.canonical !== false &&
      entry.payload_unmatched !== true &&
      Boolean(entry.packet_key || entry.source_ref)
    ).length;
    console.log(`🔍 DRY-RUN: ${validVectors}/${packetCount} valid latent vectors`);
    console.log(`   Addressable packet vectors: ${addressableVectors}`);
    console.log(`   Native addon: ${existsSync(ADDON_PATH) ? 'present' : 'missing'}`);
    console.log(`   Would train ${SOM_GRID_WIDTH}x${SOM_GRID_HEIGHT} SOM for ${SOM_ITERATIONS} iterations`);
    console.log('   Use --apply to train and persist; add --allow-cpu only when CUDA/native training is unavailable.\n');
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
