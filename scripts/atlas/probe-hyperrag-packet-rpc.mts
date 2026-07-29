#!/usr/bin/env node

import process from 'node:process';
import { hyperragPacketRpc } from '../../sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts';

async function main(): Promise<void> {
  const query = process.argv[2] || '';
  const limit = Number.parseInt(process.argv[3] || '1', 10) || 1;
  const timeoutMs = Number.parseInt(process.argv[4] || '15000', 10) || 15000;

  const result = await Promise.race([
    hyperragPacketRpc({
      query,
      limit,
      useExactMatchCache: true,
      recordTelemetry: false,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`HyperRAG probe timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
