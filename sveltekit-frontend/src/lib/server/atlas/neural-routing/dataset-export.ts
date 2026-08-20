import type { ToolTrainingExampleV1 } from './contracts.js';

export interface EncoderJsonlRowV1 {
  schemaVersion: 'atlas.encoder-jsonl-row.v1';
  exampleId: string;
  requestId: string;
  queryText: string;
  toolId: string;
  featureValues: number[];
  label: number;
  utility: number;
  verified: boolean;
  sourceChecksum: string;
}

export function toEncoderJsonlRows(examples: readonly ToolTrainingExampleV1[]): EncoderJsonlRowV1[] {
  return [...examples]
    .filter((example) => example.verified || example.label === 0)
    .sort((a, b) => a.exampleId.localeCompare(b.exampleId))
    .map((example) => ({
      schemaVersion: 'atlas.encoder-jsonl-row.v1',
      exampleId: example.exampleId,
      requestId: example.requestId,
      queryText: example.queryText,
      toolId: example.toolId,
      featureValues: [...example.featureValues],
      label: example.label,
      utility: example.utility,
      verified: example.verified,
      sourceChecksum: example.checksum,
    }));
}

export function serializeEncoderJsonl(examples: readonly ToolTrainingExampleV1[]): string {
  return toEncoderJsonlRows(examples).map((row) => JSON.stringify(row)).join('\n') + '\n';
}
