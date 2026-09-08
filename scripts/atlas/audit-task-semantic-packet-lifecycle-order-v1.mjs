import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE = resolve(ROOT, 'sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts');
const REPORT = resolve(ROOT, 'docs/reports/task-semantic-packet-lifecycle-order-v1.json');

const source = readFileSync(SOURCE, 'utf8');
const start = source.indexOf('export async function createTaskSemanticPacket');
const end = source.indexOf('\nexport ', start + 10);
const body = source.slice(start, end === -1 ? source.length : end);

const markers = [
  ['vectorGuard', 'assertCanonicalSemantic768Vector(embedding)'],
  ['postgresInsert', '.insert(taskSemanticPackets)'],
  ['qdrantUpsert', 'await qdrantManager.upsert({'],
  ['qdrantCollection', 'collection: TASK_COLLECTION_NAME'],
  ['qdrantVectorPayload', 'buildVectorPayload(TASK_COLLECTION_NAME, embedding)'],
];

const positions = Object.fromEntries(markers.map(([name, marker]) => [name, body.indexOf(marker)]));
const present = Object.values(positions).every((position) => position >= 0);
const postgresBeforeQdrant = present && positions.postgresInsert < positions.qdrantUpsert;
const guardBeforeWrite = present && positions.vectorGuard < positions.postgresInsert;
const qdrantUsesCanonicalCollection = present && positions.qdrantCollection > positions.qdrantUpsert;
const qdrantUsesNamedPayload = present && positions.qdrantVectorPayload > positions.qdrantUpsert;

const report = {
  schema: 'atlas.task-semantic-packet-lifecycle-order.v1',
  generatedAt: new Date().toISOString(),
  sourcePath: 'sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts',
  readOnly: true,
  productionWritesPerformed: false,
  markers: Object.fromEntries(markers.map(([name, marker]) => [name, { marker, offset: positions[name] }])),
  checks: {
    allMarkersPresent: present,
    vectorGuardBeforePostgresInsert: guardBeforeWrite,
    postgresCanonicalInsertBeforeQdrantUpsert: postgresBeforeQdrant,
    qdrantUsesCanonicalCollectionConstant: qdrantUsesCanonicalCollection,
    qdrantUsesNamedSemanticPayload: qdrantUsesNamedPayload,
  },
  status: present && guardBeforeWrite && postgresBeforeQdrant && qdrantUsesCanonicalCollection && qdrantUsesNamedPayload
    ? 'PROVEN_SOURCE_ORDER'
    : 'BLOCKED_SOURCE_ORDER',
};

mkdirSync(resolve(ROOT, 'docs/reports'), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

