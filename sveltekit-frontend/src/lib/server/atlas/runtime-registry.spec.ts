import { describe, expect, it } from 'vitest';
import {
  ATLAS_RUNTIME_REGISTRY,
  ATLAS_RUNTIME_REGISTRY_VERSION,
  getAtlasRuntimeRegistrySection,
  getAtlasRuntimeRegistrySnapshot,
} from './runtime-registry.js';

describe('atlas runtime registry', () => {
  it('exposes the expected control-plane sections in order', () => {
    expect(ATLAS_RUNTIME_REGISTRY_VERSION).toBe('atlas-runtime-registry-v1');
    expect(ATLAS_RUNTIME_REGISTRY.map((section) => section.id)).toEqual([
      'contract',
      'capability',
      'projection',
      'model',
      'embedding',
      'worker',
      'pipeline',
      'feature',
      'recommendation',
    ]);
  });

  it('keeps the admin and search surfaces stable', () => {
    const snapshot = getAtlasRuntimeRegistrySnapshot();

    expect(snapshot.adminPath).toBe('/admin/atlas');
    expect(snapshot.searchPath).toBe('/api/admin/atlas/registry/search');
    expect(snapshot.sections).toHaveLength(9);
  });

  it('includes the registry items needed for the current Atlas proof path', () => {
    const projection = getAtlasRuntimeRegistrySection('projection');
    const capability = getAtlasRuntimeRegistrySection('capability');
    const model = getAtlasRuntimeRegistrySection('model');
    const recommendation = getAtlasRuntimeRegistrySection('recommendation');

    expect(projection?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'hyperrag-projection-adapter',
        'projection-outbox',
        'packet-binary-registry',
      ]),
    );
    expect(capability?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'search-runtime',
        'registry-search-api',
        'langgraph-research',
      ]),
    );
    expect(model?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'gemma4-rotorquant-iq4xs-direct',
        'embeddinggemma-768d',
        'hforf-gguf',
        'embeddinggemma-300m-onnx',
        'packet-jepa-pt',
        'granite-docling-258m',
      ]),
    );
    expect(recommendation?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'agentic-recommendation-workflow',
        'langgraph-agentic-reranker',
        'hmm-tool-selector',
        'engram-registry',
      ]),
    );

    const worker = getAtlasRuntimeRegistrySection('worker');
    expect(worker?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'langgraph-dag',
        'retrieval-executor-tree',
        'daily-graphify',
      ]),
    );
  });

  it('returns defensive copies', () => {
    const original = getAtlasRuntimeRegistrySection('contract');
    expect(original).not.toBeNull();
    if (!original) return;

    original.items[0] = {
      ...original.items[0],
      title: 'mutated',
    };

    const again = getAtlasRuntimeRegistrySection('contract');
    expect(again?.items[0].title).toBe('Canonical packet envelope');
  });
});
