import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JESTER_ACCESSORY_PIVOTS } from './jester-accessory-rig-v1.js';
import { buildJesterAccessoryBindingPlanV1 } from './jester-accessory-binding-v1.js';
import { JESTER_PART_COUNT } from './jester-part-bone-table-v1.js';

const bones = new Set(JESTER_ACCESSORY_PIVOTS.map((pivot) => pivot.bone));

describe('jester accessory scene binding plan', () => {
	it('keeps the copied OBJ object order aligned with the audited 81-part map', () => {
		const source = readFileSync(resolve(process.cwd(), 'static/models/courtroom/jester_accessories_v1.obj'), 'utf8');
		expect(source.match(/^o(?:\s.*)?$/gm)).toHaveLength(JESTER_PART_COUNT);
	});

	it('selects only the reviewed accessory parts and binds them to their declared bones', () => {
		const plan = buildJesterAccessoryBindingPlanV1(JESTER_PART_COUNT, bones);
		expect(plan.find((binding) => binding.pivotId === 'capA0')?.parts).toContain(25);
		expect(plan.find((binding) => binding.pivotId === 'wingAngel')?.bone).toBe('J_Bip_C_UpperChest');
		expect(plan.flatMap((binding) => binding.parts)).not.toContain(0);
	});

	it('fails closed when OBJ object order/count differs from the audited table', () => {
		expect(() => buildJesterAccessoryBindingPlanV1(JESTER_PART_COUNT - 1, bones)).toThrow('PART_COUNT_MISMATCH');
	});

	it('fails closed rather than guessing when a required humanoid bone is absent', () => {
		const partialBones = new Set([...bones].filter((bone) => bone !== 'J_Bip_C_Head'));
		expect(() => buildJesterAccessoryBindingPlanV1(JESTER_PART_COUNT, partialBones)).toThrow('BONE_MISSING');
	});
});
