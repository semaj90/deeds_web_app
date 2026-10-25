import pg from 'pg';

const client = new pg.Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db'
});

async function run() {
  client.on('error', (err) => console.error('CLIENT EVENT ERROR:', err));
  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully!');
    const q = `select "users"."id", "users"."email", "users"."hashed_password", "users"."name", "users"."first_name", "users"."last_name", "users"."role", "users"."is_active", "users"."avatar_url", "users"."has_completed_onboarding", "users"."onboarding_step", "users"."created_at", "users"."updated_at", "sessions"."id", "sessions"."user_id", "sessions"."expires_at" from "sessions" inner join "users" on "sessions"."user_id" = "users"."id" where "sessions"."id" = $1`;
    const res = await client.query(q, ['v2qdnp3sztvhhebjmybbo6yig77qvbmbhfxwujpa']);
    console.log('Query result:', res.rows);
  } catch (err) {
    console.error('ERROR CATCH:', err);
  } finally {
    await client.end();
  }
}

run();
