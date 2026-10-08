import { strict as assert } from 'node:assert';
import { evaluateJournalInventory } from './audit-durable-journal-receipt-v1.mjs';
const names=['execution_runs','execution_journal_steps','execution_dependencies','execution_side_effects'];
const base={
 schema:'atlas.durable-journal-readback.v1',readOnly:true,
 tables:names.map(name=>({name,present:true,indexCount:1,columns:name==='execution_journal_steps'
 ? ['run_id','lease_id','lease_expires_at','generation','state_version']:['id']})),
 allTablesPresent:true,fencingColumnsPresent:true,
};
assert.equal(evaluateJournalInventory(base).status,'SCHEMA_CANDIDATE_ONLY');
assert.equal(evaluateJournalInventory(base).claimActivationAuthorized,false);
const missing=structuredClone(base);
missing.tables[1].columns=['run_id'];
missing.fencingColumnsPresent=false;
assert.equal(evaluateJournalInventory(missing).status,'BLOCKED');
assert(evaluateJournalInventory(missing).errors.includes('MISSING_FENCING:lease_id'));
const duplicates=structuredClone(base);
duplicates.tables.push({...duplicates.tables[0]});
assert(evaluateJournalInventory(duplicates).errors.includes('DUPLICATE_OR_INVALID_TABLE'));
console.log('journal inventory validator: 3 fixture cases PASS');
