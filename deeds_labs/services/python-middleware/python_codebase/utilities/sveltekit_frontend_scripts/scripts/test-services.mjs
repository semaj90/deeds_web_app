import { createClient } from 'redis';
import { Client as PgClient } from 'pg';
import axios from 'axios';

const env = process.env;

async function testRedis() {
  const url = env.REDIS_URL ?? 'redis://localhost:6379';
  const client = createClient({ url, username: env.REDIS_USERNAME, password: env.REDIS_PASSWORD });
  client.on('error', (err) => {
    console.error('❌ Redis error', err.message);
  });
  try {
    await client.connect();
    await client.ping();
    console.log('✅ Redis OK');
  } catch (error) {
    console.error('❌ Redis fail', error instanceof Error ? error.message : String(error));
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

async function testPostgres() {
  const connectionString =
    env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
  const client = new PgClient({ connectionString });
  try {
    await client.connect();
    const res = await client.query('SELECT NOW() AS ts');
    console.log('✅ Postgres OK', res.rows[0]?.ts ?? '');
  } catch (error) {
    console.error('❌ Postgres fail', error instanceof Error ? error.message : String(error));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function testQdrant() {
  const baseUrl = env.QDRANT_URL ?? 'http://localhost:6333';
  try {
    const response = await axios.get(`${baseUrl.replace(/\/+$/, '')}/collections`, {
      timeout: 3000,
    });
    console.log('✅ Qdrant OK', response.data?.collections?.length ?? 'response received');
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? error.message
          : String(error);
    console.error('❌ Qdrant fail', message);
  }
}

async function testMinIO() {
  const endpoint = env.MINIO_ENDPOINT ?? 'localhost:9000';
  const protocol = endpoint.startsWith('http') ? '' : 'http://';
  const url = `${protocol}${endpoint.replace(/\/+$/, '')}/minio/health/ready`;
  try {
    const response = await axios.get(url, { timeout: 3000 });
    console.log('✅ MinIO OK', response.status);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? error.message
          : String(error);
    console.error('❌ MinIO fail', message);
  }
}

async function main() {
  await testRedis();
  await testPostgres();
  await testQdrant();
  await testMinIO();
}

main().catch((error) => {
  console.error('Service tests crashed', error);
  process.exitCode = 1;
});

