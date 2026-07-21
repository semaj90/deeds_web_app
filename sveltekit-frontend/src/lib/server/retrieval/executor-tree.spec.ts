import { describe, expect, it } from 'vitest';
import {
  APP_SIDE_CAR_EXECUTOR_TREE,
  getAppSideCarExecutorTreeStatus,
  getRerankStatus,
  rerankChunksGRPO,
  rerankToUnified,
  rerankWithCrossEncoder,
  rerankWithLangExtractGRPO,
  traceRerank,
} from './executor-tree.js';

describe('app-side retrieval executor tree', () => {
  it('exposes the canonical executor lanes', () => {
    expect(APP_SIDE_CAR_EXECUTOR_TREE).toEqual({
      crossEncoder: {
        module: './cross-encoder-reranker.js',
        exportName: 'rerankWithCrossEncoder',
      },
      langExtract: {
        module: './langextract-reranker.js',
        exportName: 'rerankWithLangExtractGRPO',
      },
      trace: {
        module: '../ai/trace-reranker.js',
        exportName: 'traceRerank',
      },
    });
  });

  it('exposes callable executor exports', () => {
    expect(typeof getRerankStatus).toBe('function');
    expect(typeof rerankWithCrossEncoder).toBe('function');
    expect(typeof rerankToUnified).toBe('function');
    expect(typeof rerankWithLangExtractGRPO).toBe('function');
    expect(typeof rerankChunksGRPO).toBe('function');
    expect(typeof traceRerank).toBe('function');
  });

  it('reports a stable tree status shape', () => {
    const status = getAppSideCarExecutorTreeStatus();

    expect(status.crossEncoder.module).toContain('cross-encoder-reranker');
    expect(status.langExtract.present).toBe(true);
    expect(status.trace.present).toBe(true);
  });
});
