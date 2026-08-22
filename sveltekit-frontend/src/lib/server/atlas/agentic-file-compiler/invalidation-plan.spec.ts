import { describe, expect, it } from 'vitest';
import { buildInvalidationPlan } from './invalidation-plan.js';
describe('invalidation plan',()=>{it('keeps CAGRA/DiskANN refresh lazy',()=>{const p=buildInvalidationPlan({mutationId:'m',sourceRefs:['a.ts'],workspaceRevision:'w2',sourceRevisionAfter:'s2'});expect(p.lazyRefresh).toContain('cagra');expect(p.lazyRefresh).toContain('diskann');expect(p.eagerRefresh).not.toContain('cagra');});});
