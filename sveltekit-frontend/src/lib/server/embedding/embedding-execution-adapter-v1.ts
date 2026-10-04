import { createHash } from 'node:crypto';
import {
  EMBEDDINGGEMMA_TASK_MODES_V1,
  PROMPT_REVISION_UNPROMPTED,
  type EmbeddingGemmaTaskModeV1,
} from './embedding-contract-768.js';
import { checkVectorShapeV1 } from './embedding-provider-v1.js';
import { formatEmbeddingGemmaInputV1 } from '../atlas/embedding/embeddinggemma-task-representation-v1.js';

export type EmbeddingInputModeV1 = 'unprompted_legacy' | (typeof EMBEDDINGGEMMA_TASK_MODES_V1)[number];

export interface EmbeddingInputRecipeV1 {
  mode: EmbeddingInputModeV1;
  promptRevision: string;
  sourceTextDigest: string;
  formattedInputChecksum: string;
}

export interface EmbeddingExecutionResultV1 {
  schema: 'atlas.embedding-execution-result.v1';
  embedding: number[];
  inputRecipe: EmbeddingInputRecipeV1;
  persistencePerformed: false;
}

export interface PreparedEmbeddingInputV1 {
  formattedText: string;
  inputRecipe: EmbeddingInputRecipeV1;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function prepareEmbeddingInputV1(input: {
  text: string;
  mode?: EmbeddingInputModeV1;
  title?: string | null;
}): PreparedEmbeddingInputV1 {
  const mode = input.mode ?? 'unprompted_legacy';
  const formatted = mode === 'unprompted_legacy'
    ? null
    : formatEmbeddingGemmaInputV1({
        mode: mode as Exclude<EmbeddingGemmaTaskModeV1, 'code_query_legacy'>,
        text: input.text,
        title: input.title,
      });
  const formattedText = formatted?.formattedText ?? input.text;

  const inputRecipe: EmbeddingInputRecipeV1 = formatted
    ? {
        mode,
        promptRevision: formatted.promptRevision,
        sourceTextDigest: formatted.sourceTextDigest,
        formattedInputChecksum: formatted.formattedTextChecksum,
      }
    : {
        mode,
        promptRevision: PROMPT_REVISION_UNPROMPTED,
        sourceTextDigest: sha256(input.text),
        formattedInputChecksum: sha256(formattedText),
      };

  return { formattedText, inputRecipe };
}

export function validateEmbeddingBatchV1(value: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new Error('EMBEDDING_EXECUTOR_BATCH_INVALID:COUNT_MISMATCH');
  }
  return value.map((embedding, index) => {
    if (!Array.isArray(embedding)) {
      throw new Error(`EMBEDDING_EXECUTOR_VECTOR_INVALID:index=${index}:not_array`);
    }
    const shape = checkVectorShapeV1(embedding);
    if (!shape.ok) {
      throw new Error(`EMBEDDING_EXECUTOR_VECTOR_INVALID:index=${index}:${shape.failures.join(',')}`);
    }
    return embedding as number[];
  });
}

export async function executeEmbeddingInputV1(input: {
  text: string;
  mode?: EmbeddingInputModeV1;
  title?: string | null;
  executor: (formattedText: string) => Promise<unknown>;
}): Promise<EmbeddingExecutionResultV1> {
  const prepared = prepareEmbeddingInputV1(input);
  const [embedding] = validateEmbeddingBatchV1([await input.executor(prepared.formattedText)], 1);
  return {
    schema: 'atlas.embedding-execution-result.v1',
    embedding,
    inputRecipe: prepared.inputRecipe,
    persistencePerformed: false,
  };
}
