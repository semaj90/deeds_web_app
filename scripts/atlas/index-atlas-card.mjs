import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'sveltekit-frontend/.env') });

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

export async function indexAtlasCard(card) {
  // Redis hot memory
  await redis.set(
    `atlas:card:${card.file}`,
    JSON.stringify(card),
    "EX",
    86400
  );

  // Postgres durable
  await pool.query(`
    INSERT INTO atlas_cards (file, type, data)
    VALUES ($1, $2, $3)
    ON CONFLICT (file) DO UPDATE SET data = EXCLUDED.data
  `, [card.file, card.type, card]);

  // (Phase 6f) Qdrant later
}
