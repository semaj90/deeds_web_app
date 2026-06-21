#!/usr/bin/env node
/**
 * scripts/atlas/langextract-enrichment-worker.mjs
 *
 * Scans `parent_atlas_documents`, resolves file contents on disk,
 * extracts legal/technical entities (citations, statutes, cases, person/org tags),
 * and saves them back to Postgres payloads under `derived_enrichment.entities`.
 *
 * Usage:
 *   node scripts/atlas/langextract-enrichment-worker.mjs
 *   node scripts/atlas/langextract-enrichment-worker.mjs --limit=50
 *   node scripts/atlas/langextract-enrichment-worker.mjs --dry-run
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;

function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const ENV = loadEnv();
const DATABASE_URL = ENV.DATABASE_URL ||
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

// ── Native Entity Extraction Patterns (Self-contained for speed) ──

const PATTERNS = [
  // Citations: Volume Reporter Page (Year)
  {
    type: 'citation',
    re: /\b(\d{1,4})\s+(U\.?S\.?|F\.?\d?d?|S\.?\s*Ct\.?|L\.?\s*Ed\.?\s*\d?d?|N\.?E\.?\d?d?|N\.?W\.?\d?d?|S\.?E\.?\d?d?|S\.?W\.?\d?d?|P\.?\d?d?|A\.?\d?d?|Cal\.?\s*(?:App\.?)?\s*\d?d?)\s+(\d{1,5})(?:\s*\((\d{4})\))?/g,
    confidence: 0.95,
  },
  // Statute: title U.S.C. § number
  {
    type: 'statute',
    re: /\b(\d{1,3})\s+(U\.?S\.?C\.?|C\.?F\.?R\.?)\s*§+\s*(\d+(?:[a-z](?:-\d+)?)?(?:\([a-z0-9]+\))*)/gi,
    confidence: 0.95,
  },
  // Case name: X v. Y
  {
    type: 'case_name',
    re: /\b([A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3})\s+v\.?\s+([A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3})\b/g,
    confidence: 0.85,
  },
  // Court details
  {
    type: 'court',
    re: /\b(?:U\.?S\.?\s+)?Supreme\s+Court|(?:\d+(?:st|nd|rd|th)|D\.C\.|First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Federal)\s+Cir(?:\.|cuit)?|[NSEWMnsewm]?\.?D\.\s*[A-Z][a-z]*\.|Court\s+of\s+Appeals/g,
    confidence: 0.80,
  },
  // Monetary details
  {
    type: 'monetary',
    re: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b/gi,
    confidence: 0.90,
  },
  // Key Drizzle/DB structural entities
  {
    type: 'database_schema',
    re: /\b(?:pgTable|drizzle|postgres|vector|varchar|integer|timestamp|primaryKey|jsonb|text)\b/g,
    confidence: 0.90
  },
  // Key UI/route structural entities
  {
    type: 'route_handler',
    re: /\b(?:RequestHandler|POST|GET|page\.svelte|server\.ts|\+server\.ts|\+page\.svelte)\b/g,
    confidence: 0.90
  }
];

function extractEntities(text) {
  const out = [];
  const seen = new Set();

  for (const { type, re, confidence } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const key = `${type}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        type,
        text: m[0],
        start,
        end,
        confidence
      });
      if (out.length > 100) break; // cap per file
    }
  }
  return out;
}

function resolveFile(sourceRef) {
  const clean = sourceRef.replace(/^sveltekit-frontend\//, '').replace(/^file:\/\/\/?/, '');
  const paths = [
    path.resolve(ROOT, clean),
    path.resolve(ROOT, 'sveltekit-frontend', clean)
  ];
  for (const p of paths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

async function main() {
  console.log(`[langextract:worker] Starting (dry_run=${DRY_RUN} limit=${LIMIT ?? 'all'})...`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Select documents to enrich
    let query = `SELECT id, source_ref FROM parent_atlas_documents ORDER BY id ASC`;
    if (LIMIT) query += ` LIMIT ${LIMIT}`;

    const res = await pool.query(query);
    console.log(`[langextract:worker] Found ${res.rows.length} documents to process.`);

    let enriched = 0;
    let skipped = 0;

    for (const doc of res.rows) {
      const filePath = resolveFile(doc.source_ref);
      if (!filePath) {
        skipped++;
        continue;
      }

      const text = fs.readFileSync(filePath, 'utf8');
      if (!text.trim()) {
        skipped++;
        continue;
      }

      const entities = extractEntities(text);

      if (entities.length > 0) {
        if (!DRY_RUN) {
          // Update parent_atlas_documents.payload.derived_enrichment.entities
          await pool.query(
            `UPDATE parent_atlas_documents
             SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
               'derived_enrichment',
               COALESCE(payload->'derived_enrichment', '{}'::jsonb) || jsonb_build_object('entities', $1::jsonb)
             )
             WHERE id = $2`,
            [JSON.stringify(entities), doc.id]
          );

          // Update atlas_packets.metadata.derived_enrichment.entities
          await pool.query(
            `UPDATE atlas_packets
             SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'derived_enrichment',
               COALESCE(metadata->'derived_enrichment', '{}'::jsonb) || jsonb_build_object('entities', $1::jsonb)
             )
             WHERE source_ref = $2 OR source_ref = $3`,
            [JSON.stringify(entities), doc.source_ref, `sveltekit-frontend/${doc.source_ref}`]
          );

          // Update nes_chrom_packets.metadata.derived_enrichment.entities
          await pool.query(
            `UPDATE nes_chrom_packets
             SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'derived_enrichment',
               COALESCE(metadata->'derived_enrichment', '{}'::jsonb) || jsonb_build_object('entities', $1::jsonb)
             )
             WHERE source_ref = $2 OR source_ref = $3`,
            [JSON.stringify(entities), doc.source_ref, `sveltekit-frontend/${doc.source_ref}`]
          );
        } else {
          console.log(`[dry-run] Would enrich ${doc.source_ref} with ${entities.length} entities.`);
        }
        enriched++;
      } else {
        skipped++;
      }
    }

    console.log(`[langextract:worker] Completed. Enriched: ${enriched}, Skipped: ${skipped}`);

  } catch (err) {
    console.error(`[langextract:worker] Fatal:`, err);
  } finally {
    await pool.end();
  }
}

main();
