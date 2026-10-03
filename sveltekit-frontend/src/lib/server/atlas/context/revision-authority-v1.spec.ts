// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildRevisionAuthorityEnvelopeV1,
  contentAddressedRevisionV1,
  verifyContentAddressedRevisionV1,
} from './revision-authority-v1.js';

const policy = { lanes: ['semantic_768', 'lexical'], rrfK: 60, pageCap: 3 };
const playbook = { sections: ['source', 'semantic', 'topology'], budgetTokens: 4000 };

describe('ACE-REV-01 content-addressed revisions', () => {
  it('is deterministic and independent of key order', () => {
    const a = contentAddressedRevisionV1('retrieval-policy', policy);
    const b = contentAddressedRevisionV1('retrieval-policy', { pageCap: 3, rrfK: 60, lanes: ['semantic_768', 'lexical'] });
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });

  it('any config change produces a new revision (automatic cache invalidation)', () => {
    const base = contentAddressedRevisionV1('retrieval-policy', policy);
    expect(contentAddressedRevisionV1('retrieval-policy', { ...policy, rrfK: 61 })).not.toBe(base);
    expect(contentAddressedRevisionV1('retrieval-policy', { ...policy, lanes: ['lexical', 'semantic_768'] })).not.toBe(base);
  });

  it('kind is part of the digest: the same config is a different policy vs playbook revision', () => {
    expect(contentAddressedRevisionV1('retrieval-policy', policy)).not.toBe(contentAddressedRevisionV1('ace-playbook', policy));
  });

  it('rejects hand-set labels and mismatched digests, fails closed on bad config', () => {
    for (const label of ['v1', 'policy:r1', 'playbook:r1', '', 'sha256:abc', null, 1]) {
      expect(verifyContentAddressedRevisionV1('retrieval-policy', label, policy)).toEqual({ ok: false, reason: 'NOT_CONTENT_ADDRESSED' });
    }
    const other = contentAddressedRevisionV1('retrieval-policy', { ...policy, rrfK: 1 });
    expect(verifyContentAddressedRevisionV1('retrieval-policy', other, policy)).toEqual({ ok: false, reason: 'CONFIG_DIGEST_MISMATCH' });
    const good = contentAddressedRevisionV1('retrieval-policy', policy);
    expect(verifyContentAddressedRevisionV1('retrieval-policy', good, policy)).toEqual({ ok: true, revision: good });
    expect(verifyContentAddressedRevisionV1('retrieval-policy', good, [])).toEqual({ ok: false, reason: 'INVALID_CONFIG' });
    expect(() => contentAddressedRevisionV1('ace-playbook', {})).toThrow(/EMPTY/);
    expect(() => contentAddressedRevisionV1('ace-playbook', 'x')).toThrow(/PLAIN_OBJECT/);
  });

  it('envelope carries both revisions and never claims canonical authority', () => {
    const env = buildRevisionAuthorityEnvelopeV1({ retrievalPolicyConfig: policy, acePlaybookConfig: playbook });
    expect(env.canonicalAuthority).toBe(false);
    expect(env.retrievalPolicyRevision).not.toBe(env.acePlaybookRevision);
    expect(env.acePlaybookRevision).toBe(contentAddressedRevisionV1('ace-playbook', playbook));
  });
});
