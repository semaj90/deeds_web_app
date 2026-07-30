import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'langgraph-client.ts'), 'utf8');

describe('langgraph client contract', () => {
  it('describes the 512 candidate lane and not a 384-first lane', () => {
    expect(source).toContain('REFERENCE_ONLY: 512-dim candidate lane');
    expect(source).toContain('"semantic_512"');
    expect(source).not.toContain('"semantic_384"');
  });

  it('keeps the ontology and identity contract fields', () => {
    expect(source).toContain('packet_identity: PacketIdentityV1');
    expect(source).toContain('OntologyObservationV1');
    expect(source).toContain('workspace_revision');
  });
});
