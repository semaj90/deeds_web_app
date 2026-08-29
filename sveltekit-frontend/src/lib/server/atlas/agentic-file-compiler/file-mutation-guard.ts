import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { FileMutationPlanSchema, mutationPlanIntentDigest, sha256Stable, type FileMutationPlanV1 } from './contracts.js';

function sha256Bytes(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function isInside(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export interface MutationPreflightResult {
	ok: boolean;
	targetAbsolutePath: string;
	destinationAbsolutePath?: string;
	beforeChecksum?: string;
	errors: string[];
}

export function preflightFileMutation(planInput: FileMutationPlanV1, workspaceRoot: string): MutationPreflightResult {
	const plan = FileMutationPlanSchema.parse(planInput);
	const root = resolve(workspaceRoot);
	const target = resolve(root, normalize(plan.targetPath));
	const destination = plan.destinationPath ? resolve(root, normalize(plan.destinationPath)) : undefined;
	const allowedRoots = plan.allowedRoots.map((item) => resolve(root, item));
	const forbiddenRoots = plan.forbiddenRoots.map((item) => resolve(root, item));
	const errors: string[] = [];
	const { approvalReceipt, planChecksum, ...planWithoutApproval } = plan;
	const expectedPlanDigest = mutationPlanIntentDigest(planWithoutApproval);
	if (approvalReceipt.approvedPlanDigest !== expectedPlanDigest) errors.push('approval receipt plan digest mismatch');
	const { receiptChecksum, ...receiptWithoutChecksum } = approvalReceipt;
	if (receiptChecksum !== sha256Stable(receiptWithoutChecksum)) errors.push('approval receipt checksum mismatch');
	if (planChecksum !== sha256Stable({ ...planWithoutApproval, approvalReceipt })) errors.push('mutation plan checksum mismatch');

	for (const candidate of [target, ...(destination ? [destination] : [])]) {
		if (!allowedRoots.some((allowed) => isInside(allowed, candidate))) errors.push(`path outside allowedRoots: ${candidate}`);
		if (forbiddenRoots.some((forbidden) => isInside(forbidden, candidate))) errors.push(`path inside forbiddenRoots: ${candidate}`);
	}

	const exists = existsSync(target);
	let beforeChecksum: string | undefined;
	if (exists) beforeChecksum = sha256Bytes(readFileSync(target));

	if (plan.operation === 'CREATE' && plan.expectedAbsent === true && exists) {
		errors.push('CREATE expected target to be absent');
	}
	if (['PATCH', 'RENAME', 'DELETE'].includes(plan.operation) && !exists) {
		errors.push(`${plan.operation} target does not exist`);
	}
	if (plan.expectedExistingChecksum && beforeChecksum !== plan.expectedExistingChecksum) {
		errors.push('existing checksum mismatch');
	}
	if (plan.operation === 'RENAME' && !destination) {
		errors.push('RENAME requires destinationPath');
	}
	if (plan.validationNodeIds.length === 0) {
		errors.push('mutation plan requires at least one validation node');
	}

	return {
		ok: errors.length === 0,
		targetAbsolutePath: target,
		...(destination ? { destinationAbsolutePath: destination } : {}),
		...(beforeChecksum ? { beforeChecksum } : {}),
		errors,
	};
}
