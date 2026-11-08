import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseGlb } from './glb-clip-sampler-v1';

describe('1928 Rubber-Hose Actor GLB & Animation Pipeline', () => {
	const glbPath = path.resolve('../static/models/rubber-hose-actor-v1.glb');
	const receiptPath = path.resolve('../.tmp/atlas/rubber-hose-v1/receipt.json');

	it('produces a valid GLB within the N64 sub-8MB memory budget', () => {
		expect(fs.existsSync(glbPath), `Expected GLB at ${glbPath}`).toBe(true);
		const bytes = fs.statSync(glbPath).size;

		// Sub-8MB budget check (hardware Expansion Pak memory boundary)
		expect(bytes).toBeLessThan(8 * 1024 * 1024);
		// Target retro footprint is under 1MB
		expect(bytes).toBeLessThan(1024 * 1024);
		expect(bytes).toBeGreaterThan(50 * 1024);
	});

	it('matches the deterministic Blender 4.3.2 export receipt', () => {
		expect(fs.existsSync(receiptPath), `Expected receipt at ${receiptPath}`).toBe(true);
		const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

		const fileBuffer = fs.readFileSync(glbPath);
		const computedSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

		expect(receipt.status).toBe('success');
		expect(receipt.model).toBe('1928_RubberHose_Actor_v1');
		expect(receipt.sha256).toBe(computedSha256);
		expect(receipt.bytes).toBe(fileBuffer.length);
		expect(receipt.limits.within_triangle_budget).toBe(true);
		expect(receipt.limits.within_byte_budget).toBe(true);
		expect(receipt.triangles).toBeLessThanOrEqual(2500);
	});

	it('parses canonical 21-bone armature and all 5 standard animation clips', () => {
		const fileBuffer = fs.readFileSync(glbPath);
		const parsed = parseGlb(fileBuffer);

		// Armature bone count
		expect(parsed.bones.length).toBeGreaterThanOrEqual(21);
		const boneNames = parsed.bones.map((b) => b.name);
		expect(boneNames).toContain('root');
		expect(boneNames).toContain('spine');
		expect(boneNames).toContain('head');
		expect(boneNames).toContain('upper_arm.L');
		expect(boneNames).toContain('upper_arm.R');
		expect(boneNames).toContain('upper_leg.L');
		expect(boneNames).toContain('upper_leg.R');

		// 5 Standard Clips
		expect(parsed.animations.length).toBe(5);
		const clipNames = parsed.animations.map((a) => a.name);
		expect(clipNames).toContain('Idle');
		expect(clipNames).toContain('Walk');
		expect(clipNames).toContain('Wave');
		expect(clipNames).toContain('Point');
		expect(clipNames).toContain('RestPose');

		for (const anim of parsed.animations) {
			expect(anim.duration).toBeGreaterThan(0);
			expect(anim.rotations.length).toBeGreaterThan(0);
		}
	});
});
