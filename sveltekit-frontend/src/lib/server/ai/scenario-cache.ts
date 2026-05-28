import { pool } from '$lib/server/db/client';

type UpsertScenarioInput = {
  source_ref: string;
  content_hash: string;
  name?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  embedding?: number[] | null;
};

export async function upsertScenario(input: UpsertScenarioInput) {
  const { source_ref, content_hash, name = null, description = null, metadata = null, embedding = null } = input;
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO scenarios (source_ref, content_hash, name, description, metadata, embedding, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5, $6, now(), now())
       ON CONFLICT (source_ref, content_hash) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, scenarios.name),
         description = COALESCE(EXCLUDED.description, scenarios.description),
         metadata = COALESCE(EXCLUDED.metadata, scenarios.metadata),
         embedding = COALESCE(EXCLUDED.embedding, scenarios.embedding),
         updated_at = now()
       RETURNING id, created_at, updated_at;
      `,
      [source_ref, content_hash, name, description, metadata ? JSON.stringify(metadata) : null, embedding]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

export async function getScenarioById(id: string) {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT * FROM scenarios WHERE id = $1 LIMIT 1`, [id]);
    return res.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function findScenarioBySourceRefAndHash(source_ref: string, content_hash: string) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT * FROM scenarios WHERE source_ref = $1 AND content_hash = $2 LIMIT 1`,
      [source_ref, content_hash]
    );
    return res.rows[0] ?? null;
  } finally {
    client.release();
  }
}
