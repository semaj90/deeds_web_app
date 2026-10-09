function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function softmax(logits: number[], temperature: number): number[] {
	const temp = Math.max(temperature, 1e-4);
	const scaled = logits.map((value) => value / temp);
	const maxLogit = Math.max(...scaled);
	const exponentials = scaled.map((value) => Math.exp(value - maxLogit));
	const total = exponentials.reduce((sum, value) => sum + value, 0);
	return exponentials.map((value) => value / Math.max(total, 1e-12));
}

export function topKTopPSample(logits: number[], topK: number, topP: number, temperature: number): number {
	if (logits.length === 0 || logits.some((value) => Number.isNaN(value) || value === Infinity)) {
		throw new RangeError('INVALID_LOGITS');
	}
	if (temperature <= 0) {
		return greedyTokenId(logits);
	}

	const ranked = logits
		.map((value, index) => ({ value, index }))
		.filter((candidate) => Number.isFinite(candidate.value))
		.sort((left, right) => right.value - left.value || left.index - right.index);
	if (ranked.length === 0) throw new RangeError('ALL_LOGITS_MASKED');
	const candidates = ranked.slice(0, clamp(Math.floor(topK), 1, ranked.length));
	const probabilities = softmax(candidates.map((candidate) => candidate.value), temperature);
	const nucleus: Array<{ tokenId: number; probability: number }> = [];
	let cumulative = 0;
	const threshold = clamp(topP, 0.05, 1);
	for (let index = 0; index < candidates.length; index += 1) {
		nucleus.push({ tokenId: candidates[index].index, probability: probabilities[index] });
		cumulative += probabilities[index];
		if (cumulative >= threshold) break;
	}
	const total = nucleus.reduce((sum, item) => sum + item.probability, 0);
	let remaining = Math.random() * Math.max(total, 1e-12);
	for (const item of nucleus) {
		remaining -= item.probability;
		if (remaining <= 0) return item.tokenId;
	}
	return nucleus[0].tokenId;
}

export function greedyTokenId(logits: ArrayLike<number>): number {
	if (logits.length === 0) throw new RangeError('EMPTY_LOGITS');
	let bestIndex = -1;
	let bestValue = -Infinity;
	for (let index = 0; index < logits.length; index += 1) {
		const value = logits[index];
		if (Number.isNaN(value)) throw new RangeError('NAN_LOGIT');
		if (value === Infinity) throw new RangeError('POSITIVE_INFINITY_LOGIT');
		if (bestIndex === -1 || value > bestValue) {
			bestIndex = index;
			bestValue = value;
		}
	}
	if (bestValue === -Infinity) throw new RangeError('ALL_LOGITS_MASKED');
	return bestIndex;
}
