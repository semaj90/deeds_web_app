export const LARGE_CORPUS_WORKER_LIMIT_V1 = 16;
export const LARGE_CORPUS_WORKER_DEFAULT_V1 = 8;

export function resolveLargeCorpusWorkerCountV1(argv, parallelism) {
	if (!Number.isSafeInteger(parallelism) || parallelism < 1) {
		throw new TypeError('parallelism must be a positive safe integer');
	}
	const option = argv.find((arg) => arg.startsWith('--workers='));
	if (!option) {
		return Math.max(1, Math.min(LARGE_CORPUS_WORKER_DEFAULT_V1, parallelism - 1));
	}
	const raw = option.slice('--workers='.length);
	if (!/^[1-9]\d*$/.test(raw)) throw new Error('--workers must be an integer from 1 to 16');
	const workers = Number(raw);
	if (!Number.isSafeInteger(workers) || workers > LARGE_CORPUS_WORKER_LIMIT_V1) {
		throw new Error('--workers must be an integer from 1 to 16');
	}
	return workers;
}
