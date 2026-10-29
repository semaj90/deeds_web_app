export async function mapBoundedV1<T, R>(
	items: readonly T[],
	concurrency: number,
	mapItem: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
		throw new RangeError('Concurrency must be a positive integer');
	}

	const results = new Array<R>(items.length);
	let nextIndex = 0;
	let failed = false;
	let failure: unknown;

	const worker = async () => {
		while (!failed) {
			const index = nextIndex++;
			if (index >= items.length) return;
			try {
				results[index] = await mapItem(items[index], index);
			} catch (error) {
				if (!failed) failure = error;
				failed = true;
			}
		}
	};

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	if (failed) throw failure;
	return results;
}
