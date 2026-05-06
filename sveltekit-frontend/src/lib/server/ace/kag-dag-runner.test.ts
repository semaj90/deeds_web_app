import { describe, it, expect, vi } from 'vitest';
import { KagDagRunner, type DagContext } from './kag-dag-runner.js';

// Mock DB
vi.mock('$lib/server/db/client.js', () => ({
    db: {
        insert: () => ({ values: () => ({ catch: () => Promise.resolve() }) }),
        update: () => ({ set: () => ({ where: () => ({ where: () => ({ catch: () => Promise.resolve() }) }) }) })
    }
}));

describe('KagDagRunner', () => {
    it('should skip expensive nodes if cacheHit is true', async () => {
        const runner = new KagDagRunner();
        
        let rerankCalled = false;
        let synthesisCalled = false;
        
        runner.register({
            name: 'normalize_query',
            dependsOn: [],
            run: async (ctx) => ({ normalizedQuery: ctx.query.toLowerCase() })
        });
        
        runner.register({
            name: 'check_prior_answer_cache',
            dependsOn: ['normalize_query'],
            run: async (ctx) => {
                // Mock a cache hit
                return { cacheHit: true, finalAnswer: '42' };
            }
        });
        
        runner.register({
            name: 'ace_rerank',
            dependsOn: ['check_prior_answer_cache'],
            run: async (ctx) => {
                rerankCalled = true;
                return {};
            }
        });
        
        runner.register({
            name: 'gemma4_synthesis',
            dependsOn: ['ace_rerank'],
            run: async (ctx) => {
                synthesisCalled = true;
                return {};
            }
        });

        runner.register({
            name: 'write_audit',
            dependsOn: ['record_cache'],
            run: async (ctx) => {
                return {};
            }
        });

        // Add dummy nodes so execution plan doesn't fail missing ones
        const executionPlan = [
            'extract_entities',
            'embed_query',
            'search_centroid_clusters',
            'search_qdrant_chunks',
            'expand_graph_neighbors',
            'resolve_agents_md_context',
            'fetch_llm_summaries',
            'record_cache'
        ];
        for (const name of executionPlan) {
            runner.register({ name: name as any, dependsOn: [], run: async () => ({}) });
        }

        const result = await runner.execute('What is the meaning of life?', 'hash123');
        
        expect(result.cacheHit).toBe(true);
        expect(result.finalAnswer).toBe('42');
        
        // Assert expensive nodes were skipped
        expect(rerankCalled).toBe(false);
        expect(synthesisCalled).toBe(false);
    });
});
