#!/usr/bin/env node

/**
 * Phase 108: Observation Loader
 *
 * Loads unresolved packet observations from CSV/JSON into atlas_unknown_observations.
 * Validates packet_key uniqueness per observation_type.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-108-observation-loader.mts --dry-run --source observations.csv
 *   npx tsx scripts/atlas/phase-108-observation-loader.mts --apply --source observations.json
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

const ObservationSchema = z.object({
  packet_key: z.string().min(1),
  observation_type: z.enum(['missing-source', 'ambiguous-identity', 'partial-feature']),
  assertion: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  constraint_list: z.array(z.object({
    type: z.string(),
    rule: z.string(),
    priority: z.number(),
  })).default([]),
});

type Observation = z.infer<typeof ObservationSchema>;

class ObservationLoader {
  private observations: Observation[] = [];
  private errors: Array<{ row: number; error: string }> = [];

  async loadAll(sourcePath: string, dryRun = false): Promise<{ loaded: number; failed: number }> {
    console.log('═'.repeat(80));
    console.log('PHASE 108: OBSERVATION LOADER');
    console.log('═'.repeat(80));
    console.log();

    // Step 1: Load and validate observations
    console.log('▶ Step 1: Loading and validating observations...');
    const validCount = await this.loadObservations(sourcePath);
    console.log(`✅ Loaded ${validCount} valid observations`);
    if (this.errors.length > 0) {
      console.log(`⚠️ Validation errors: ${this.errors.length}`);
      this.errors.slice(0, 5).forEach((e) => {
        console.log(`  Row ${e.row}: ${e.error}`);
      });
    }
    console.log();

    // Step 2: Check uniqueness
    console.log('▶ Step 2: Validating uniqueness...');
    const uniqueCount = this.validateUniqueness();
    console.log(`✅ ${uniqueCount} observations pass uniqueness check`);
    console.log();

    // Step 3: Persist to Postgres
    console.log('▶ Step 3: Persisting to Postgres...');
    const { loaded, failed } = await this.persistObservations(dryRun);
    console.log(`✅ Persisted ${loaded} observations`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}`);
    }
    console.log();

    this.printSummary(loaded, failed);
    return { loaded, failed };
  }

  private async loadObservations(sourcePath: string): Promise<number> {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const ext = path.extname(sourcePath).toLowerCase();

    let records: any[] = [];
    if (ext === '.csv') {
      records = this.parseCSV(content);
    } else if (ext === '.json') {
      records = JSON.parse(content);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }

    for (let i = 0; i < records.length; i++) {
      try {
        const validated = ObservationSchema.parse(records[i]);
        this.observations.push(validated);
      } catch (err) {
        this.errors.push({
          row: i + 1,
          error: err instanceof z.ZodError ? err.errors[0].message : String(err),
        });
      }
    }

    return this.observations.length;
  }

  private parseCSV(content: string): any[] {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());

    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const obj: any = {};

      headers.forEach((h, i) => {
        if (h === 'constraint_list') {
          obj[h] = JSON.parse(values[i] || '[]');
        } else if (h === 'confidence') {
          obj[h] = parseFloat(values[i]) || 0.5;
        } else {
          obj[h] = values[i];
        }
      });

      return obj;
    });
  }

  private validateUniqueness(): number {
    const seen = new Map<string, boolean>();
    let unique = 0;

    for (const obs of this.observations) {
      const key = `${obs.packet_key}|${obs.observation_type}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        unique++;
      }
    }

    return unique;
  }

  private async persistObservations(dryRun: boolean): Promise<{ loaded: number; failed: number }> {
    let loaded = 0;
    let failed = 0;

    const seen = new Set<string>();

    for (const obs of this.observations) {
      const key = `${obs.packet_key}|${obs.observation_type}`;
      if (seen.has(key)) {
        failed++;
        continue;
      }
      seen.add(key);

      if (dryRun) {
        loaded++;
      } else {
        try {
          await db.execute(
            sql`INSERT INTO atlas_unknown_observations
                (packet_key, observation_type, assertion, confidence, constraint_list, created_at)
                VALUES
                (${obs.packet_key}, ${obs.observation_type}, ${obs.assertion}, ${obs.confidence}, ${JSON.stringify(obs.constraint_list)}, ${Math.floor(Date.now() / 1000)})
                ON CONFLICT DO NOTHING`
          );
          loaded++;
        } catch (err) {
          failed++;
          console.error(`Failed to insert ${obs.packet_key}:`, err);
        }
      }
    }

    return { loaded, failed };
  }

  private printSummary(loaded: number, failed: number) {
    console.log('═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    console.log();
    console.log(`Total observations processed: ${this.observations.length}`);
    console.log(`Persisted: ${loaded}`);
    console.log(`Failed: ${failed}`);
    console.log(`Validation errors: ${this.errors.length}`);
    console.log();

    const typeCount = new Map<string, number>();
    for (const obs of this.observations) {
      typeCount.set(obs.observation_type, (typeCount.get(obs.observation_type) || 0) + 1);
    }

    console.log('Observation types:');
    for (const [type, count] of typeCount) {
      console.log(`  ${type}: ${count}`);
    }
    console.log();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sourceArg = args.find((arg) => arg.startsWith('--source=')) || args[args.indexOf('--source') + 1];

  if (!sourceArg) {
    console.error('❌ Missing --source argument');
    process.exit(1);
  }

  const source = sourceArg.replace('--source=', '');

  const loader = new ObservationLoader();
  const result = await loader.loadAll(source, dryRun);

  console.log(`✅ Load ${dryRun ? 'complete (dry-run)' : 'complete'}`);
  console.log(`   Loaded: ${result.loaded}, Failed: ${result.failed}`);
  console.log();

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
