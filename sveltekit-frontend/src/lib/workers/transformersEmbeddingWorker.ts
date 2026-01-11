self.onmessage = async (e: MessageEvent) => {
	const text = e.data;
	try {
		// dynamic import of optional dependency
		const transformers = await import('@xenova/transformers');
		if (!transformers?.pipeline) {
			self.postMessage({ error: 'pipeline not available' });
			return;
		}

		// run feature-extraction pipeline (model chosen for compact embeddings)
		const pipe = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
		const out = await pipe(String(text));

		// flatten nested arrays into a single numeric array
		const flatten = (arr: unknown): number[] =>
			Array.isArray(arr) ? arr.flatMap(flatten) : typeof arr === 'number' ? [arr] : [];

		const flat = flatten(out);
		self.postMessage({ embedding: flat });
	} catch (err) {
		self.postMessage({ error: String(err) });
	}
};



