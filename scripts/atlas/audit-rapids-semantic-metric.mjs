#!/usr/bin/env node
/**
 * Static red/green gate for canonical semantic_768 GPU math.
 *
 * This intentionally fails while atlas_rapids_sidecar.py uses cuVS defaults or
 * explicit sqeuclidean for semantic_768. Do not weaken the gate to make a smoke
 * test green: the canonical retrieval space is cosine.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'python', 'atlas_rapids_sidecar.py');
const source = await fs.readFile(target, 'utf8');

const gates = {
  CUVS_EXACT_EXPLICIT_COSINE:
    /brute_force\.build\([^\n]+metric\s*=\s*["']cosine["']/.test(source),
  CAGRA_EXPLICIT_COSINE:
    /cagra_neighbors\.IndexParams\([\s\S]*?metric\s*=\s*["']cosine["']/.test(source),
  NO_SEMANTIC_SQEUCLIDEAN:
    !/metric\s*=\s*["']sqeuclidean["']/.test(source),
  SEMANTIC_DIMENSION_768:
    /_EXPECTED_DIMENSION\s*=\s*768/.test(source),
  IDENTITY_REQUIRED:
    /packetKey/.test(source) && /sourceRevision/.test(source),
};

const failed = Object.entries(gates).filter(([, ok]) => !ok).map(([name]) => name);
const report = {
  schema: 'atlas.rapids-semantic-metric-audit.v1',
  status: failed.length === 0 ? 'PROVEN_STATIC_COSINE_CONTRACT' : 'BLOCKED_WRONG_OR_IMPLICIT_METRIC',
  gates,
  failed,
  requiredMetric: 'cosine',
  representationId: 'semantic_768',
  notes: [
    'cuVS brute-force defaults to sqeuclidean; exact semantic proof must specify cosine explicitly.',
    'CAGRA must consume the same cosine geometry as the exact oracle before recall parity is meaningful.',
  ],
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = failed.length ? 1 : 0;
