import assert from 'node:assert/strict';
import test from 'node:test';
import { hasForbiddenMigrationMutation } from './audit-openspec-evidence-migration-v1.mjs';

test('does not mistake append-only trigger declarations for applied mutations', () => {
  assert.equal(hasForbiddenMigrationMutation(`
    CREATE TRIGGER revisions_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON public.revisions
    FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
  `), false);
});

test('rejects data mutations and destructive schema operations', () => {
  assert.equal(hasForbiddenMigrationMutation('INSERT INTO public.tasks VALUES (1);'), true);
  assert.equal(hasForbiddenMigrationMutation('UPDATE public.tasks SET state = \'x\';'), true);
  assert.equal(hasForbiddenMigrationMutation('ALTER TABLE public.tasks DROP COLUMN claim;'), true);
  assert.equal(hasForbiddenMigrationMutation('-- DELETE FROM tasks;\nSELECT 1;'), false);
});
