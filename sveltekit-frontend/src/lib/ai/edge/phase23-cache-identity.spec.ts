import { describe, expect, it } from 'vitest';
import { edgeCacheKey, validateCacheEntry } from './phase23-cache-identity.js';
const id={modelId:'e2b',modelRevision:'r1',tokenizerDigest:'t',runtimeRevision:'v',taskSchema:'extract.v1',promptRevision:'p',sourceRevision:'s'};
describe('EDGE-07 cache identity and TTL',()=>{
  it('revisions invalidate keys',()=>expect(edgeCacheKey(id,'c')).not.toBe(edgeCacheKey({...id,sourceRevision:'s2'},'c')));
  it('rejects unknown revisions',()=>expect(()=>edgeCacheKey({...id,modelRevision:'UNPINNED'},'c')).toThrow());
  it('expires and rejects mismatched keys',()=>{ const k=edgeCacheKey(id,'c');const e={key:k,createdAt:1,expiresAt:10,value:'ok'};expect(validateCacheEntry(e,k,9)).toBe('ok');expect(validateCacheEntry(e,k,10)).toBeUndefined();expect(validateCacheEntry(e,'different',9)).toBeUndefined();});
});
