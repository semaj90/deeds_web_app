import {
  semanticEmbeddingInputV1Schema,
  semanticInputArtifactV1Schema,
  sha256HexPrefixed,
  type SemanticEmbeddingInputV1,
  type SemanticInputArtifactV1,
} from './semantic-input-artifact-v1.js';

export interface StrictEmbeddingRequestV2 {
  text: string;
  inputChecksum: string;
  inputArtifactChecksum: string;
  contentSelectionRevision: string;
  inputPolicyRevision: string;
}

export interface PreparedStrictEmbeddingRequestV2 {
  request: StrictEmbeddingRequestV2;
  /** Canonical UTF-8 artifact bytes whose digest is sent to /embed/v2. */
  artifactBytes: Buffer;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('SEMANTIC_INPUT_ARTIFACT_NOT_JSON_SERIALIZABLE');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
}

/**
 * Verify the compiler artifact against current source bytes and the admitted
 * embedding input before constructing the request envelope. The Go endpoint
 * cannot fetch compiler artifacts, so this caller-side verification is part
 * of the trust boundary; the returned checksum names canonical artifact bytes.
 */
export function prepareStrictEmbeddingRequestV2(input: {
  artifact: SemanticInputArtifactV1;
  fileBuffer: Buffer;
  embeddingInput: SemanticEmbeddingInputV1;
}): PreparedStrictEmbeddingRequestV2 {
  const artifact = semanticInputArtifactV1Schema.parse(input.artifact);
  const embeddingInput = semanticEmbeddingInputV1Schema.parse(input.embeddingInput);

  // The admitted source binding defines sourceRevision as the SHA-256 of the
  // exact current file bytes. Segment checksums below bind selected content;
  // this full-file check independently binds those segments to that revision.
  if (sha256HexPrefixed(input.fileBuffer) !== artifact.sourceRevision) {
    throw new Error('SEMANTIC_INPUT_SOURCE_REVISION_MISMATCH');
  }

  if (embeddingInput.status !== 'ADMITTED' || embeddingInput.inputText === null) {
    throw new Error('SEMANTIC_EMBEDDING_INPUT_NOT_ADMITTED');
  }

  const segmentBytes = artifact.segments.map((segment) => {
    if (segment.endByte > input.fileBuffer.length) {
      throw new Error('SEMANTIC_INPUT_SEGMENT_OUT_OF_SOURCE_BOUNDS');
    }
    const bytes = input.fileBuffer.subarray(segment.startByte, segment.endByte);
    if (sha256HexPrefixed(bytes) !== segment.checksum) {
      throw new Error('SEMANTIC_INPUT_SOURCE_SEGMENT_CHECKSUM_MISMATCH');
    }
    return bytes;
  });
  const renderedBytes = Buffer.concat(segmentBytes);
  const renderedChecksum = sha256HexPrefixed(renderedBytes);
  if (renderedChecksum !== artifact.renderedTextChecksum) {
    throw new Error('SEMANTIC_INPUT_RENDERED_CHECKSUM_MISMATCH');
  }

  const renderedText = renderedBytes.toString('utf8');
  if (!Buffer.from(renderedText, 'utf8').equals(renderedBytes)) {
    throw new Error('SEMANTIC_INPUT_INVALID_UTF8_ROUNDTRIP');
  }
  if (embeddingInput.inputText !== renderedText
    || embeddingInput.embeddedInputChecksum !== sha256HexPrefixed(renderedBytes)
    || embeddingInput.renderedTextChecksum !== renderedChecksum) {
    throw new Error('SEMANTIC_EMBEDDING_INPUT_BYTES_MISMATCH');
  }
  if (embeddingInput.canonicalId !== artifact.canonicalId
    || embeddingInput.packetKey !== artifact.packetKey
    || embeddingInput.sourceRef !== artifact.sourceRef
    || embeddingInput.sourceRevision !== artifact.sourceRevision
    || embeddingInput.contentSelectionRevision !== artifact.selectionPolicyRevision) {
    throw new Error('SEMANTIC_EMBEDDING_INPUT_ARTIFACT_BINDING_MISMATCH');
  }

  const artifactBytes = Buffer.from(canonicalJson(artifact), 'utf8');
  const request: StrictEmbeddingRequestV2 = {
    text: renderedText,
    inputChecksum: sha256HexPrefixed(renderedBytes),
    inputArtifactChecksum: sha256HexPrefixed(artifactBytes),
    contentSelectionRevision: artifact.selectionPolicyRevision,
    inputPolicyRevision: embeddingInput.inputPolicyRevision,
  };
  return { request, artifactBytes };
}
