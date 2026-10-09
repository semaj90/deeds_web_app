import { describe, expect, it } from 'vitest';
import { assessRepairAdmission } from './phase23-repair-admission.js';
import { toRepairTask } from './phase23-agent-repair.js';
const task = toRepairTask({ assetId: 'e2b', status: 'MISSING', localUrl: '/m', sourceUrl: 'https://huggingface.co/repo', message: 'missing', repairCode: 'ASSET_MISSING' })!;
describe('EDGE-09 proposal admission', () => {
  it('rejects unapproved repair', () => expect(assessRepairAdmission(task).status).toBe('NOT_AUTHORIZED'));
  it('never executes even with a complete synthetic proof', () => {
    const v = assessRepairAdmission(task, { taskCardId: 'task', evidenceCardId: 'evidence', sourceRevision: 'r', approvalId: 'approval', capability: 'atlas.edge-model.repair.propose', expectedAction: task.action });
    expect(v.status).toBe('READY_FOR_OWNER_REVIEW');
    expect(v.execute).toBe(false);
  });
});
