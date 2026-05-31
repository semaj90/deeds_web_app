#!/usr/bin/env node
/*
 Create Qdrant payload indexes for Task Semantic Packet fields.

 Usage:
  node scripts/qdrant/create-payload-indexes.mjs <collection> [--url <QDRANT_URL>] [--key <QDRANT_API_KEY>]

 This script attempts to create the most useful payload indexes and will
 tolerate missing endpoints; operator can edit/extend the index specs as needed.
*/

import fetch from 'node-fetch';
import process from 'process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node create-payload-indexes.mjs <collection> [--url <QDRANT_URL>] [--key <QDRANT_API_KEY>]');
  process.exit(1);
}

const collection = args[0];
const urlArg = (() => {
  const i = args.indexOf('--url');
  return i >= 0 ? args[i+1] : process.env.QDRANT_URL || 'http://localhost:6333';
})();
const apiKey = (() => {
  const i = args.indexOf('--key');
  return i >= 0 ? args[i+1] : process.env.QDRANT_API_KEY || '';
})();

const base = urlArg.replace(/\/$/, '');

const indexSpecs = [
  // Simple keyword/string fields
  { field_name: 'workspace_id', field_schema: { type: 'keyword' } },
  { field_name: 'workspace_task_id', field_schema: { type: 'integer' } },
  { field_name: 'feature_id', field_schema: { type: 'integer' } },
  { field_name: 'point_kind', field_schema: { type: 'keyword' } },
  { field_name: 'cluster_id', field_schema: { type: 'keyword' } },
  { field_name: 'centroid_id', field_schema: { type: 'keyword' } },
  { field_name: 'status', field_schema: { type: 'keyword' } },
  { field_name: 'agent_pickup_ready', field_schema: { type: 'boolean' } },
  { field_name: 'observed_at', field_schema: { type: 'date' } },
  { field_name: 'updated_at', field_schema: { type: 'date' } },
  { field_name: 'deleted', field_schema: { type: 'boolean' } },
  // arrays
  { field_name: 'semantic_path', field_schema: { type: 'keyword[]' } }
];

async function createIndex(spec) {
  const endpoint = `${base}/collections/${encodeURIComponent(collection)}/indexes`;
  const body = spec;
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  try {
    console.log('POST', endpoint, JSON.stringify(body));
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`Warning creating index ${spec.field_name}: ${res.status} ${text}`);
    } else {
      console.log(`Created index ${spec.field_name}: ${text}`);
    }
  } catch (err) {
    console.error(`Failed to create index ${spec.field_name}:`, err.message || err);
  }
}

async function main() {
  console.log(`Creating payload indexes for collection=${collection} at ${base}`);
  for (const s of indexSpecs) {
    await createIndex(s);
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
