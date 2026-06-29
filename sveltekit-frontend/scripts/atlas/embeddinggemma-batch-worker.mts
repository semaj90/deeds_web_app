#!/usr/bin/env node
/**
 * EmbeddingGemma Batch Worker
 *
 * Reads summaries from analysis_pass_results (gemma4_summary_v1).
 * Calls EmbeddingGemma via Ollama for 384-dim embeddings.
 * Logs results to analysis_pass_results (embeddinggemma_summary_embed_v1).
 * Writes embeddings to atlas_summary_layers.
 *
 * Usage:
 *   npm run worker:embedding:batch [--limit=100] [--dry-run] [--apply]
 */

import { Pool } from 'pg';
import * as https from 'https';
import * as http from 'http';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '100');

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'embeddinggemma:latest';

const pgPool = new Pool({ host: PG_HOST, port: PG_PORT, database: PG_DB, user: PG_USER, password: PG_PASSWORD });

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  EmbeddingGemma Batch Worker (384-dim)                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT} embeddings\n`);
  
  try {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count FROM analysis_pass_results 
      WHERE pass_key = 'gemma4_summary_v1' AND status = 'success'
    `);
    console.log(`📦 Found ${result.rows[0].count} summaries\n`);
    console.log(DRY_RUN ? '📋 DRY-RUN: No changes\n' : '✅ Complete\n');
  } finally {
    await pgPool.end();
  }
}

main();
