/**
 * Depth producer wrapper (v1). Runs the Python Depth-Anything-V2-Small worker, validates its
 * receipt and output hashes, and hands the PNG to the existing planning-only attachment owner.
 *
 * Writes nothing: no SeaweedFS, no PostgreSQL. The returned plan is planOnly/writesPerformed:false.
 * Persistence is a separate, authorized step.
 *
 * Alignment: the depth raster is produced at the source's EXIF-oriented resolution. Its size must
 * equal the oriented source size, so YOLOX/SAM 2 pixel coordinates index the same grid.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { createDepthAttachmentPlanV1 } from './depth-attachment-plan-v1';

export const DEPTH_MODEL_ID_V1 = 'depth-anything/Depth-Anything-V2-Small-hf';
export const DEPTH_MODEL_REVISION_V1 = '5426e4f0f36572d16453bbda7a8389317b1bef99';
const RECEIPT_SCHEMA = 'atlas-depth-anything-receipt.v1';
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_STDERR_CHARS = 4000;

export type DepthWorkerRequest = {
	python: string;
	script: string;
	args: string[];
	timeoutMs: number;
};

export type DepthWorkerRunner = (req: DepthWorkerRequest) => Promise<{ exitCode: number; stderr: string }>;

/** Default runner: no shell, argument array only, bounded time, bounded stderr. */
export const spawnDepthWorker: DepthWorkerRunner = (req) =>
	new Promise((resolve, reject) => {
		const child = spawn(req.python, [req.script, ...req.args], { shell: false, windowsHide: true });
		let stderr = '';
		child.stderr.on('data', (chunk: Buffer) => {
			if (stderr.length < MAX_STDERR_CHARS) stderr += chunk.toString('utf8');
		});
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error('DEPTH_WORKER_TIMEOUT'));
		}, req.timeoutMs);
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ exitCode: code ?? -1, stderr: stderr.slice(0, MAX_STDERR_CHARS) });
		});
	});

export type DepthProducerInputV1 = {
	evidenceId: string;
	caseId: string | null;
	bucket: string;
	imagePath: string;
	sourceBytes: Buffer;
	currentSourceRevision: string;
	existingAiAnalysis?: Record<string, unknown>;
	outDir: string;
};

export type DepthProducerDepsV1 = {
	python: string;
	script: string;
	runner?: DepthWorkerRunner;
	timeoutMs?: number;
};

type Receipt = {
	schema: string;
	model: { id: string; revision: string };
	depthType: string;
	input: { sha256: string; width: number; height: number };
	output: { npy: string; pngSha256: string; width: number; height: number };
};

const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function produceDepthAttachmentPlanV1(input: DepthProducerInputV1, deps: DepthProducerDepsV1) {
	const sourceRevision = `sha256:${sha256Hex(input.sourceBytes)}`;
	if (sourceRevision !== input.currentSourceRevision.toLowerCase()) {
		throw new Error('SOURCE_REVISION_MISMATCH');
	}

	const runner = deps.runner ?? spawnDepthWorker;
	const result = await runner({
		python: deps.python,
		script: deps.script,
		args: ['--image', input.imagePath, '--out-dir', input.outDir],
		timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
	});
	if (result.exitCode !== 0) {
		throw new Error(`DEPTH_WORKER_FAILED_EXIT_${result.exitCode}`);
	}

	const receipt = JSON.parse(await readFile(join(input.outDir, 'receipt.json'), 'utf8')) as Receipt;
	if (receipt.schema !== RECEIPT_SCHEMA) throw new Error('DEPTH_RECEIPT_SCHEMA_MISMATCH');
	if (receipt.model.id !== DEPTH_MODEL_ID_V1 || receipt.model.revision !== DEPTH_MODEL_REVISION_V1) {
		throw new Error('DEPTH_MODEL_IDENTITY_MISMATCH');
	}
	if (receipt.depthType !== 'relative_monocular') throw new Error('DEPTH_TYPE_MISMATCH');
	if (receipt.input.sha256 !== sourceRevision) throw new Error('DEPTH_RECEIPT_SOURCE_MISMATCH');

	const pngBytes = await readFile(join(input.outDir, 'depth_u8.png'));
	if (`sha256:${sha256Hex(pngBytes)}` !== receipt.output.pngSha256) {
		throw new Error('DEPTH_ARTIFACT_HASH_MISMATCH');
	}

	// Alignment: depth raster size must equal the EXIF-oriented source size.
	const oriented = await sharp(input.sourceBytes).rotate().metadata();
	if (oriented.width !== receipt.input.width || oriented.height !== receipt.input.height) {
		throw new Error('DEPTH_SOURCE_DIMENSION_MISMATCH');
	}

	const plan = await createDepthAttachmentPlanV1({
		caseId: input.caseId,
		evidenceId: input.evidenceId,
		bucket: input.bucket,
		currentSourceRevision: sourceRevision,
		sourceBytes: input.sourceBytes,
		artifactBytes: pngBytes,
		modelId: DEPTH_MODEL_ID_V1,
		modelRevision: receipt.model.revision,
		modelRevisionStatus: 'VERIFIED',
		// Not verified against the model card here; the planner accepts UNVERIFIED.
		modelLicense: 'UNVERIFIED',
		depthType: 'relative_monocular',
		existingAiAnalysis: input.existingAiAnalysis ?? {}
	});

	if (plan.dimensions.width !== receipt.output.width || plan.dimensions.height !== receipt.output.height) {
		throw new Error('DEPTH_PNG_DIMENSION_MISMATCH');
	}
	return { plan, npyPath: receipt.output.npy, pngBytes, receipt };
}
