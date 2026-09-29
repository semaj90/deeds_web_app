import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS,
  SEMANTIC_EMBEDDING_INPUT_POLICY_REVISION,
  sha256HexPrefixed,
  type SemanticEmbeddingInputV1,
  type SemanticInputArtifactV1,
} from './semantic-input-artifact-v1.js';
import { prepareStrictEmbeddingRequestV2 } from './semantic-embedding-request-v2.js';

function fixture() {
  const fileBuffer = Buffer.from('compiler-selected bytes', 'utf8');
  const sourceRevision = sha256HexPrefixed(fileBuffer);
  const artifact: SemanticInputArtifactV1 = {
    schema: 'atlas.semantic-input-artifact.v1',
    canonicalId: 'atlas:test:answer',
    packetKey: 'packet:test:answer',
    sourceRef: 'src/answer.ts',
    sourceRevision,
    selectionPolicyRevision: 'test-selection-v1',
    segments: [{ kind: 'TEXT', startByte: 0, endByte: fileBuffer.length, checksum: sha256HexPrefixed(fileBuffer) }],
    renderedTextChecksum: sha256HexPrefixed(fileBuffer),
    tokenCount: 9,
  };
  const text = fileBuffer.toString('utf8');
  const embeddingInput: SemanticEmbeddingInputV1 = {
    schema: 'atlas.semantic-embedding-input.v1',
    canonicalId: artifact.canonicalId,
    packetKey: artifact.packetKey,
    sourceRef: artifact.sourceRef,
    sourceRevision: artifact.sourceRevision,
    contentSelectionRevision: artifact.selectionPolicyRevision,
    inputPolicyRevision: SEMANTIC_EMBEDDING_INPUT_POLICY_REVISION,
    tokenizerRevision: `sha256:${'1'.repeat(64)}`,
    maxInputTokens: SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS,
    renderedTextChecksum: artifact.renderedTextChecksum,
    embeddedInputChecksum: sha256HexPrefixed(fileBuffer),
    embeddedTokenCount: 9,
    status: 'ADMITTED',
    inputText: text,
  };
  return { artifact, fileBuffer, embeddingInput };
}

describe('prepareStrictEmbeddingRequestV2', () => {
  it('binds the exact source-selected UTF-8 and canonical artifact bytes', () => {
    const input = fixture();
    const prepared = prepareStrictEmbeddingRequestV2(input);

    expect(prepared.request.text).toBe(input.embeddingInput.inputText);
    expect(prepared.request.inputChecksum).toBe(sha256HexPrefixed(Buffer.from(prepared.request.text, 'utf8')));
    expect(prepared.request.inputArtifactChecksum).toBe(sha256HexPrefixed(prepared.artifactBytes));
    expect(prepared.request.contentSelectionRevision).toBe(input.artifact.selectionPolicyRevision);
    expect(prepared.request.inputPolicyRevision).toBe(input.embeddingInput.inputPolicyRevision);
  });

  it('rejects an artifact source revision that does not hash the supplied full file', () => {
    const input = fixture();
    const wrongRevisionArtifact = {
      ...input.artifact,
      sourceRevision: `sha256:${'0'.repeat(64)}`,
    };
    expect(() => prepareStrictEmbeddingRequestV2({ ...input, artifact: wrongRevisionArtifact }))
      .toThrow('SEMANTIC_INPUT_SOURCE_REVISION_MISMATCH');
  });

  it('produces the same artifact checksum when object property order differs', () => {
    const input = fixture();
    const reordered = Object.fromEntries(Object.entries(input.artifact).reverse()) as typeof input.artifact;
    const first = prepareStrictEmbeddingRequestV2(input);
    const second = prepareStrictEmbeddingRequestV2({ ...input, artifact: reordered });
    expect(second.request.inputArtifactChecksum).toBe(first.request.inputArtifactChecksum);
  });

  it('rejects source drift even when preparing the caller request', () => {
    const input = fixture();
    expect(() => prepareStrictEmbeddingRequestV2({
      ...input,
      fileBuffer: Buffer.from('export function answer() { return 43; }\n', 'utf8'),
    })).toThrow('SEMANTIC_INPUT_SOURCE_REVISION_MISMATCH');
  });

  it('rejects modified input text even if its submitted text checksum is recomputed', () => {
    const input = fixture();
    const alteredText = `${input.embeddingInput.inputText} changed`;
    const altered = {
      ...input.embeddingInput,
      inputText: alteredText,
      embeddedInputChecksum: sha256HexPrefixed(Buffer.from(alteredText, 'utf8')),
    } as SemanticEmbeddingInputV1;
    expect(() => prepareStrictEmbeddingRequestV2({ ...input, embeddingInput: altered }))
      .toThrow('SEMANTIC_EMBEDDING_INPUT_BYTES_MISMATCH');
  });

  it('rejects mismatched artifact identity and non-admitted input', () => {
    const input = fixture();
    expect(() => prepareStrictEmbeddingRequestV2({
      ...input,
      embeddingInput: { ...input.embeddingInput, sourceRevision: `sha256:${'2'.repeat(64)}` },
    })).toThrow('SEMANTIC_EMBEDDING_INPUT_ARTIFACT_BINDING_MISMATCH');
    expect(() => prepareStrictEmbeddingRequestV2({
      ...input,
      embeddingInput: {
        ...input.embeddingInput,
        status: 'REJECTED_OVER_BUDGET',
        embeddedTokenCount: SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS + 1,
        inputText: null,
      },
    })).toThrow('SEMANTIC_EMBEDDING_INPUT_NOT_ADMITTED');
  });
});
