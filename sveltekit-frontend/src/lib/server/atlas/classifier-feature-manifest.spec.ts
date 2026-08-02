import { describe, expect, it } from 'vitest';
import { ClassifierFeatureManifestSchema } from './feature-matrix-schema.js';

describe('ClassifierFeatureManifestSchema', () => {
  it('accepts a hybrid manifest with a 768 semantic slice and a larger total width', () => {
    const manifest = ClassifierFeatureManifestSchema.parse({
      schema_version: 'atlas.classifier.features.v1',
      semantic: {
        representation_id: 'semantic_768',
        offset: 0,
        width: 768,
        model_id: 'embeddinggemma:latest',
        model_revision: 'embeddinggemma@2026-08-02',
      },
      lexical: {
        offset: 768,
        width: 32,
        revision: 'lexical@v1',
      },
      ast: {
        offset: 800,
        width: 48,
        revision: 'ast-grep@v1',
      },
      concepts: {
        offset: 848,
        width: 64,
        revision: 'langextract@v1',
      },
      graph: {
        offset: 912,
        width: 16,
        revision: 'pagerank@v1',
      },
      topology: {
        offset: 928,
        width: 64,
        representation_id: 'latent_64',
        encoder_revision: 'som@v1',
      },
      total_width: 992,
    });

    expect(manifest.semantic.width).toBe(768);
    expect(manifest.total_width).toBe(992);
  });

  it('rejects a non-768 semantic slice even when the total width is otherwise valid', () => {
    expect(() =>
      ClassifierFeatureManifestSchema.parse({
        schema_version: 'atlas.classifier.features.v1',
        semantic: {
          representation_id: 'semantic_768',
          offset: 0,
          width: 384,
          model_id: 'embeddinggemma:latest',
          model_revision: 'embeddinggemma@2026-08-02',
        },
        lexical: {
          offset: 384,
          width: 32,
          revision: 'lexical@v1',
        },
        ast: {
          offset: 416,
          width: 48,
          revision: 'ast-grep@v1',
        },
        total_width: 464,
      })
    ).toThrow(/768/);
  });
});
