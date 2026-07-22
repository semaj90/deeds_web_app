#!/usr/bin/env node

/**
 * Enrich Qdrant Payloads with SOM Coordinates
 *
 * Updates codebase_chunks_768 Qdrant collection with som_cell_x, som_cell_y
 * from Postgres atlas_packets.som_row, som_col.
 *
 * Usage:
 *   npx tsx scripts/atlas/enrich-qdrant-som-payload.mts --dry-run
 *   npx tsx scripts/atlas/enrich-qdrant-som-payload.mts --apply
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import fetch from 'node-fetch';

interface QdrantPoint {
  id: string;
  packet_key: string;
  som_cell_x: number;
  som_cell_y: number;
}

interface QdrantUpdateResponse {
  status: 'ok' | 'error';
  result?: { updated: number };
  error?: string;
}

class QdrantSomEnricher {
  private qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  private collection = 'codebase_chunks_768';

  async enrichAll(dryRun = false): Promise<{ updated: number; failed: number }> {
    console.log('═'.repeat(80));
    console.log('ENRICH QDRANT PAYLOADS WITH SOM COORDINATES');
    console.log('═'.repeat(80));
    console.log();

    // Step 1: Verify Qdrant connection
    console.log('▶ Step 1: Verifying Qdrant connection...');
    const healthy = await this.checkQdrantHealth();
    if (!healthy) {
      console.log('❌ Qdrant connection failed');
      return { updated: 0, failed: 0 };
    }
    console.log(`✅ Connected to Qdrant at ${this.qdrantUrl}`);
    console.log();

    // Step 2: Load Postgres SOM coordinates
    console.log('▶ Step 2: Loading SOM coordinates from Postgres...');
    const points = await this.loadSomCoordinates();
    console.log(`✅ Loaded ${points.length} coordinates`);
    console.log();

    // Step 3: Batch update Qdrant payloads
    console.log('▶ Step 3: Updating Qdrant payloads...');
    const { updated, failed } = await this.batchUpdateQdrant(points, dryRun);
    console.log(`✅ Updated ${updated} points, ${failed} failed`);
    console.log();

    // Step 4: Verify update
    if (!dryRun) {
      console.log('▶ Step 4: Verifying updates...');
      const verified = await this.verifyUpdates(points.slice(0, 10));
      console.log(`✅ Verified ${verified} sample updates`);
    } else {
      console.log('▶ Step 4: (Dry-run) Would verify updates');
    }
    console.log();

    this.printSummary(updated, failed);
    return { updated, failed };
  }

  private async checkQdrantHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.qdrantUrl}/health`, { timeout: 5000 });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async loadSomCoordinates(): Promise<QdrantPoint[]> {
    const result = await db.execute(
      sql`SELECT
            ap.packet_key,
            ap.som_row,
            ap.som_col,
            ap.kmeans_cluster
          FROM atlas_packets ap
          WHERE ap.kmeans_cluster IS NOT NULL
          LIMIT 10000`
    );

    return (result.rows as any[]).map((row) => ({
      id: row.packet_key, // Use packet_key as point ID
      packet_key: row.packet_key,
      som_cell_x: row.som_row,
      som_cell_y: row.som_col,
    }));
  }

  private async batchUpdateQdrant(
    points: QdrantPoint[],
    dryRun: boolean
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    // Batch size: 100 points per request
    const batchSize = 100;

    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);

      if (dryRun) {
        console.log(`  [DRY-RUN] Would update batch ${Math.floor(i / batchSize) + 1} (${batch.length} points)`);
        updated += batch.length;
      } else {
        // Call Qdrant PUT /points API to update payloads
        const payload = {
          points: batch.map((p) => ({
            id: p.id,
            payload: {
              som_cell_x: p.som_cell_x,
              som_cell_y: p.som_cell_y,
            },
          })),
        };

        try {
          const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 30000,
          });

          const data = (await res.json()) as QdrantUpdateResponse;
          if (data.status === 'ok' && data.result?.updated) {
            updated += data.result.updated;
          } else {
            failed += batch.length;
          }
        } catch (err) {
          failed += batch.length;
          console.error(`  Batch ${Math.floor(i / batchSize) + 1} failed:`, err);
        }
      }
    }

    return { updated, failed };
  }

  private async verifyUpdates(samplePoints: QdrantPoint[]): Promise<number> {
    let verified = 0;

    for (const point of samplePoints) {
      try {
        const res = await fetch(
          `${this.qdrantUrl}/collections/${this.collection}/points/${encodeURIComponent(point.id)}`,
          { timeout: 5000 }
        );

        if (res.ok) {
          const data = (await res.json()) as any;
          const payload = data.result?.point?.payload;

          if (
            payload &&
            payload.som_cell_x === point.som_cell_x &&
            payload.som_cell_y === point.som_cell_y
          ) {
            verified++;
          }
        }
      } catch {
        // Verification failed, skip
      }
    }

    return verified;
  }

  private printSummary(updated: number, failed: number) {
    console.log('═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    console.log();
    console.log(`Updated: ${updated}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success rate: ${updated > 0 ? ((updated / (updated + failed)) * 100).toFixed(2) : 0}%`);
    console.log();
    console.log(`Collection: ${this.collection}`);
    console.log(`Payload fields added: som_cell_x, som_cell_y`);
    console.log();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const enricher = new QdrantSomEnricher();
  const result = await enricher.enrichAll(dryRun);

  console.log(`✅ Enrichment ${dryRun ? 'complete (dry-run)' : 'complete'}`);
  console.log(`   Updated: ${result.updated}, Failed: ${result.failed}`);
  console.log();

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
