import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';
async function main() {
  loadRuntimeEnv({ cwd: process.cwd(), mode: 'development' });
  console.log('MINIO_ENDPOINT env (post-override):', process.env.MINIO_ENDPOINT, process.env.MINIO_PORT);
  console.log('SEAWEED_S3_PORT:', process.env.SEAWEED_S3_PORT, 'SEAWEED_ENDPOINT:', process.env.SEAWEED_ENDPOINT);
  const { getMinioClient } = await import('../../src/lib/server/minio-client.js');
  const client = getMinioClient();
  const stream = client.listObjectsV2('atlas-web-sources', '', true);
  const objs: any[] = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (o: any) => objs.push(o));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  console.log('Objects in atlas-web-sources bucket:', JSON.stringify(objs, null, 2));
}
main().catch(e => { console.error('FAILED:', e); process.exit(1); });
