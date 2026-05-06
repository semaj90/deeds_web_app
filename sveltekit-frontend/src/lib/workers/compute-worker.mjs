/**
 * Compute Worker — runs CPU-bound tasks off the main event loop.
 *
 * Self-contained: all math functions are inlined (no imports).
 * Handles: kmeans, som, forensics, silhouette
 *
 * Protocol: receives { taskId, type, payload }, sends back { taskId, result } or { taskId, error }
 */

import { parentPort } from 'worker_threads';

// ═══════════════════════════════════════════════════════════════
// MATH PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function euclideanDistance(a, b) {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

// ═══════════════════════════════════════════════════════════════
// K-MEANS CLUSTERING
// ═══════════════════════════════════════════════════════════════

function kmeansInit(data, k) {
	const centroids = [];
	const indices = new Set();
	const firstIdx = Math.floor(Math.random() * data.length);
	centroids.push([...data[firstIdx]]);
	indices.add(firstIdx);

	for (let c = 1; c < k; c++) {
		const distances = new Float32Array(data.length);
		for (let i = 0; i < data.length; i++) {
			if (indices.has(i)) { distances[i] = 0; continue; }
			let minDist = Infinity;
			for (const centroid of centroids) {
				const d = euclideanDistance(data[i], centroid);
				if (d < minDist) minDist = d;
			}
			distances[i] = minDist * minDist;
		}
		const sumDist = distances.reduce((a, b) => a + b, 0);
		if (sumDist === 0) {
			let randIdx;
			do { randIdx = Math.floor(Math.random() * data.length); } while (indices.has(randIdx));
			centroids.push([...data[randIdx]]);
			indices.add(randIdx);
		} else {
			let cum = 0;
			const threshold = Math.random() * sumDist;
			for (let i = 0; i < data.length; i++) {
				if (!indices.has(i)) {
					cum += distances[i];
					if (cum >= threshold) {
						centroids.push([...data[i]]);
						indices.add(i);
						break;
					}
				}
			}
		}
	}
	return centroids;
}

function kmeansAssign(data, centroids) {
	const assignments = new Array(data.length);
	for (let i = 0; i < data.length; i++) {
		let minDist = Infinity;
		let best = 0;
		for (let c = 0; c < centroids.length; c++) {
			const d = euclideanDistance(data[i], centroids[c]);
			if (d < minDist) { minDist = d; best = c; }
		}
		assignments[i] = best;
	}
	return assignments;
}

function kmeansUpdate(data, assignments, k, dims) {
	const centroids = Array.from({ length: k }, () => new Array(dims).fill(0));
	const counts = new Array(k).fill(0);
	for (let i = 0; i < data.length; i++) {
		const c = assignments[i];
		counts[c]++;
		for (let d = 0; d < dims; d++) centroids[c][d] += data[i][d];
	}
	for (let c = 0; c < k; c++) {
		if (counts[c] > 0) {
			for (let d = 0; d < centroids[c].length; d++) centroids[c][d] /= counts[c];
		}
	}
	return centroids;
}

function centroidShift(old, cur) {
	let sum = 0;
	for (let c = 0; c < old.length; c++) {
		for (let d = 0; d < old[c].length; d++) {
			const diff = old[c][d] - cur[c][d];
			sum += diff * diff;
		}
	}
	return Math.sqrt(sum);
}

function computeInertia(data, assignments, centroids) {
	let inertia = 0;
	for (let i = 0; i < data.length; i++) {
		const d = euclideanDistance(data[i], centroids[assignments[i]]);
		inertia += d * d;
	}
	return inertia;
}

function computeSilhouette(data, assignments, k) {
	const groups = Array.from({ length: k }, () => []);
	for (let i = 0; i < data.length; i++) groups[assignments[i]].push(i);

	const scores = new Array(data.length);
	for (let i = 0; i < data.length; i++) {
		const cluster = assignments[i];
		const members = groups[cluster];
		let a = 0;
		if (members.length > 1) {
			for (const j of members) { if (i !== j) a += euclideanDistance(data[i], data[j]); }
			a /= members.length - 1;
		}
		let bMin = Infinity;
		for (let c = 0; c < k; c++) {
			if (c === cluster || groups[c].length === 0) continue;
			let bSum = 0;
			for (const j of groups[c]) bSum += euclideanDistance(data[i], data[j]);
			bMin = Math.min(bMin, bSum / groups[c].length);
		}
		if (bMin === Infinity) { scores[i] = 0; }
		else { const denom = Math.max(a, bMin); scores[i] = denom > 0 ? (bMin - a) / denom : 0; }
	}
	return { scores, mean: scores.reduce((a, b) => a + b, 0) / data.length };
}

function runKMeans({ embeddings, k = 15, maxIterations = 100, epsilon = 1e-4 }) {
	if (embeddings.length === 0) throw new Error('Empty dataset');
	const actualK = Math.min(k, Math.max(1, embeddings.length - 1));
	const dims = embeddings[0].length;
	let centroids = kmeansInit(embeddings, actualK);
	let assignments = kmeansAssign(embeddings, centroids);
	let iterations = 0;
	while (iterations < maxIterations) {
		const newCentroids = kmeansUpdate(embeddings, assignments, actualK, dims);
		const shift = centroidShift(centroids, newCentroids);
		centroids = newCentroids;
		assignments = kmeansAssign(embeddings, centroids);
		iterations++;
		if (shift < epsilon) break;
	}
	const inertia = computeInertia(embeddings, assignments, centroids);
	const sil = computeSilhouette(embeddings, assignments, actualK);
	return { clusters: assignments, centroids, silhouetteScore: sil.mean, iterations, inertia };
}

// ═══════════════════════════════════════════════════════════════
// SOM (SELF-ORGANIZING MAP)
// ═══════════════════════════════════════════════════════════════

function runSOM({ embeddings, gridWidth = 5, gridHeight = 5, maxIterations = 100, learningRate = 0.5, radius }) {
	if (embeddings.length === 0) throw new Error('Empty dataset');
	const dims = embeddings[0].length;
	const initRadius = radius ?? Math.sqrt(gridWidth * gridWidth + gridHeight * gridHeight) / 2;

	// Init grid with random weights
	const grid = [];
	for (let x = 0; x < gridWidth; x++) {
		grid[x] = [];
		for (let y = 0; y < gridHeight; y++) {
			const w = new Array(dims);
			for (let d = 0; d < dims; d++) w[d] = Math.random() * 0.1 - 0.05;
			grid[x][y] = w;
		}
	}

	function findBMU(input) {
		let minD = Infinity, bx = 0, by = 0;
		for (let x = 0; x < gridWidth; x++) {
			for (let y = 0; y < gridHeight; y++) {
				const d = euclideanDistance(input, grid[x][y]);
				if (d < minD) { minD = d; bx = x; by = y; }
			}
		}
		return [bx, by];
	}

	// Training
	for (let iter = 0; iter < maxIterations; iter++) {
		const progress = iter / maxIterations;
		const lr = learningRate * (1 - progress);
		const r = initRadius * (1 - progress);
		const rSq = r * r;

		// Shuffle indices
		const indices = Array.from({ length: embeddings.length }, (_, i) => i);
		for (let i = indices.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[indices[i], indices[j]] = [indices[j], indices[i]];
		}

		for (const idx of indices) {
			const input = embeddings[idx];
			const [bx, by] = findBMU(input);
			for (let x = 0; x < gridWidth; x++) {
				for (let y = 0; y < gridHeight; y++) {
					const gdist = Math.abs(x - bx) + Math.abs(y - by);
					const influence = Math.exp(-(gdist * gdist) / (2 * rSq));
					if (influence < 0.001) continue;
					for (let d = 0; d < dims; d++) {
						grid[x][y][d] += lr * influence * (input[d] - grid[x][y][d]);
					}
				}
			}
		}
	}

	// Assign clusters
	const clusters = [];
	let totalQE = 0, topoErrors = 0;
	for (const input of embeddings) {
		const [bx, by] = findBMU(input);
		clusters.push(by * gridWidth + bx);
		totalQE += euclideanDistance(input, grid[bx][by]);
		// Topographic error
		let secD = Infinity, sx = 0, sy = 0;
		for (let x = 0; x < gridWidth; x++) {
			for (let y = 0; y < gridHeight; y++) {
				if (x === bx && y === by) continue;
				const d = euclideanDistance(input, grid[x][y]);
				if (d < secD) { secD = d; sx = x; sy = y; }
			}
		}
		if (Math.abs(bx - sx) + Math.abs(by - sy) > 1) topoErrors++;
	}

	return {
		clusters,
		grid,
		gridWidth,
		gridHeight,
		quantizationError: totalQE / embeddings.length,
		iterations: maxIterations,
		topographicError: topoErrors / embeddings.length,
	};
}

// ═══════════════════════════════════════════════════════════════
// FORENSICS (REGEX PATTERN DETECTION)
// ═══════════════════════════════════════════════════════════════

const LEGAL_KEYWORDS = [
	{ re: 'non[-\\s]?compete', type: 'non_compete', severity: 'medium', desc: 'Non-compete clause' },
	{ re: 'arbitration', type: 'arbitration', severity: 'medium', desc: 'Arbitration mentioned' },
	{ re: 'indemnif(?:y|ication)', type: 'indemnification', severity: 'medium', desc: 'Indemnification' },
	{ re: 'attorney[- ]client', type: 'attorney_client', severity: 'medium', desc: 'Attorney-client privilege' },
	{ re: 'work product', type: 'work_product', severity: 'medium', desc: 'Work product doctrine' },
	{ re: 'settlement', type: 'settlement', severity: 'medium', desc: 'Settlement mentioned' },
	{ re: 'deposition', type: 'deposition', severity: 'low', desc: 'Deposition mentioned' },
	{ re: 'testimony', type: 'testimony', severity: 'low', desc: 'Testimony mentioned' },
	{ re: 'plaintiff', type: 'plaintiff', severity: 'low', desc: 'Plaintiff mentioned' },
	{ re: 'defendant', type: 'defendant', severity: 'low', desc: 'Defendant mentioned' },
	{ re: 'indictment', type: 'indictment', severity: 'medium', desc: 'Indictment mentioned' },
	{ re: 'subpoena', type: 'subpoena', severity: 'medium', desc: 'Subpoena mentioned' },
	{ re: 'warrant', type: 'warrant', severity: 'medium', desc: 'Warrant mentioned' },
	{ re: 'probable cause', type: 'probable_cause', severity: 'medium', desc: 'Probable cause' },
	{ re: 'confidential(?:ity)?', type: 'confidential', severity: 'low', desc: 'Confidentiality' },
	{ re: 'privileged', type: 'privileged', severity: 'low', desc: 'Privileged communication' },
	{ re: 'termination', type: 'termination', severity: 'low', desc: 'Termination mentioned' },
];
const COMPILED_KEYWORDS = LEGAL_KEYWORDS.map((kw) => ({
	...kw,
	compiled: new RegExp('\\b' + kw.re + '\\b', 'i'),
}));

function runForensics({ text }) {
	if (!text || text.trim().length === 0) return [];
	const flags = [];

	// PII: SSN
	const ssnMatches = Array.from(text.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)).slice(0, 20).map((m) => m[0]);
	if (ssnMatches.length > 0 || /\b(?:ssn|social security number)\b/i.test(text)) {
		flags.push({ type: 'PII_SSN', description: 'Document may contain Social Security Numbers', severity: 'high', metadata: { matches: ssnMatches } });
	}

	// PII: Credit card
	const ccMatches = Array.from(text.matchAll(/\b(?:\d[ -]*?){13,19}\b/g)).slice(0, 20).map((m) => m[0]).filter((s) => {
		const digits = s.replace(/\D/g, '');
		return digits.length >= 13 && digits.length <= 19;
	});
	if (ccMatches.length > 0) {
		flags.push({ type: 'PII_CREDIT_CARD', description: 'Document may contain credit card numbers', severity: 'high', metadata: { matches: ccMatches } });
	}

	// PII: Banking
	if (/\b(?:routing|account)\s*(?:number|no\.?)\b/i.test(text)) {
		flags.push({ type: 'PII_BANKING', description: 'Possible banking details', severity: 'medium' });
	}

	// Emails
	const emails = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g);
	if (emails && emails.length > 5) {
		flags.push({ type: 'many_emails', description: `Contains ${emails.length} email addresses`, severity: 'medium', metadata: { count: emails.length } });
	}

	// Phones
	const phones = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
	if (phones && phones.length > 3) {
		flags.push({ type: 'many_phones', description: `Contains ${phones.length} phone numbers`, severity: 'medium', metadata: { count: phones.length } });
	}

	// Dates
	const dates = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g);
	if (dates && dates.length > 5) {
		flags.push({ type: 'date_cluster', description: `Contains ${dates.length} dates`, severity: 'low', metadata: { count: dates.length } });
	}

	// Legal keywords
	const found = [];
	for (const kw of COMPILED_KEYWORDS) {
		if (kw.compiled.test(text)) found.push({ type: kw.type, desc: kw.desc, severity: kw.severity });
	}
	if (found.length > 0) {
		const maxSev = found.some((k) => k.severity === 'high') ? 'high' : found.some((k) => k.severity === 'medium') ? 'medium' : 'low';
		flags.push({ type: 'legal_keywords', description: `Contains ${found.length} legal term(s): ${found.map((k) => k.type).join(', ')}`, severity: maxSev, metadata: { keywords: found } });
	}

	// Large dollar amounts
	const amounts = text.match(/\$[\d,]+(?:\.\d{2})?/g);
	if (amounts) {
		const large = amounts.filter((a) => parseFloat(a.replace(/[$,]/g, '')) >= 10000);
		if (large.length > 0) {
			flags.push({ type: 'large_amounts', description: `${large.length} amount(s) >= $10,000`, severity: 'medium', metadata: { amounts: large } });
		}
	}

	// Driver's license
	if (/\b(?:driver'?s?\s*license|DL|state\s*ID)\s*(?:no\.?|number|#)?\s*:?\s*[A-Z]?\d{5,12}\b/i.test(text)) {
		flags.push({ type: 'PII_DRIVERS_LICENSE', description: "Possible driver's license", severity: 'high' });
	}

	// Passport
	if (/\bpassport\s*(?:no\.?|number|#)?\s*:?\s*[A-Z]?\d{6,9}\b/i.test(text)) {
		flags.push({ type: 'PII_PASSPORT', description: 'Possible passport number', severity: 'high' });
	}

	// Sealed
	if (/\bunder\s+seal\b|\bsealed\b|\bFILED\s+UNDER\s+SEAL\b/i.test(text)) {
		flags.push({ type: 'sealed_document', description: 'Document may be under seal', severity: 'high' });
	}

	// Expungement
	if (/\bexpung(?:e|ed|ement)\b/i.test(text)) {
		flags.push({ type: 'expungement', description: 'Expungement reference', severity: 'medium' });
	}

	return flags;
}

// ═══════════════════════════════════════════════════════════════
// BATCH COSINE SIMILARITY — cache-blocked CPU fallback
//
// TILE = 128 floats (512 bytes) — fits comfortably in L2 D-cache.
// Inner loop unrolled 8× for SIMD auto-vectorization.
//
// SharedArrayBuffer protocol (zero-copy IPC):
//   payload.sharedQuery   → SharedArrayBuffer (dim floats, query vector)
//   payload.sharedCorpus  → SharedArrayBuffer (n * dim floats, candidate pool)
//   payload.sharedScores  → SharedArrayBuffer (n floats, output — written by worker)
//   payload.n             → number of candidates
//   payload.dim           → vector dimension (typically 768)
//
// If sharedQuery/sharedCorpus are absent, falls back to plain arrays.
// ═══════════════════════════════════════════════════════════════

const TILE = 128;

function runSimilarity({ sharedQuery, sharedCorpus, sharedScores, query, corpus, n, dim }) {
	// Zero-copy path: caller passed SharedArrayBuffers (no serialization overhead)
	const q = sharedQuery
		? new Float32Array(sharedQuery)
		: new Float32Array(query);
	const C = sharedCorpus
		? new Float32Array(sharedCorpus)
		: new Float32Array(corpus);
	const scores = sharedScores
		? new Float32Array(sharedScores) // write in-place, zero-copy return
		: new Float32Array(n);

	// Pre-compute query L2 norm (single pass, cache-warm)
	let qNormSq = 0;
	for (let d = 0; d < dim; d++) qNormSq += q[d] * q[d];
	const qNorm = Math.sqrt(qNormSq) || 1e-12;

	// Score each candidate
	for (let i = 0; i < n; i++) {
		const off = i * dim;

		// Candidate L2 norm + dot product in blocked passes (L2-cache-friendly)
		let dot = 0;
		let cNormSq = 0;

		for (let b = 0; b < dim; b += TILE) {
			const end = Math.min(b + TILE, dim);

			// Unrolled 8× within the tile
			let k = b;
			for (; k + 8 <= end; k += 8) {
				const c0 = C[off + k],     c1 = C[off + k + 1], c2 = C[off + k + 2], c3 = C[off + k + 3];
				const c4 = C[off + k + 4], c5 = C[off + k + 5], c6 = C[off + k + 6], c7 = C[off + k + 7];
				dot     += q[k]*c0     + q[k+1]*c1 + q[k+2]*c2 + q[k+3]*c3
				         + q[k+4]*c4  + q[k+5]*c5 + q[k+6]*c6 + q[k+7]*c7;
				cNormSq += c0*c0 + c1*c1 + c2*c2 + c3*c3 + c4*c4 + c5*c5 + c6*c6 + c7*c7;
			}
			for (; k < end; k++) {
				dot     += q[k] * C[off + k];
				cNormSq += C[off + k] * C[off + k];
			}
		}

		scores[i] = dot / (qNorm * (Math.sqrt(cNormSq) || 1e-12));
	}

	// If using SharedArrayBuffer, scores are already written — return n + dim for ack
	return sharedScores ? { n, dim, shared: true } : { scores: Array.from(scores), n, dim };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

// Inline regex-based langextract — duplicated from native.ts to keep this worker
// self-contained (no TS resolver inside worker_threads). Kept in sync via the
// langextract-native unit tests.
const LE_PATTERNS = [
	{ type: 'citation',   re: /\b(\d{1,4})\s+(U\.?S\.?|F\.?\d?d?|S\.?\s*Ct\.?|L\.?\s*Ed\.?\s*\d?d?|N\.?E\.?\d?d?|N\.?W\.?\d?d?|S\.?E\.?\d?d?|S\.?W\.?\d?d?|P\.?\d?d?|A\.?\d?d?)\s+(\d{1,5})(?:\s*\((\d{4})\))?/g, conf: 0.95 },
	{ type: 'statute',    re: /\b(\d{1,3})\s+(U\.?S\.?C\.?|C\.?F\.?R\.?)\s*§+\s*(\d+(?:[a-z](?:-\d+)?)?(?:\([a-z0-9]+\))*)/gi, conf: 0.95 },
	{ type: 'case_name',  re: /\b([A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3})\s+v\.?\s+([A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3})\b/g, conf: 0.85 },
	{ type: 'monetary',   re: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b/gi, conf: 0.90 },
	{ type: 'date',       re: /\b\d{4}-\d{2}-\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g, conf: 0.95 },
	{ type: 'person',     re: /\b(?:Justice|Judge|Chief Justice|Senator|Representative|Attorney General|Mr\.|Ms\.|Mrs\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, conf: 0.80 },
	{ type: 'organization', re: /\b(?:ACLU|FBI|CIA|DOJ|EPA|FTC|SEC|IRS|DEA|ATF|Department\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, conf: 0.85 },
];

function runLangExtract({ text, documentId, documentType }) {
	const entities = [];
	const seen = new Set();
	for (const { type, re, conf } of LE_PATTERNS) {
		re.lastIndex = 0;
		let m;
		let count = 0;
		while ((m = re.exec(text)) !== null && count < 50) {
			const start = m.index;
			const end = start + m[0].length;
			const key = `${type}:${start}:${end}`;
			if (seen.has(key)) continue;
			seen.add(key);
			entities.push({ type, text: m[0], start, end, confidence: conf });
			count++;
		}
	}
	entities.sort((a, b) => a.start - b.start || a.type.localeCompare(b.type));
	return {
		doc_id: documentId,
		documentType,
		sections: [],   // Section detection stays on main thread (heuristic is cheap)
		entities,
		extraction_confidence: entities.length > 0 ? 0.85 : 0.4,
	};
}

const HANDLERS = {
	kmeans:                runKMeans,
	som:                   runSOM,
	forensics:             runForensics,
	silhouette:            ({ embeddings, assignments, k }) => computeSilhouette(embeddings, assignments, k),
	similarity:            runSimilarity,
	'langextract.extract': runLangExtract,
};

parentPort?.on('message', (msg) => {
	const { taskId, type, payload } = msg;
	try {
		const handler = HANDLERS[type];
		if (!handler) throw new Error(`Unknown task type: ${type}`);
		const result = handler(payload);
		parentPort?.postMessage({ taskId, result });
	} catch (err) {
		parentPort?.postMessage({ taskId, error: err.message || String(err) });
	}
});