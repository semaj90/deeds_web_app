import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OntologyLinkedTupleV1Schema, type OntologyLinkedTupleV1 } from './ontology-linked-tuple-v1.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../');
const fixturePath = resolve(repoRoot, 'docs/reports/fixtures/ontology-linked-tuple-fixture-v1.json');
const pythonArrowRoundTrip = [
  'import json, sys',
  'from parent_atlas_ontology.arrow_adapter import from_arrow_table, ipc_bytes_to_table, table_to_ipc_bytes, to_arrow_table',
  'from parent_atlas_ontology.models import OntologyLinkedTupleV1',
  'value = OntologyLinkedTupleV1.from_dict(json.load(sys.stdin))',
  'encoded = table_to_ipc_bytes(to_arrow_table([value]))',
  'readback = from_arrow_table(ipc_bytes_to_table(encoded))[0]',
  'sys.stdout.write(json.dumps(readback.to_dict(), separators=(",", ":")))',
].join('; ');

const nullableProvenanceFields = [
  'sourceRevision', 'workspaceRevision', 'taskRevision', 'evidenceCardChecksum', 'evidenceSpanChecksum',
  'representationId', 'representationRevision', 'producerId', 'producerRevision', 'featureRevision',
  'graphRevision', 'ontologyRevision', 'modelRevision', 'inputDigest', 'outputDigest', 'generatedAt',
  'lastVerifiedAt',
] as const;

function normalizeNullableOptionals(tuple: OntologyLinkedTupleV1): OntologyLinkedTupleV1 {
  const provenance = { ...tuple.provenance };
  for (const field of nullableProvenanceFields) provenance[field] = provenance[field] ?? null;
  return {
    ...tuple,
    tokenIndex: tuple.tokenIndex ?? null,
    partOfSpeech: tuple.partOfSpeech ?? null,
    participants: tuple.participants.map((participant) => ({ ...participant, label: participant.label ?? null })),
    provenance,
  };
}

describe('OntologyLinkedTupleV1 TypeScript/Python Arrow IPC bridge', () => {
  it('preserves the validated tuple across Python Arrow IPC and JSON readback', () => {
    const source = OntologyLinkedTupleV1Schema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
    const configuredPython = process.env.ATLAS_PYTHON_EXECUTABLE;
    const python = configuredPython ?? (process.platform === 'win32' ? 'py' : 'python3');
    const args = configuredPython
      ? ['-c', pythonArrowRoundTrip]
      : process.platform === 'win32'
        ? ['-3.13', '-c', pythonArrowRoundTrip]
        : ['-c', pythonArrowRoundTrip];
    const pythonPath = resolve(repoRoot, 'python');
    const existingPythonPath = process.env.PYTHONPATH;
    const result = spawnSync(python, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      input: JSON.stringify(source),
      timeout: 30000,
      env: {
        ...process.env,
        PYTHONPATH: [pythonPath, existingPythonPath].filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
      },
    });

    expect(result.error?.message).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const readback = OntologyLinkedTupleV1Schema.parse(JSON.parse(result.stdout));
    expect(normalizeNullableOptionals(readback)).toEqual(normalizeNullableOptionals(source));
  });
});
