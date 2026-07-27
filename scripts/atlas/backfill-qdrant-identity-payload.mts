#!/usr/bin/env node

import path from 'node:path';
import dotenv from 'dotenv';
import { Client as PgClient } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';

const REPO_ROOT = process.cwd();
for (const envFile of [
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'),
]) {
  dotenv.config({ path: envFile, override: false });
}

const COLLECTIONS = ['codebase_chunks_384_hybrid', 'codebase_chunks_768'] as const;

type Options = {
  packetKey: string;
  apply: boolean;
};

type PacketRow = {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  workspace_id: string;
  ontology_version: string | null;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  let packetKey = '';
  let apply = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--packet-key') {
      packetKey = args[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (!arg.startsWith('--') && !packetKey) {
      packetKey = arg;
    }
  }

  if (!packetKey.trim()) {
    throw new Error('Missing packet key. Use --packet-key <value>.');
  }

  return {
    packetKey: packetKey.trim(),
    apply,
  };
}

async function fetchCanonicalPacket(packetKey: string): Promise<PacketRow> {
  const client = new PgClient(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST || '127.0.0.1',
          port: Number(process.env.DB_PORT || 5434),
          database: process.env.DB_NAME || 'legal_ai_db',
          user: process.env.DB_USER || 'legal_admin',
          password: String(process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? 'postgres'),
        }
  );

  await client.connect();
  try {
    const result = await client.query<PacketRow>(
      `SELECT packet_key, source_ref, feature_id, workspace_id, ontology_version
       FROM atlas_packets
       WHERE packet_key = $1
       LIMIT 1`,
      [packetKey]
    );

    if (result.rows.length === 0) {
      throw new Error(`No Postgres atlas_packets row found for packet_key=${packetKey}`);
    }

    const row = result.rows[0];
    if (!row.workspace_id) {
      throw new Error(`Postgres row missing workspace_id for packet_key=${packetKey}`);
    }
    if (!row.ontology_version) {
      throw new Error(`Postgres row missing ontology_version for packet_key=${packetKey}`);
    }

    return row;
  } finally {
    await client.end();
  }
}

async function backfillPacket(packet: PacketRow, apply: boolean): Promise<void> {
  const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
    apiKey: process.env.QDRANT_API_KEY,
    timeout: 10000,
    checkCompatibility: false,
  });

  const patchPayload = {
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    workspace_id: packet.workspace_id,
    ontology_version: packet.ontology_version,
    payload_backfilled_at: new Date().toISOString(),
    payload_backfill_source: 'backfill-qdrant-identity-payload-v1',
  };

  for (const collection of COLLECTIONS) {
    const result = await qdrant.scroll(collection, {
      filter: {
        must: [{ key: 'packet_key', match: { value: packet.packet_key } }],
      },
      limit: 8,
      with_payload: true,
      with_vector: false,
    });

    const points = result.points ?? [];
    console.log(`Collection ${collection}: matched ${points.length} point(s)`);

    if (points.length === 0) {
      continue;
    }

    const pointIds = points.map((point) => point.id);

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            collection,
            pointIds,
            payload: patchPayload,
          },
          null,
          2
        )
      );
      continue;
    }

    await qdrant.setPayload(collection, {
      points: pointIds,
      payload: patchPayload,
      wait: true,
    });

    console.log(`Patched ${pointIds.length} point(s) in ${collection}`);
  }
}

async function main() {
  const { packetKey, apply } = parseArgs();
  const packet = await fetchCanonicalPacket(packetKey);

  console.log(`Packet: ${packet.packet_key}`);
  console.log(`Workspace: ${packet.workspace_id}`);
  console.log(`Ontology: ${packet.ontology_version}`);
  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);

  await backfillPacket(packet, apply);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
