import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BITFROST_STATE_MEANINGS_V1,
  BitFrostTokenFsmManagerV1,
  PARENT_ATLAS_TOPK_BOUNDARY_V1,
} from '../../sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-token-fsm-v1.js';

test('BitFrost Candidate Token FSM state meanings and TopK boundaries', () => {
  assert.equal(BITFROST_STATE_MEANINGS_V1.UNLOADED.tokenPromptMeaning, 'Not in prompt budget');
  assert.equal(BITFROST_STATE_MEANINGS_V1.ADMITTED.candidateMeaning, 'Admitted to FanoutEvidenceBundleV1, revision verified');
  assert.equal(BITFROST_STATE_MEANINGS_V1.RESIDENT.tokenPromptMeaning, 'Emitted in ContextManifestV1 prompt context');
  assert.equal(BITFROST_STATE_MEANINGS_V1.EVICTING.tokenPromptMeaning, 'Excluded from new prompts, preserved for active generation');
  assert.equal(BITFROST_STATE_MEANINGS_V1.PURGED.tokenPromptMeaning, 'Token budget reclaimed');

  const b = PARENT_ATLAS_TOPK_BOUNDARY_V1;
  assert.equal(b.qdrant_ann.needTopK, true);
  assert.equal(b.postgres_fts_trigram.needPagination, true);
  assert.equal(b.ornith_answer_generation.needTopK, true);
});

test('BitFrostTokenFsmManagerV1 enforces slot transitions and token budgets', () => {
  const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 100 });

  // 1. Register candidate as UNLOADED
  fsm.registerUnloaded({
    candidateOrdinal: 1,
    packetKey: 'pkt_test1',
    sourceRef: 'src/lib/test.ts',
    sourceRevision: 'rev:1',
    tokenCount: 40,
  });

  const slot0 = fsm.getSlot(1);
  assert.equal(slot0?.state, 'UNLOADED');

  // 2. Admit candidate
  fsm.admitCandidate({
    candidateOrdinal: 1,
    sourceRevision: 'rev:1',
    expectedRevision: 'rev:1',
  });

  const slot1 = fsm.getSlot(1);
  assert.equal(slot1?.state, 'ADMITTED');

  // 3. Promote to Resident
  fsm.promoteToResident({
    candidateOrdinal: 1,
    currentSourceRevision: 'rev:1',
  });
  assert.equal(fsm.getSlot(1)?.state, 'RESIDENT');
  assert.equal(fsm.getResidentTokens(), 40);

  // 4. Demote to Evicting
  fsm.demoteToEvicting(1);
  assert.equal(fsm.getSlot(1)?.state, 'EVICTING');

  // 5. Purge
  fsm.purgeCandidate(1);
  assert.equal(fsm.getSlot(1)?.state, 'PURGED');
  assert.equal(fsm.getResidentTokens(), 0);
});
